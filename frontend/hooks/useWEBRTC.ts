/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef, useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { Peer } from '@/lib/webrtc/peer';
import { supportsInsertableStreams, importMediaKey, attachSenderTransform, attachReceiverTransform } from '@/lib/webrtc/e2ee';
import { sendCallLogMessage, CallLogStatus } from '@/lib/callLogMessages';

export type CallType = 'audio' | 'video';
export type CallState = 'idle' | 'initiating' | 'dialing' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';

interface CallSession {
  callId: string;
  peerId: string;
  callType: CallType;
  state: CallState;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  startTime?: number;
  encryptionEnabled: boolean;
}

interface UseWebRTCOptions {
  userId: string;
  onCallStateChange?: (state: CallState, session: CallSession | null) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
  onIncomingCall?: (data: { callId: string; fromUserId: string; type: CallType }) => void;
}

export const useWebRTC = (options: UseWebRTCOptions) => {
  const { userId, onCallStateChange, onRemoteStream, onError, onIncomingCall } = options;

  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaKeyRef = useRef<CryptoKey | null>(null);
  const pendingOfferRef = useRef<{ callId: string; offer: RTCSessionDescriptionInit; callType: CallType } | null>(null);
  const iceConnectedRef = useRef<boolean>(false);
  const remoteTracksReceivedRef = useRef<boolean>(false);
  const callSessionRef = useRef<CallSession | null>(null);
  const callConnectedTimeRef = useRef<number | null>(null);
  const isCallerRef = useRef<boolean>(false);
  const outgoingCallLogMessageIdRef = useRef<string | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const incomingCallTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const negotiationInProgressRef = useRef<boolean>(false);
  const CALL_TIMEOUT_MS = 30000; // 30 seconds timeout for missed calls
  const INCOMING_CALL_TIMEOUT_MS = 40000; // 40 seconds timeout for unanswered incoming calls

  // Update call state
  const updateCallState = useCallback((newState: CallState, session: CallSession | null = null) => {
    setCallState(newState);
    if (session) {
      const updatedSession = { ...session, state: newState };
      setCallSession(updatedSession);
      callSessionRef.current = updatedSession;
    }
    onCallStateChange?.(newState, session);
  }, [onCallStateChange]);

  // Get ICE servers from backend
  const getIceServers = useCallback(async (callId: string) => {
    try {
      const response = await api.get(`/calls/${callId}`);
      return response.data.iceServers || [];
    } catch (error) {
      console.error('Failed to get ICE servers:', error);
      return [];
    }
  }, []);

  // Get local media stream
  const getLocalStream = useCallback(async (callType: CallType) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      const errorMsg = `Failed to get ${callType} stream: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      onError?.(errorMsg);
      throw error;
    }
  }, [onError]);

  // Check if connection is fully established (ICE connected + remote tracks)
  const checkConnectionEstablished = useCallback((session: CallSession) => {
    if (iceConnectedRef.current && remoteTracksReceivedRef.current) {
      callConnectedTimeRef.current = Date.now();
      // Clear timeout since call was answered
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      updateCallState('connected', session);
    }
  }, [updateCallState]);

  // Initiate call
  const initiateCall = useCallback(async (peerId: string, callType: CallType) => {
    try {
      // Reset connection flags
      iceConnectedRef.current = false;
      remoteTracksReceivedRef.current = false;
      callConnectedTimeRef.current = null;
      isCallerRef.current = true;

      updateCallState('initiating');

      // Create call session on backend
      const response = await api.post('/calls', {
        toUserId: peerId,
        type: callType
      });

      const { callId, iceServers, calleeStatus } = response.data;

      // Create session object
      const session: CallSession = {
        callId,
        peerId,
        callType,
        state: 'initiating',
        encryptionEnabled: supportsInsertableStreams()
      };

      // Get local stream
      const localStream = await getLocalStream(callType);
      session.localStream = localStream;

      // Create peer connection
      peerRef.current = new Peer(
        {
          iceServers: iceServers || [],
          iceTransportPolicy: 'all',
          encodedInsertableStreams: session.encryptionEnabled
        },
        {
          onIceCandidate: (candidate) => {
            socketService.emit('call:candidate', {
              callId,
              candidate
            });
          },
          onNegotiationNeeded: async () => {
            // CRITICAL: Prevent multiple simultaneous negotiations
            // This prevents "m-line order doesn't match" errors
            if (negotiationInProgressRef.current) {
              console.warn('⚠️ [onNegotiationNeeded] BLOCKED: Negotiation already in progress');
              return;
            }

            // CRITICAL: Only negotiate if signaling state is stable
            // This ensures we don't create offers during active negotiation
            const pc = peerRef.current?.connection;
            if (!pc || pc.signalingState !== 'stable') {
              console.warn(`⚠️ [onNegotiationNeeded] BLOCKED: Signaling state is "${pc?.signalingState}", not "stable"`);
              return;
            }

            // CRITICAL: Block renegotiation after call is connected
            // Once connected, we should not create new offers unless absolutely necessary
            if (callState === 'connected' || iceConnectedRef.current) {
              console.warn('⚠️ [onNegotiationNeeded] BLOCKED: Call already connected, skipping renegotiation');
              return;
            }

            try {
              negotiationInProgressRef.current = true;
              console.log('📞 [onNegotiationNeeded] Creating offer...');
              const offer = await peerRef.current!.createOffer();
              socketService.emit('call:offer', {
                callId,
                sdp: offer
              });
              console.log('✅ [onNegotiationNeeded] Offer created and sent');
            } catch (error) {
              console.error('❌ [onNegotiationNeeded] Failed to create offer:', error);
              onError?.(`Failed to negotiate call: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
              // Reset flag after a short delay to allow signaling state to update
              setTimeout(() => {
                negotiationInProgressRef.current = false;
              }, 100);
            }
          },
          onTrack: (event) => {
            const remoteStream = event.streams[0];
            session.remoteStream = remoteStream;
            remoteTracksReceivedRef.current = true;
            const updatedSession = { ...session };
            setCallSession(updatedSession);
            callSessionRef.current = updatedSession;
            onRemoteStream?.(remoteStream);
            // Check if connection is fully established
            checkConnectionEstablished(updatedSession);
          },
          onIceConnectionStateChange: (state) => {
            console.log('ICE connection state:', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              // Check if connection is fully established
              checkConnectionEstablished(session);
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              updateCallState('ended', session);
              endCall('missed');
            }
          },
          onConnectionStateChange: (state) => {
            console.log('Connection state:', state);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              remoteTracksReceivedRef.current = false;
              updateCallState('ended', session);
              endCall();
            }
          }
        }
      );

      peerRef.current.addLocalTracks(localStream);
      setCallSession(session);
      callSessionRef.current = session;

      // Set initial state based on callee status
      if (calleeStatus === 'offline') {
        // Callee is offline - show "Dialing..."
        updateCallState('dialing', session);
      } else {
        // Callee is online - show "Ringing..."
        updateCallState('ringing', session);
      }

      // Send outgoing call log message ONLY when call starts
      // Store the message ID so we can update it later instead of creating duplicates
      try {
        await sendCallLogMessage({
          sender: userId,
          receiver: peerId,
          callType,
          status: 'outgoing',
          callId
        });
        // Note: We can't get the message ID from the API response easily,
        // so we'll use callId to identify and update the message later
        outgoingCallLogMessageIdRef.current = callId;
      } catch (error) {
        console.error('Failed to send outgoing call log:', error);
      }

      // Set timeout for missed call - only if call is not answered
      callTimeoutRef.current = setTimeout(async () => {
        const currentSession = callSessionRef.current;
        // Only send missed if call is still ringing/connecting and hasn't been answered
        if (currentSession && currentSession.callId === callId && 
            (callState === 'ringing' || callState === 'connecting' || callState === 'dialing')) {
          console.log('⏰ Call timeout - sending missed call log');
          try {
            // Update the existing outgoing call log to missed
            await sendCallLogMessage({
              sender: userId,
              receiver: peerId,
              callType,
              status: 'missed',
              callId
            });
          } catch (error) {
            console.error('Failed to send missed call log:', error);
          }
        }
      }, CALL_TIMEOUT_MS);

      // Notify peer via socket
      socketService.emit('call:initiate', {
        callId,
        toUserId: peerId,
        type: callType
      });

    } catch (error) {
      const errorMsg = `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      onError?.(errorMsg);
      updateCallState('failed');
    }
  }, [getLocalStream, updateCallState, onRemoteStream, onError, checkConnectionEstablished]);

  // Answer incoming call
  const answerCall = useCallback(async (callId: string, offer: RTCSessionDescriptionInit | null = null, callType: CallType | null = null) => {
    try {
      // Clear incoming call timeout since call is being answered
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
      
      // Reset connection flags
      iceConnectedRef.current = false;
      remoteTracksReceivedRef.current = false;
      callConnectedTimeRef.current = null;
      isCallerRef.current = false;

      // Use stored offer if not provided
      const finalOffer = offer || pendingOfferRef.current?.offer;
      const finalCallType = callType || pendingOfferRef.current?.callType || 'audio';
      
      if (!finalOffer || !callId) {
        console.error('Cannot answer call: missing offer or callId');
        return;
      }

      updateCallState('connecting');

      const iceServers = await getIceServers(callId);
      const localStream = await getLocalStream(finalCallType);

      const session: CallSession = {
        callId,
        peerId: callSessionRef.current?.peerId || '', // Will be set by backend
        callType: finalCallType,
        state: 'connecting',
        localStream,
        encryptionEnabled: supportsInsertableStreams()
      };

      peerRef.current = new Peer(
        {
          iceServers,
          iceTransportPolicy: 'all',
          encodedInsertableStreams: session.encryptionEnabled
        },
        {
          onIceCandidate: (candidate) => {
            socketService.emit('call:candidate', {
              callId,
              candidate
            });
          },
          onTrack: (event) => {
            const remoteStream = event.streams[0];
            session.remoteStream = remoteStream;
            remoteTracksReceivedRef.current = true;
            const updatedSession = { ...session };
            setCallSession(updatedSession);
            callSessionRef.current = updatedSession;
            onRemoteStream?.(remoteStream);
            // Check if connection is fully established
            checkConnectionEstablished(updatedSession);
          },
          onIceConnectionStateChange: (state) => {
            console.log('ICE connection state:', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              // Check if connection is fully established
              checkConnectionEstablished(session);
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              updateCallState('ended', session);
              endCall('missed');
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              remoteTracksReceivedRef.current = false;
              updateCallState('ended', session);
              endCall();
            }
          }
        }
      );

      peerRef.current.addLocalTracks(localStream);

      // Accept offer and create answer
      const answer = await peerRef.current.acceptRemoteOffer(finalOffer);

      setCallSession(session);
      callSessionRef.current = session;
      pendingOfferRef.current = null; // Clear stored offer

      socketService.emit('call:answer', {
        callId,
        sdp: answer
      });

    } catch (error) {
      const errorMsg = `Failed to answer call: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      onError?.(errorMsg);
      updateCallState('failed');
    }
  }, [getIceServers, getLocalStream, updateCallState, onRemoteStream, onError, checkConnectionEstablished]);

  // Add ICE candidate
  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      if (peerRef.current) {
        await peerRef.current.addCandidate(candidate);
      }
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }, []);

  // Handle remote answer
  const handleRemoteAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    try {
      if (peerRef.current) {
        await peerRef.current.acceptRemoteAnswer(answer);
      }
    } catch (error) {
      console.error('Failed to handle remote answer:', error);
      onError?.('Failed to establish connection');
    }
  }, [onError]);

  // Toggle microphone
  const toggleMic = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  // End call
  const endCall = useCallback(async (reason: 'user-ended' | 'missed' | 'declined' = 'user-ended') => {
    // Reset connection flags
    iceConnectedRef.current = false;
    remoteTracksReceivedRef.current = false;
    negotiationInProgressRef.current = false; // Reset negotiation lock

    const currentSession = callSessionRef.current;
    const wasConnected = callConnectedTimeRef.current !== null;
    const callDuration = wasConnected && callConnectedTimeRef.current 
      ? Math.floor((Date.now() - callConnectedTimeRef.current) / 1000)
      : undefined;

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Clear timeouts if they exist
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }

    if (currentSession?.callId) {
      socketService.emit('call:hangup', {
        callId: currentSession.callId,
        reason
      });

      // Only send call log message if call was connected (completed) or declined
      // DO NOT send "missed" here - it's handled by timeout
      if (wasConnected) {
        // Call was connected - send completed log
        try {
          await sendCallLogMessage({
            sender: userId,
            receiver: currentSession.peerId,
            callType: currentSession.callType,
            status: 'completed',
            duration: callDuration,
            callId: currentSession.callId
          });
        } catch (error) {
          console.error('Failed to send completed call log:', error);
        }
      } else if (reason === 'declined') {
        // Call was declined - send declined log
        try {
          await sendCallLogMessage({
            sender: userId,
            receiver: currentSession.peerId,
            callType: currentSession.callType,
            status: 'declined',
            callId: currentSession.callId
          });
        } catch (error) {
          console.error('Failed to send declined call log:', error);
        }
      }
      // Note: "missed" is handled by timeout, not here
    }

    outgoingCallLogMessageIdRef.current = null;

    updateCallState('ended', currentSession);
    setCallSession(null);
    callSessionRef.current = null;
    callConnectedTimeRef.current = null;
    isCallerRef.current = false;
    pendingOfferRef.current = null;
  }, [updateCallState, userId]);

  // Reject incoming call
  const rejectCall = useCallback(async (callId: string) => {
    console.log('📞 Rejecting call:', callId);
    
    // Clear incoming call timeout
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
    
    // Emit reject event to sender
    socketService.emit('call:reject', {
      callId,
      reason: 'user-rejected'
    });

    const currentSession = callSessionRef.current;
    
    // CRITICAL: Do NOT initialize media streams on reject
    // Just clean up the session state
    
    // Send declined call log message (only if we have session info)
    if (currentSession && currentSession.callId === callId) {
      try {
        await sendCallLogMessage({
          sender: userId,
          receiver: currentSession.peerId,
          callType: currentSession.callType,
          status: 'declined',
          callId: currentSession.callId
        });
      } catch (error) {
        console.error('Failed to send declined call log message:', error);
      }
    }

    // Clean up state - DO NOT initialize any media streams
    updateCallState('ended', currentSession);
    setCallSession(null);
    callSessionRef.current = null;
    callConnectedTimeRef.current = null;
    isCallerRef.current = false;
    pendingOfferRef.current = null;
    
    // Clear any local streams if they were initialized (shouldn't happen, but safety)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, [updateCallState, userId]);

  // Setup socket listeners for incoming calls
  useEffect(() => {
    const handleIncomingCall = (data: any) => {
      console.log('📞 Incoming call received:', data);
      
      // CRITICAL: Prevent duplicate incoming calls
      // If we already have an incoming call with the same callId, ignore it
      if (callSessionRef.current && callSessionRef.current.callId === data.callId) {
        console.log('⚠️ Duplicate incoming call event ignored:', data.callId);
        return;
      }
      
      // If there's an active call, emit busy immediately
      // Prevent multiple calls - if any call session exists and is not idle/ended, reject new call
      const currentState = callSessionRef.current?.state;
      const isCurrentlyInCall = currentState && 
        currentState !== 'idle' && 
        currentState !== 'ended' && 
        currentState !== 'failed';
      
      if (isCurrentlyInCall) {
        console.log('⚠️ Already in a call, sending busy signal');
        socketService.emit('call:busy', {
          callId: data.callId,
          reason: 'busy'
        });
        return;
      }
      
      const session: CallSession = {
        callId: data.callId,
        peerId: data.fromUserId,
        callType: data.type,
        state: 'ringing',
        encryptionEnabled: supportsInsertableStreams()
      };
      setCallSession(session);
      callSessionRef.current = session;
      updateCallState('ringing', session);
      
      // Clear any existing incoming call timeout
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
      
      // Set timeout for auto-reject if no action is taken
      incomingCallTimeoutRef.current = setTimeout(async () => {
        const currentSession = callSessionRef.current;
        // Only auto-reject if call is still ringing and hasn't been answered
        if (currentSession && currentSession.callId === data.callId && currentSession.state === 'ringing') {
          console.log('⏰ Incoming call timeout - auto-rejecting');
          await rejectCall(data.callId);
        }
        incomingCallTimeoutRef.current = null;
      }, INCOMING_CALL_TIMEOUT_MS);
      
      // Notify parent component to show incoming call UI
      onIncomingCall?.({
        callId: data.callId,
        fromUserId: data.fromUserId,
        type: data.type
      });
    };

    const handleOffer = async (data: any) => {
      console.log('📞 Offer received:', data);
      // When offer arrives, store it for when user accepts the call
      // DO NOT answer automatically - wait for user to click Accept
      const currentSession = callSessionRef.current;
      if (currentSession && currentSession.callId === data.callId) {
        // Store offer for when call is accepted
        pendingOfferRef.current = {
          callId: data.callId,
          offer: data.sdp,
          callType: currentSession.callType
        };
        console.log('📞 Offer stored, waiting for user to accept call');
      } else {
        // Store offer even if session doesn't exist yet (shouldn't happen, but safety)
        pendingOfferRef.current = {
          callId: data.callId,
          offer: data.sdp,
          callType: currentSession?.callType || 'audio'
        };
        console.log('📞 Offer stored (no session yet), waiting for call acceptance');
      }
    };

    const handleAnswer = (data: any) => {
      const session = callSessionRef.current;
      if (session && session.callId === data.callId) {
        handleRemoteAnswer(data.sdp);
      }
    };

    const handleCandidate = (data: any) => {
      const session = callSessionRef.current;
      if (session && session.callId === data.callId && data.candidate) {
        addIceCandidate(data.candidate);
      }
    };

    const handleBusy = (data: any) => {
      const session = callSessionRef.current;
      if (session && session.callId === data.callId) {
        console.log('📞 Call busy - user is already in a call');
        // Clear timeout since call is busy
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        // End call with busy reason
        updateCallState('ended', session);
        setCallSession(null);
        callSessionRef.current = null;
        onError?.('User is busy');
      }
    };

    const handleHangup = async (data: any) => {
      const session = callSessionRef.current;
      if (session && session.callId === data.callId) {
        // Clear timeouts since call ended
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        if (incomingCallTimeoutRef.current) {
          clearTimeout(incomingCallTimeoutRef.current);
          incomingCallTimeoutRef.current = null;
        }

        // If we're the one who hung up, we already sent the log message
        // If remote hung up, check if we should send missed call
        const wasConnected = callConnectedTimeRef.current !== null;
        if (!wasConnected && !isCallerRef.current) {
          // Remote caller hung up before we answered
          // Check if enough time has passed - if not, the timeout will handle it
          // Otherwise, send missed call log immediately
          const callStartTime = session.startTime || Date.now();
          const timeSinceStart = Date.now() - callStartTime;
          
          if (timeSinceStart >= CALL_TIMEOUT_MS) {
            // Enough time has passed, send missed call log
            try {
              await sendCallLogMessage({
                sender: session.peerId, // The caller
                receiver: userId, // We are the receiver
                callType: session.callType,
                status: 'missed',
                callId: session.callId
              });
            } catch (error) {
              console.error('Failed to send missed call log:', error);
            }
          }
          // If not enough time has passed, the timeout will handle it
        }
        
        await endCall('user-ended');
      }
    };

    socketService.on('call:initiate', handleIncomingCall);
    socketService.on('call:offer', handleOffer);
    socketService.on('call:answer', handleAnswer);
    socketService.on('call:candidate', handleCandidate);
    socketService.on('call:hangup', handleHangup);
    socketService.on('call:busy', handleBusy);

    return () => {
      socketService.off('call:initiate', handleIncomingCall);
      socketService.off('call:offer', handleOffer);
      socketService.off('call:answer', handleAnswer);
      socketService.off('call:candidate', handleCandidate);
      socketService.off('call:hangup', handleHangup);
      socketService.off('call:busy', handleBusy);
    };
  }, [answerCall, handleRemoteAnswer, addIceCandidate, endCall, updateCallState, onIncomingCall, onError]);

  // Helper to answer call by callId (for UI acceptance)
  const answerCallById = useCallback(async (callId: string) => {
    const stored = pendingOfferRef.current;
    if (stored && stored.callId === callId) {
      await answerCall(callId, stored.offer, stored.callType);
    } else if (callSessionRef.current && callSessionRef.current.callId === callId) {
      // If offer hasn't arrived yet, wait for it
      console.log('Waiting for offer to arrive...');
    }
  }, [answerCall]);

  return {
    callSession,
    callState,
    initiateCall,
    answerCall,
    answerCallById,
    endCall,
    rejectCall,
    toggleMic,
    toggleCamera,
    addIceCandidate,
    handleRemoteAnswer,
    localStream: localStreamRef.current,
    remoteStream: callSession?.remoteStream || null
  };
};
