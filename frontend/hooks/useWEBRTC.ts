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
  const CALL_TIMEOUT_MS = 30000; // 30 seconds for call to be answered
  const INCOMING_CALL_TIMEOUT_MS = 45000; // 45 seconds to answer incoming call

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
    // Check if mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log(`📱 Device detected as: ${isMobile ? 'Mobile' : 'Desktop'}`);
    
    // Browser detection for specific constraints
    const isChrome = /Chrome/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    const constraints: MediaStreamConstraints = {
      audio: {
        // Standard WebRTC audio processing
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        
        // Browser-specific optimizations
        ...(isChrome && {
          // Chrome supports additional constraints
          sampleRate: 48000,
          latency: 0.01
        }),
        ...(isSafari && {
          // Safari specific
          sampleRate: 44100,
          // Safari handles autoGainControl differently
          autoGainControl: false
        }),
        ...(isMobile && {
          // Mobile-specific optimizations
          sampleRate: 16000,
          sampleSize: 16,
          latency: 0.02,
          // On mobile, sometimes disabling autoGainControl helps with echo
          ...(isChrome && { autoGainControl: false }) // Only for Chrome on mobile
        })
      },
      video: callType === 'video' ? {
        // Mobile-friendly resolution
        width: isMobile ? { ideal: 480, max: 640 } : { ideal: 1280, max: 1920 },
        height: isMobile ? { ideal: 360, max: 480 } : { ideal: 720, max: 1080 },
        frameRate: isMobile ? { ideal: 15, max: 24 } : { ideal: 30, max: 60 },
        facingMode: 'user',
        // Add for better mobile performance
        ...(isMobile && {
          aspectRatio: 1.777777778 // 16:9
        })
      } : false
    };

    console.log('🎥 Requesting media with constraints:', constraints);
    
    // Try with exact constraints first
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('⚠️ First constraint attempt failed, trying relaxed constraints:', err);
      // Fallback to simpler constraints
      const fallbackConstraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1
        },
        video: callType === 'video' ? {
          facingMode: 'user',
          width: isMobile ? 640 : 1280,
          height: isMobile ? 480 : 720
        } : false
      };
      stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    }
    
    // Verify audio settings
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const settings = audioTrack.getSettings();
      console.log('🎵 Audio settings applied:', {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        deviceId: settings.deviceId,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        // Log browser info for debugging
        browser: isChrome ? 'Chrome' : isSafari ? 'Safari' : 'Other',
        isMobile
      });
      
      // Add event listeners
      audioTrack.onended = () => console.log('🎤 Audio track ended');
      audioTrack.onmute = () => console.log('🎤 Audio track muted');
      audioTrack.onunmute = () => console.log('🎤 Audio track unmuted');
    }
    
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    console.log(`✅ Got stream: ${audioTracks.length} audio, ${videoTracks.length} video tracks`);
    
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
    if (iceConnectedRef.current && remoteTracksReceivedRef.current) {
      callConnectedTimeRef.current = Date.now();
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
      updateCallState('connected', session);
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

  // Reject incoming call - MOVED BEFORE handleIncomingOffer
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

    const currentSession = callSessionRef.current;
    updateCallState('rejected', currentSession);
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
      currentState !== 'idle' && 
      currentState !== 'ended' && 
      currentState !== 'failed';
    
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

    // If we're already in ringing state (waiting for user to accept), don't call onIncomingCall again
    if (callSessionRef.current?.state === 'ringing') {
      console.log('ℹ️ Already in ringing state, skipping notification');
      return;
    }

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
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
    }
    
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
        onNegotiationNeeded: async () => {
          if (negotiationInProgressRef.current) {
            console.warn('⚠️ Negotiation already in progress');
            return;
          }

          const pc = peerRef.current?.connection;
          if (!pc) {
            console.error('❌ No peer connection available');
            return;
          }

          console.log(`📞 onNegotiationNeeded fired, signalingState: "${pc.signalingState}"`);

          // ✅ IMPORTANT: Only create offer if in "stable" state
          if (pc.signalingState !== 'stable') {
            console.warn(`⚠️ Signaling state is "${pc.signalingState}", not "stable" - SKIPPING`);
            return;
          }

          if (callState === 'connected' || iceConnectedRef.current) {
            console.warn('⚠️ Call already connected, skipping renegotiation');
            return;
          }

          try {
            negotiationInProgressRef.current = true;
            console.log('📞 Creating offer...');
            
            const offer = await peerRef.current!.createOffer();
            
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
            updateCallState('connecting', session);
          } catch (error) {
            console.error('❌ Failed to create offer:', error);
            onError?.(`Failed to negotiate call: ${error instanceof Error ? error.message : String(error)}`);
            updateCallState('failed', session);
          } finally {
            setTimeout(() => {
              negotiationInProgressRef.current = false;
            }, 100);
          }
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
            checkConnectionEstablished(updatedSession);
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
        }
      }
    );

    // ✅ SIMPLIFIED: Just add local tracks and wait for onNegotiationNeeded
    if (localStream && peerRef.current) {
      console.log('📞 Adding local tracks to peer connection');
      peerRef.current.addLocalTracks(localStream);
    }

    // Store session
    setCallSession(session);
    callSessionRef.current = session;

    // Set state based on callee status
    const nextState = calleeStatus === 'offline' ? 'ringing' : 'ringing';
    updateCallState(nextState, session);
    console.log(`📞 Callee is ${calleeStatus === 'offline' ? 'offline' : 'online'}, call is ringing`);

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

      // ✅ FIXED: Wait for offer to arrive if not already received (timeout after 10 seconds)
      let stored = pendingOfferRef.current;
      if (!stored || stored.callId !== callId) {
        console.log('⏳ Waiting for offer to arrive...');
        
        // Wait up to 10 seconds for the offer
        stored = await new Promise<{ callId: string; offer: string; callType: CallType; fromUserId: string } | null>((resolve) => {
          const timeout = setTimeout(() => {
            console.error('❌ Offer wait timeout after 10 seconds');
            resolve(null);
          }, 10000);
          
          const checkInterval = setInterval(() => {
            const current = pendingOfferRef.current;
            if (current && current.callId === callId) {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              console.log('✅ Offer arrived!');
              resolve(current);
            }
          }, 100); // Check every 100ms
        });
        
        if (!stored || stored.callId !== callId) {
          console.error('❌ No offer found for call after waiting:', callId);
          onError?.('Call offer not found - remote user may have hung up');
          updateCallState('failed');
          return;
        }
      }

      // 1. Get ICE servers from backend for this call
      const iceResponse = await api.get(`/calls/${callId}`);
      const iceServers = iceResponse.data.iceServers || [];
      console.log(`✅ Got ICE servers: ${iceServers.length} servers`);

      // 2. Get local stream
      const localStream = await getLocalStream(stored.callType);

      // 3. Create session object
      const session: CallSession = {
        callId,
        peerId: stored.fromUserId,
        callType: stored.callType,
        state: 'connecting',
        localStream,
        iceServers
      };

      // 4. Create peer connection
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
              session.remoteStream = remoteStream;
              remoteTracksReceivedRef.current = true;
              const updatedSession = { ...session };
              setCallSession(updatedSession);
              callSessionRef.current = updatedSession;
              onRemoteStream?.(remoteStream);
              checkConnectionEstablished(updatedSession);
            }
          },
          onIceConnectionStateChange: (state) => {
            console.log('❄️ ICE connection state (answer):', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              if (session) {
                checkConnectionEstablished(session);
              }
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              iceConnectedRef.current = false;
              updateCallState('ended', session);
            }
          }
        }
      );

      // Add local tracks
      if (localStream) {
        peerRef.current.addLocalTracks(localStream);
      }

      // 5. Create and set local description
      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: stored.offer
      };

      const answer = await peerRef.current.acceptRemoteOffer(offer);
      
      // 6. Send answer via socket
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

  const answerCallById = useCallback(async (callId: string) => {
    const stored = pendingOfferRef.current;
    if (stored && stored.callId === callId) {
      // You already have an answerCall function, just call it
      await answerCall(callId);
    } else if (callSessionRef.current && callSessionRef.current.callId === callId) {
      console.log('Waiting for offer to arrive...');
      // Optionally, you could set up a promise to wait for the offer
    }
  }, [answerCall]);

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

  // Setup socket listeners
  useEffect(() => {
    const socketListeners = {
      'call:initiate': (data: any) => {
        console.log('📞 Incoming call INITIATION notification:', data);
        // Notify the app about the incoming call immediately when caller initiates
        onIncomingCall?.({
          callId: data.callId,
          fromUserId: data.fromUserId,
          type: data.type || 'audio',
          fromUserName: data.fromUserName
        });
      },

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
  }, [handleIncomingOffer, handleRemoteAnswer, addIceCandidate, updateCallState, endCall, onIncomingCall]);

  return {
    // State
    callSession,
    callState,
    
    // Call control
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    
    // Media control
    toggleMic,
    toggleCamera,
    answerCallById,
    
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