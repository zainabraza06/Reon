/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef, useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { Peer } from '@/lib/webrtc/peer';
import { supportsInsertableStreams } from '@/lib/webrtc/e2ee';

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
  const { 
    userId, 
    onCallStateChange, 
    onRemoteStream, 
    onError, 
    onIncomingCall 
  } = options;

  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<{ callId: string; offer: RTCSessionDescriptionInit; callType: CallType } | null>(null);
  const iceConnectedRef = useRef<boolean>(false);
  const remoteTracksReceivedRef = useRef<boolean>(false);
  const callSessionRef = useRef<CallSession | null>(null);
  const callConnectedTimeRef = useRef<number | null>(null);
  const isCallerRef = useRef<boolean>(false);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const incomingCallTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const negotiationInProgressRef = useRef<boolean>(false);
  const CALL_TIMEOUT_MS = 30000;
  const INCOMING_CALL_TIMEOUT_MS = 40000;

  // Update call state
  const updateCallState = useCallback((newState: CallState, session: CallSession | null = null) => {
    console.log(`📞 Call state change: ${callState} -> ${newState}`);
    setCallState(newState);
    if (session) {
      const updatedSession = { ...session, state: newState };
      setCallSession(updatedSession);
      callSessionRef.current = updatedSession;
    }
    onCallStateChange?.(newState, session);
  }, [callState, onCallStateChange]);

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
            if (negotiationInProgressRef.current) {
              console.warn('⚠️ [onNegotiationNeeded] BLOCKED: Negotiation already in progress');
              return;
            }

            const pc = peerRef.current?.connection;
            if (!pc || pc.signalingState !== 'stable') {
              console.warn(`⚠️ [onNegotiationNeeded] BLOCKED: Signaling state is "${pc?.signalingState}", not "stable"`);
              return;
            }

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
            checkConnectionEstablished(updatedSession);
          },
          onIceConnectionStateChange: (state) => {
            console.log('ICE connection state:', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              checkConnectionEstablished(session);
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              updateCallState('ended', session);
            }
          },
          onConnectionStateChange: (state) => {
            console.log('Connection state:', state);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              remoteTracksReceivedRef.current = false;
              updateCallState('ended', session);
            }
          }
        }
      );

      peerRef.current.addLocalTracks(localStream);
      setCallSession(session);
      callSessionRef.current = session;

      // Set initial state based on callee status
      if (calleeStatus === 'offline') {
        updateCallState('dialing', session);
      } else {
        updateCallState('ringing', session);
      }

      // Set timeout for missed call
      callTimeoutRef.current = setTimeout(async () => {
        const currentSession = callSessionRef.current;
        if (currentSession && currentSession.callId === callId && 
            (callState === 'ringing' || callState === 'connecting' || callState === 'dialing')) {
          console.log('⏰ Call timeout - call not answered');
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
  }, [getLocalStream, updateCallState, onRemoteStream, onError, checkConnectionEstablished, userId]);

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
            checkConnectionEstablished(updatedSession);
          },
          onIceConnectionStateChange: (state) => {
            console.log('ICE connection state:', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              checkConnectionEstablished(session);
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              updateCallState('ended', session);
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              remoteTracksReceivedRef.current = false;
              updateCallState('ended', session);
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

  // Toggle microphone - FIXED: Only toggle local track, notify peer
  const toggleMic = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = enabled;
      });
      console.log(`🎤 Microphone ${enabled ? 'enabled' : 'disabled'}`);
      
      // Notify peer about mic state change (optional, for UI updates)
      const session = callSessionRef.current;
      if (session && session.callId) {
        socketService.emit('call:track:update', {
          callId: session.callId,
          trackType: 'audio',
          enabled
        });
      }
    }
  }, []);


  // Handle track updates from remote
  const handleRemoteTrackUpdate = useCallback((data: { callId: string; trackType: string; enabled: boolean }) => {
    const session = callSessionRef.current;
    if (!session || session.callId !== data.callId) {
      return;
    }
    
    console.log(`Remote ${data.trackType} ${data.enabled ? 'enabled' : 'disabled'}`);
    
    // You might want to update UI to show remote user's camera/mic state
    // This doesn't affect the local stream, just updates UI
  }, []);

  // End call
  const endCall = useCallback(async (reason: 'user-ended' | 'missed' | 'declined' = 'user-ended') => {
    // Reset connection flags
    iceConnectedRef.current = false;
    remoteTracksReceivedRef.current = false;
    negotiationInProgressRef.current = false;

    const currentSession = callSessionRef.current;

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
    }

    updateCallState('ended', currentSession);
    setCallSession(null);
    callSessionRef.current = null;
    callConnectedTimeRef.current = null;
    isCallerRef.current = false;
    pendingOfferRef.current = null;
  }, [updateCallState]);

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

    // Clean up state
    updateCallState('ended', currentSession);
    setCallSession(null);
    callSessionRef.current = null;
    callConnectedTimeRef.current = null;
    isCallerRef.current = false;
    pendingOfferRef.current = null;
    
    // Clear any local streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, [updateCallState]);

  // Setup socket listeners for incoming calls and updates
  useEffect(() => {
    const handleIncomingCall = (data: any) => {
      console.log('📞 Incoming call received:', data);
      
      // Prevent duplicate incoming calls
      if (callSessionRef.current && callSessionRef.current.callId === data.callId) {
        console.log('⚠️ Duplicate incoming call event ignored:', data.callId);
        return;
      }
      
      // If there's an active call, emit busy immediately
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
      
      // Set timeout for auto-reject
      incomingCallTimeoutRef.current = setTimeout(async () => {
        const currentSession = callSessionRef.current;
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
      const currentSession = callSessionRef.current;
      if (currentSession && currentSession.callId === data.callId) {
        pendingOfferRef.current = {
          callId: data.callId,
          offer: data.sdp,
          callType: currentSession.callType
        };
        console.log('📞 Offer stored, waiting for user to accept call');
      } else {
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
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        updateCallState('ended', session);
        setCallSession(null);
        callSessionRef.current = null;
        onError?.('User is busy');
      }
    };

    const handleHangup = async (data: any) => {
      const session = callSessionRef.current;
      if (session && session.callId === data.callId) {
        console.log('📞 Remote user hung up');
        
        // Clear timeouts
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        if (incomingCallTimeoutRef.current) {
          clearTimeout(incomingCallTimeoutRef.current);
          incomingCallTimeoutRef.current = null;
        }

        await endCall('user-ended');
      }
    };

    // NEW: Handle call rejection from receiver
    const handleReject = (data: any) => {
      console.log('📞 Call rejected by remote user:', data);
      const session = callSessionRef.current;
      if (session && session.callId === data.callId) {
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
        updateCallState('ended', session);
        setCallSession(null);
        callSessionRef.current = null;
        onError?.('Call was rejected');
      }
    };

    // NEW: Handle remote track updates
    const handleTrackUpdate = (data: any) => {
      console.log('📡 Remote track update received:', data);
      handleRemoteTrackUpdate(data);
    };

    socketService.on('call:initiate', handleIncomingCall);
    socketService.on('call:offer', handleOffer);
    socketService.on('call:answer', handleAnswer);
    socketService.on('call:candidate', handleCandidate);
    socketService.on('call:hangup', handleHangup);
    socketService.on('call:busy', handleBusy);
    socketService.on('call:reject', handleReject); // NEW: Add reject listener
    socketService.on('call:track:update', handleTrackUpdate); // NEW: Add track update listener

    return () => {
      socketService.off('call:initiate', handleIncomingCall);
      socketService.off('call:offer', handleOffer);
      socketService.off('call:answer', handleAnswer);
      socketService.off('call:candidate', handleCandidate);
      socketService.off('call:hangup', handleHangup);
      socketService.off('call:busy', handleBusy);
      socketService.off('call:reject', handleReject); // NEW: Remove reject listener
      socketService.off('call:track:update', handleTrackUpdate); // NEW: Remove track update listener
    };
  }, [answerCall, handleRemoteAnswer, addIceCandidate, endCall, updateCallState, onIncomingCall, onError, rejectCall, handleRemoteTrackUpdate, userId]);

  // Helper to answer call by callId (for UI acceptance)
  const answerCallById = useCallback(async (callId: string) => {
    const stored = pendingOfferRef.current;
    if (stored && stored.callId === callId) {
      await answerCall(callId, stored.offer, stored.callType);
    } else if (callSessionRef.current && callSessionRef.current.callId === callId) {
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
    
    addIceCandidate,
    handleRemoteAnswer,
    localStream: localStreamRef.current,
    remoteStream: callSession?.remoteStream || null
  };
};