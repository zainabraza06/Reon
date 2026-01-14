/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef, useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { Peer } from '@/lib/webrtc/peer';
import { CallState } from '@/types';

export type CallType = 'audio' | 'video';

interface CallSession {
  callId: string;
  peerId: string;
  peerName?: string;
  callType: CallType;
  state: CallState;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  startTime?: number;
  iceServers?: RTCIceServer[];
}

interface UseWebRTCOptions {
  userId: string;
  onCallStateChange?: (state: CallState, session: CallSession | null) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
  onIncomingCall?: (data: { callId: string; fromUserId: string; type: CallType; fromUserName?: string }) => void;
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
  const pendingOfferRef = useRef<{ callId: string; offer: string; callType: CallType; fromUserId: string } | null>(null);
  const iceConnectedRef = useRef<boolean>(false);
  const remoteTracksReceivedRef = useRef<boolean>(false);
  const callSessionRef = useRef<CallSession | null>(null);
  const callConnectedTimeRef = useRef<number | null>(null);
  const isCallerRef = useRef<boolean>(false);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const incomingCallTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const negotiationInProgressRef = useRef<boolean>(false);
  const CALL_TIMEOUT_MS = 30000;
  const INCOMING_CALL_TIMEOUT_MS = 45000;


  

  // Update call state
  const updateCallState = useCallback((newState: CallState, session: CallSession | null = null) => {
    console.log(`📞 Call state change: ${callState} -> ${newState}`, session ? `callId: ${session.callId}` : '');
    setCallState(newState);
    if (session) {
      const updatedSession = { ...session, state: newState };
      setCallSession(updatedSession);
      callSessionRef.current = updatedSession;
    }
    onCallStateChange?.(newState, session);
  }, [callState, onCallStateChange]);

  // Get local media stream
  const getLocalStream = useCallback(async (callType: CallType) => {
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: callType === 'video' ? {
          width: isMobile ? { ideal: 480 } : { ideal: 1280 },
          height: isMobile ? { ideal: 360 } : { ideal: 720 },
          frameRate: { ideal: 24 },
          facingMode: 'user',
        } : false
      };

      console.log('🎥 Requesting media with constraints:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        console.log('🎵 Audio track obtained:', {
          id: audioTrack.id,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState
        });
      }
      
      console.log(`✅ Got stream: ${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video tracks`);
      
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      const errorMsg = `Failed to get ${callType} stream: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      onError?.(errorMsg);
      throw error;
    }
  }, [onError]);

  // Check if connection is fully established
 const checkConnectionEstablished = useCallback((session: CallSession) => {
  const iceState = peerRef.current?.connection.iceConnectionState;
  const connState = peerRef.current?.connection.connectionState;
  
  console.log('🔍 Connection check:', {
    hasTracks: remoteTracksReceivedRef.current,
    iceState,
    connState
  });
  
  // Primary: If we have tracks AND (ICE connected OR connection connected)
  if (remoteTracksReceivedRef.current && 
      (iceState === 'connected' || iceState === 'completed' || 
       connState === 'connected')) {
    callConnectedTimeRef.current = Date.now();
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    updateCallState('connected', session);
  } 
  // Fallback: If we have tracks for more than 2 seconds, assume connected
  else if (remoteTracksReceivedRef.current) {
    setTimeout(() => {
      if (callSessionRef.current?.state === 'connecting' && 
          remoteTracksReceivedRef.current) {
        console.log('⏱️ Fallback: Marking as connected after receiving tracks');
        callConnectedTimeRef.current = Date.now();
        updateCallState('connected', session);
      }
    }, 2000);
  }
}, [updateCallState]);
  // End call
  const endCall = useCallback(async (reason: 'user-ended' | 'missed' | 'declined' | 'peer-disconnected' = 'user-ended') => {
    console.log(`📞 Ending call: ${reason}`);
    
    // Clear timeouts
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }

    // Reset state
    iceConnectedRef.current = false;
    remoteTracksReceivedRef.current = false;
    negotiationInProgressRef.current = false;

    const currentSession = callSessionRef.current;

    // Close peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    // Stop local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Notify backend if we have a call session
    if (currentSession?.callId && reason !== 'peer-disconnected') {
      socketService.emit('call:hangup', {
        callId: currentSession.callId,
        reason
      });
    }

    // Update state
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
    
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }

    socketService.emit('call:reject', {
      callId,
      reason: 'user-rejected'
    });

    updateCallState('rejected', callSessionRef.current);
    setCallSession(null);
    callSessionRef.current = null;
    pendingOfferRef.current = null;
    
    // Clean up any local streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, [updateCallState]);

  // Handle incoming call offer
  const handleIncomingOffer = useCallback((data: { callId: string; fromUserId: string; offer: string; type: CallType }) => {
    console.log('📞 Incoming offer received:', data);
    
    // Check if we're already in a call
    const currentState = callSessionRef.current?.state;
    const isCurrentlyInCall = currentState && 
      ['ringing', 'connecting', 'connected'].includes(currentState);
    
    if (isCurrentlyInCall) {
      console.log('⚠️ Already in a call, sending busy');
      socketService.emit('call:busy', {
        callId: data.callId,
        reason: 'busy'
      });
      return;
    }

    // Store the offer
    pendingOfferRef.current = {
      callId: data.callId,
      offer: data.offer,
      callType: data.type,
      fromUserId: data.fromUserId
    };

    console.log('✅ Offer stored in pendingOfferRef, ready for answering');

    // Create session for incoming call
    const session: CallSession = {
      callId: data.callId,
      peerId: data.fromUserId,
      callType: data.type,
      state: 'ringing'
    };

    setCallSession(session);
    callSessionRef.current = session;
    updateCallState('ringing', session);

    // Set timeout for auto-reject
    incomingCallTimeoutRef.current = setTimeout(async () => {
      if (callSessionRef.current?.callId === data.callId && callSessionRef.current.state === 'ringing') {
        console.log('⏰ Incoming call timeout - auto rejecting');
        await rejectCall(data.callId);
      }
    }, INCOMING_CALL_TIMEOUT_MS);

    // Notify parent component
    onIncomingCall?.({
      callId: data.callId,
      fromUserId: data.fromUserId,
      type: data.type
    });
  }, [updateCallState, onIncomingCall, rejectCall]);

  // Initiate outgoing call
  const initiateCall = useCallback(async (peerId: string, peerName: string, callType: CallType) => {
    try {
      console.log(`📞 Initiating ${callType} call to ${peerName} (${peerId})`);
      
      // Reset state
      iceConnectedRef.current = false;
      remoteTracksReceivedRef.current = false;
      callConnectedTimeRef.current = null;
      isCallerRef.current = true;
      updateCallState('initiating');

      // 1. Create call session via REST API
      const response = await api.post('/calls', {
        toUserId: peerId,
        type: callType
      });

      const { callId, iceServers, calleeStatus } = response.data;
      console.log("Ice Servers from API:", iceServers);
      console.log(`✅ Call session created: ${callId}`, {
        iceServers: iceServers?.length || 0,
        calleeStatus
      });

      // 2. Get local stream
      const localStream = await getLocalStream(callType);

      // 3. Create session object
      const session: CallSession = {
        callId,
        peerId,
        peerName,
        callType,
        state: 'initiating',
        localStream,
        iceServers
      };

      // 4. Create peer connection
      peerRef.current = new Peer(
        {
          iceServers: iceServers || [],
          iceTransportPolicy: 'all'
        },
        {
          onIceCandidate: (candidate) => {
            console.log('❄️ ICE candidate generated');
            socketService.emit('call:candidate', {
              callId,
              candidate
            });
          },
         onTrack: (event) => {
  console.log('📡 Remote track received');
  const remoteStream = event.streams[0];
  if (remoteStream) {
    session.remoteStream = remoteStream;
    remoteTracksReceivedRef.current = true;
    const updatedSession = { ...session };
    setCallSession(updatedSession);
    callSessionRef.current = updatedSession;
    onRemoteStream?.(remoteStream);
    
    // IMMEDIATELY transition to connected when tracks arrive
    console.log('✅ Remote tracks received, marking as connected');
    callConnectedTimeRef.current = Date.now();
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    updateCallState('connected', updatedSession);
  }
},
          onIceConnectionStateChange: (state) => {
            console.log('❄️ ICE connection state:', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              if (session) {
                checkConnectionEstablished(session);
              }
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              updateCallState('ended', session);
            }
          },
          onConnectionStateChange: (state) => {
            console.log('🔗 Connection state:', state);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              remoteTracksReceivedRef.current = false;
              updateCallState('ended', session);
            }
          },
          // Only for renegotiation (adding video, restarting ICE)
          onNegotiationNeeded: () => {
            console.warn('⚠️ onNegotiationNeeded fired - this should only happen for renegotiation');
          }
        }
      );

      // 5. Add local tracks to peer connection
      console.log('📞 Adding local tracks to peer connection');
      peerRef.current.addLocalTracks(localStream);

      // 6. Create and send offer
      console.log('📞 Creating initial offer...');
      const offer = await peerRef.current.createOffer();
      
      if (!offer.sdp) {
        throw new Error('Offer SDP is empty');
      }
      
      console.log(`✅ Offer created, SDP length: ${offer.sdp.length}`);
      
      // Send offer via socket
      socketService.emit('call:offer', {
        callId,
        offer: offer.sdp,
        type: callType
      });
      
      console.log('✅ Offer sent to callee');

      // Store session
      setCallSession(session);
      callSessionRef.current = session;
      updateCallState('connecting', session);

      // Set timeout for unanswered call
      callTimeoutRef.current = setTimeout(async () => {
        const currentSession = callSessionRef.current;
        const currentState = callSessionRef.current?.state;
        if (currentSession && currentSession.callId === callId && 
            (currentState === 'ringing' || currentState === 'connecting')) {
          console.log('⏰ Call timeout - not answered');
          await endCall('missed');
          onError?.('Call not answered');
        }
      }, CALL_TIMEOUT_MS);

    } catch (error) {
      const errorMsg = `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      onError?.(errorMsg);
      updateCallState('failed');
    }
  }, [getLocalStream, updateCallState, onRemoteStream, onError, checkConnectionEstablished, endCall]);

  // Answer incoming call
const answerCall = useCallback(async (callId: string) => {
  try {
    console.log(`📞 Answering call: ${callId}`);

    // Clear incoming call timeout
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }

    // Reset state
    iceConnectedRef.current = false;
    remoteTracksReceivedRef.current = false;
    callConnectedTimeRef.current = null;
    isCallerRef.current = false;
    updateCallState('connecting');

    // Get stored offer
    const stored = pendingOfferRef.current;
    if (!stored || stored.callId !== callId) {
      console.error('❌ No offer found for call:', callId);
      onError?.('Call offer not found - remote user may have hung up');
      updateCallState('failed');
      return;
    }

    // 1. Get ICE servers from backend for this call
    const iceResponse = await api.get(`/calls/${callId}`);
    const iceServers = iceResponse.data.iceServers || [];
    console.log(`✅ Got ICE servers: ${iceServers.length} servers`);

    // 2. Get local stream
    const localStream = await getLocalStream(stored.callType);

    // 3. Create peer connection
    peerRef.current = new Peer(
      {
        iceServers,
        iceTransportPolicy: 'all'
      },
      {
        onIceCandidate: (candidate) => {
          console.log('❄️ ICE candidate generated (answer)');
          socketService.emit('call:candidate', {
            callId,
            candidate
          });
        },
        onTrack: (event) => {
          console.log('📡 Remote track received (answer)');
          const remoteStream = event.streams[0];
          if (remoteStream) {
            const session = callSessionRef.current;
            if (session) {
              session.remoteStream = remoteStream;
              remoteTracksReceivedRef.current = true;
              const updatedSession = { ...session };
              setCallSession(updatedSession);
              callSessionRef.current = updatedSession;
              onRemoteStream?.(remoteStream);
              checkConnectionEstablished(updatedSession);
            }
          }
        },
        onIceConnectionStateChange: (state) => {
          console.log('❄️ ICE connection state (answer):', state);
          if (state === 'connected' || state === 'completed') {
            iceConnectedRef.current = true;
            const session = callSessionRef.current;
            if (session) {
              checkConnectionEstablished(session);
            }
          } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            iceConnectedRef.current = false;
            updateCallState('ended', callSessionRef.current);
          }
        },
        onConnectionStateChange: (state) => {
          console.log('🔗 Connection state (answer):', state);
          if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            iceConnectedRef.current = false;
            remoteTracksReceivedRef.current = false;
            updateCallState('ended', callSessionRef.current);
          }
        }
      }
    );

    // 4. Add local tracks BEFORE processing remote offer
    console.log('📞 Adding local tracks...');
    peerRef.current.addLocalTracks(localStream);

    // 5. Process remote offer
    const offer: RTCSessionDescriptionInit = {
      type: 'offer',
      sdp: stored.offer
    };
    console.log('📞 Processing remote offer...');
    const answer = await peerRef.current.acceptRemoteOffer(offer);

    // 6. Create session object
    const session: CallSession = {
      callId,
      peerId: stored.fromUserId,
      callType: stored.callType,
      state: 'connecting',
      localStream,
      iceServers,
      remoteStream: undefined
    };

    // 7. Send answer via socket
    socketService.emit('call:answer', {
      callId,
      answer: answer.sdp
    });

    // Update session
    setCallSession(session);
    callSessionRef.current = session;
    pendingOfferRef.current = null;

    console.log('✅ Call answered, answer sent');
  } catch (error) {
    const errorMsg = `Failed to answer call: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    onError?.(errorMsg);
    updateCallState('failed');
  }
}, [getLocalStream, updateCallState, onRemoteStream, onError, checkConnectionEstablished]);


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
  const handleRemoteAnswer = useCallback(async (answerSdp: string) => {
    try {
      console.log('📞 Processing remote answer, SDP length:', answerSdp.length);
      if (!peerRef.current) {
        console.error('❌ No peer connection available');
        return;
      }
      
      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: answerSdp
      };
      
      console.log('📞 Setting remote description...');
      await peerRef.current.acceptRemoteAnswer(answer);
      console.log('✅ Remote answer processed successfully');
    } catch (error) {
      console.error('❌ Failed to handle remote answer:', error);
      onError?.('Failed to establish connection');
    }
  }, [onError]);

  // Toggle microphone
  const toggleMic = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = enabled;
      });
      console.log(`🎤 Microphone ${enabled ? 'enabled' : 'disabled'}`);
      
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

  // Toggle camera
  const toggleCamera = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = enabled;
      });
      console.log(`📹 Camera ${enabled ? 'enabled' : 'disabled'}`);
      
      const session = callSessionRef.current;
      if (session && session.callId) {
        socketService.emit('call:track:update', {
          callId: session.callId,
          trackType: 'video',
          enabled
        });
      }
    }
  }, []);

  // Handle socket events for incoming calls
  const handleIncomingCall = useCallback((data: any) => {
    console.log('📞 Incoming call received:', data);
    onIncomingCall?.({
      callId: data.callId,
      fromUserId: data.fromUserId,
      type: data.type || 'audio',
      fromUserName: data.fromUserName
    });
  }, [onIncomingCall]);

  // In the useWebRTC hook, add this function:
const answerCallById = useCallback(async (callId: string) => {
  try {
    console.log(`📞 Answering call by ID: ${callId}`);
    
    // Check if we have the offer stored
    const stored = pendingOfferRef.current;
    if (stored && stored.callId === callId) {
      // We have the offer, answer normally
      await answerCall(callId);
      return true;
    } else if (callSessionRef.current?.callId === callId) {
      // We're already in this call, just return
      console.log(`ℹ️ Already in call ${callId}`);
      return true;
    } else {
      // No offer found, might be coming from a notification
      console.log(`⏳ Offer not yet received for call ${callId}, waiting...`);
      
      // Wait for offer to arrive (max 10 seconds)
      const waitForOffer = new Promise<boolean>((resolve) => {
        const checkInterval = setInterval(() => {
          const current = pendingOfferRef.current;
          if (current && current.callId === callId) {
            clearInterval(checkInterval);
            console.log(`✅ Offer arrived for call ${callId}`);
            resolve(true);
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          console.error(`❌ Offer never arrived for call ${callId}`);
          resolve(false);
        }, 10000);
      });
      
      const hasOffer = await waitForOffer;
      if (hasOffer) {
        await answerCall(callId);
        return true;
      } else {
        onError?.('Call expired or not found');
        return false;
      }
    }
  } catch (error) {
    const errorMsg = `Failed to answer call by ID: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    onError?.(errorMsg);
    return false;
  }
}, [answerCall, onError]);

  // Setup socket listeners
  useEffect(() => {
    const socketListeners = {
      'call:initiate': handleIncomingCall,
      
      'call:offer': (data: any) => {
        console.log('📞 Offer received with SDP');
        handleIncomingOffer({
          callId: data.callId,
          fromUserId: data.fromUserId,
          offer: data.offer || data.sdp,
          type: data.type || 'audio'
        });
      },
      
      'call:answer': (data: any) => {
        console.log('📞 Answer received:', data);
        const answerSdp = data.answer || data.sdp;
        if (answerSdp) {
          console.log('✅ Answer SDP found, length:', answerSdp.length);
          handleRemoteAnswer(answerSdp);
        } else {
          console.error('❌ No answer SDP in received data:', data);
        }
      },
      
      'call:candidate': (data: any) => {
        if (data.candidate) {
          addIceCandidate(data.candidate);
        }
      },
      
      'call:reject': (data: any) => {
        console.log('📞 Call rejected by remote');
        const session = callSessionRef.current;
        if (session && session.callId === data.callId) {
          updateCallState('rejected', session);
          endCall('declined');
        }
      },
      
      'call:busy': (data: any) => {
        console.log('📞 Remote user is busy');
        const session = callSessionRef.current;
        if (session && session.callId === data.callId) {
          updateCallState('busy', session);
          endCall('missed');
        }
      },
      
      'call:hangup': (data: any) => {
        console.log('📞 Remote user hung up');
        const session = callSessionRef.current;
        if (session && session.callId === data.callId) {
          endCall('peer-disconnected');
        }
      },
      
      'call:track:update': (data: any) => {
        console.log('📡 Remote track update:', data);
      },
    };

    // Register all listeners
    Object.entries(socketListeners).forEach(([event, handler]) => {
      socketService.on(event, handler);
    });

    return () => {
      // Remove all listeners
      Object.entries(socketListeners).forEach(([event, handler]) => {
        socketService.off(event, handler);
      });
    };
  }, [
    handleIncomingOffer, 
    handleRemoteAnswer, 
    addIceCandidate, 
    updateCallState, 
    endCall, 
    handleIncomingCall
  ]);

  return {
    // State
    callSession,
    callState,
    
    // Call control
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    answerCallById,
    
    // Media control
    toggleMic,
    toggleCamera,
    
    // Streams
    localStream: localStreamRef.current,
    remoteStream: callSession?.remoteStream || null,
    
    // Connection info
    isCaller: isCallerRef.current,
    isConnected: iceConnectedRef.current && remoteTracksReceivedRef.current,
    callDuration: callConnectedTimeRef.current ? 
      Math.floor((Date.now() - callConnectedTimeRef.current) / 1000) : 0
  };
};