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
  const connectionMonitorRef = useRef<NodeJS.Timeout | null>(null);
  
  const CALL_TIMEOUT_MS = 45000; // Increased from 30000
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

  // Check if connection is fully established - UPDATED
  const checkConnectionEstablished = useCallback((session: CallSession) => {
    console.log('🔍 Checking connection establishment:', {
      iceConnected: iceConnectedRef.current,
      remoteTracksReceived: remoteTracksReceivedRef.current,
      callId: session.callId,
      currentState: session.state
    });
    
    // If we have remote tracks, we can consider the call functional
    // Even if ICE is still in 'checking' state
    if (remoteTracksReceivedRef.current) {
      console.log('🎉 REMOTE TRACKS RECEIVED! Media is flowing.');
      
      // Give ICE some time to reach 'connected' state
      setTimeout(() => {
        if (remoteTracksReceivedRef.current && session.state === 'connecting') {
          console.log('✅✅ Media is flowing - updating to connected state');
          callConnectedTimeRef.current = Date.now();
          
          // Clear timeouts
          if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
          }
          
          updateCallState('connected', session);
          
          console.log('📞 Call connected successfully!', {
            callId: session.callId,
            duration: Date.now() - (session.startTime || Date.now())
          });
        }
      }, 2000);
    }
    
    // Original check for ICE connected + tracks
    if (iceConnectedRef.current && remoteTracksReceivedRef.current) {
      console.log('🎉 ICE CONNECTED + REMOTE TRACKS RECEIVED!');
      callConnectedTimeRef.current = Date.now();
      
      // Clear timeouts
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
      
      updateCallState('connected', session);
      
      console.log('✅ Call fully connected!', {
        callId: session.callId,
        peerId: session.peerId,
        callType: session.callType,
        timestamp: callConnectedTimeRef.current
      });
    }
  }, [updateCallState]);

  // Debug connection state
  const debugConnectionState = useCallback(() => {
    if (peerRef.current) {
      const pc = (peerRef.current as any).pc;
      if (pc) {
        console.log('📊 WebRTC Connection Debug:', {
          iceConnectionState: pc.iceConnectionState,
          connectionState: pc.connectionState,
          signalingState: pc.signalingState,
          iceGatheringState: pc.iceGatheringState,
          localDescription: pc.localDescription?.type,
          remoteDescription: pc.remoteDescription?.type,
          senders: pc.getSenders().length,
          receivers: pc.getReceivers().length
        });
        
        // Log track details
        const receivers = pc.getReceivers();
        receivers.forEach((receiver: RTCRtpReceiver, i: number) => {
          console.log(`   Receiver ${i}: ${receiver.track.kind} - ${receiver.track.id}, enabled: ${receiver.track.enabled}`);
        });
      }
    }
  }, []);

  // ICE restart function
  const restartICE = useCallback(async (callId: string) => {
    try {
      console.log('🔄 Starting ICE restart...');
      
      if (!peerRef.current) {
        console.error('No peer connection to restart');
        return;
      }
      
      // Create new offer with iceRestart flag
      const offer = await peerRef.current.createOffer({ iceRestart: true });
      
      if (offer.sdp) {
        await peerRef.current.setLocalDescription(offer);
        
        socketService.emit('call:offer', {
          callId,
          offer: offer.sdp,
          type: callSessionRef.current?.callType || 'audio',
          iceRestart: true
        });
        
        console.log('✅ ICE restart offer sent');
      }
    } catch (error) {
      console.error('Failed to restart ICE:', error);
    }
  }, []);

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
    if (connectionMonitorRef.current) {
      clearTimeout(connectionMonitorRef.current);
      connectionMonitorRef.current = null;
    }

    // Reset state
    iceConnectedRef.current = false;
    remoteTracksReceivedRef.current = false;

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
    console.log('📞 Incoming offer received:', data.callId);
    
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

    console.log('✅ Offer stored in pendingOfferRef');

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

  // Initiate outgoing call - UPDATED
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
        state: 'connecting', // Changed from 'initiating'
        localStream,
        iceServers,
        startTime: Date.now()
      };

      // 4. Create peer connection
      peerRef.current = new Peer(
        {
          iceServers: iceServers || [],
          iceTransportPolicy: 'all'
        },
        {
          onIceCandidate: (candidate) => {
            console.log('❄️ ICE candidate generated (caller)');
            socketService.emit('call:candidate', {
              callId,
              candidate
            });
          },
          onTrack: (event) => {
            console.log('📡 Remote track received (caller)', {
              kind: event.track.kind,
              streamId: event.streams[0]?.id
            });
            const remoteStream = event.streams[0];
            if (remoteStream) {
              session.remoteStream = remoteStream;
              remoteTracksReceivedRef.current = true;
              const updatedSession = { ...session };
              setCallSession(updatedSession);
              callSessionRef.current = updatedSession;
              onRemoteStream?.(remoteStream);
              
              // TEMPORARY: Force connected state after receiving tracks
              setTimeout(() => {
                if (updatedSession.state === 'connecting') {
                  console.log('🔥 FORCING CONNECTED STATE - we have media!');
                  updateCallState('connected', updatedSession);
                }
              }, 1000);
              
              checkConnectionEstablished(updatedSession);
            }
          },
          onIceConnectionStateChange: (state) => {
            console.log('❄️ ICE connection state (caller):', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              console.log('🎉 ICE CONNECTED!');
              if (session) {
                checkConnectionEstablished(session);
              }
            } else if (state === 'checking') {
              console.log('🔄 ICE checking - gathering candidates');
            } else if (state === 'disconnected') {
              console.warn('⚠️ ICE disconnected - network may be unstable');
              iceConnectedRef.current = false;
            } else if (state === 'failed') {
              console.error('❌ ICE connection failed');
              iceConnectedRef.current = false;
              // Try ICE restart after delay
              setTimeout(() => {
                if (session.state === 'connecting') {
                  console.log('🔄 Attempting ICE restart...');
                  restartICE(session.callId);
                }
              }, 1000);
            }
          },
          onConnectionStateChange: (state) => {
            console.log('🔗 Connection state (caller):', state);
            if (state === 'connected') {
              console.log('✅✅ PEER CONNECTION CONNECTED!');
            } else if (state === 'failed') {
              console.error('❌ Peer connection failed');
              if (session.state === 'connecting') {
                updateCallState('failed', session);
                onError?.('Connection failed');
              }
            }
          },
          onNegotiationNeeded: () => {
            console.log('⚡ Negotiation needed (caller)');
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
        if (currentSession && currentSession.callId === callId && currentSession.state === 'connecting') {
          console.log('⏰ Call connection timeout - checking status');
          
          debugConnectionState();
          
          // If we have remote tracks but ICE is still checking, give more time
          if (remoteTracksReceivedRef.current) {
            console.log('⚠️ Has remote tracks but ICE not connected - extending timeout');
            callTimeoutRef.current = setTimeout(async () => {
              await endCall('missed');
              onError?.('Connection timeout - ICE negotiation failed');
            }, 15000);
          } else {
            console.log('⏰ No remote tracks received - ending call');
            await endCall('missed');
            onError?.('Call not answered');
          }
        }
      }, CALL_TIMEOUT_MS);

      // Add connection monitor
      connectionMonitorRef.current = setInterval(() => {
        if (session && session.callId === callId && session.state === 'connecting') {
          console.log('🔄 Connection monitor - checking status');
          debugConnectionState();
          
          const connectionTime = Date.now() - (session.startTime || Date.now());
          if (connectionTime > 20000 && peerRef.current && !remoteTracksReceivedRef.current) {
            console.log('🔄 Long connection time - attempting ICE restart');
            restartICE(callId);
            clearInterval(connectionMonitorRef.current!);
          }
        } else {
          if (connectionMonitorRef.current) {
            clearInterval(connectionMonitorRef.current);
          }
        }
      }, 5000);

    } catch (error) {
      const errorMsg = `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      onError?.(errorMsg);
      updateCallState('failed');
    }
  }, [getLocalStream, updateCallState, onRemoteStream, onError, checkConnectionEstablished, endCall, restartICE, debugConnectionState]);

  // Answer incoming call - UPDATED
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

      // 3. Create session object FIRST
      const session: CallSession = {
        callId,
        peerId: stored.fromUserId,
        callType: stored.callType,
        state: 'connecting',
        localStream,
        iceServers,
        remoteStream: undefined,
        startTime: Date.now()
      };
      
      setCallSession(session);
      callSessionRef.current = session;

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
            console.log('📡 Remote track received (answer)', {
              kind: event.track.kind,
              streamId: event.streams[0]?.id
            });
            const remoteStream = event.streams[0];
            if (remoteStream) {
              session.remoteStream = remoteStream;
              remoteTracksReceivedRef.current = true;
              const updatedSession = { ...session };
              setCallSession(updatedSession);
              callSessionRef.current = updatedSession;
              onRemoteStream?.(remoteStream);
              
              // TEMPORARY: Force connected state after receiving tracks
              setTimeout(() => {
                if (updatedSession.state === 'connecting') {
                  console.log('🔥 FORCING CONNECTED STATE - we have media!');
                  updateCallState('connected', updatedSession);
                }
              }, 1000);
              
              checkConnectionEstablished(updatedSession);
            }
          },
          onIceConnectionStateChange: (state) => {
            console.log('❄️ ICE connection state (answer):', state);
            if (state === 'connected' || state === 'completed') {
              iceConnectedRef.current = true;
              console.log('🎉 ICE CONNECTED!');
              if (session) {
                checkConnectionEstablished(session);
              }
            } else if (state === 'checking') {
              console.log('🔄 ICE checking - gathering candidates');
            } else if (state === 'failed') {
              console.error('❌ ICE connection failed');
              iceConnectedRef.current = false;
              if (session.state === 'connecting') {
                updateCallState('failed', session);
              }
            }
          },
          onConnectionStateChange: (state) => {
            console.log('🔗 Connection state (answer):', state);
            if (state === 'connected') {
              console.log('✅✅ PEER CONNECTION CONNECTED!');
            } else if (state === 'failed') {
              console.error('❌ Peer connection failed');
              if (session.state === 'connecting') {
                updateCallState('failed', session);
              }
            }
          },
          onNegotiationNeeded: () => {
            console.log('⚡ Negotiation needed (answer side)');
          }
        }
      );

      // 5. Add local tracks BEFORE processing remote offer (CRITICAL!)
      console.log('📞 Adding local tracks BEFORE processing remote offer...');
      peerRef.current.addLocalTracks(localStream);
      console.log('✅ Local tracks added');

      // 6. Process remote offer
      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: stored.offer
      };
      console.log('📞 Processing remote offer...');
      const answer = await peerRef.current.acceptRemoteOffer(offer);
      console.log('✅ Remote offer processed, answer created');

      // 7. Send answer via socket
      socketService.emit('call:answer', {
        callId,
        answer: answer.sdp
      });

      console.log('✅ Call answered, answer sent');

      // Set connection timeout
      callTimeoutRef.current = setTimeout(() => {
        if (session.state === 'connecting') {
          console.log('⏰ Connection timeout - ending call');
          updateCallState('failed', session);
          onError?.('Connection timeout');
        }
      }, CALL_TIMEOUT_MS);

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
        console.log('✅ ICE candidate added');
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

  // Answer call by ID
  const answerCallById = useCallback(async (callId: string) => {
    try {
      console.log(`📞 Answering call by ID: ${callId}`);
      
      const stored = pendingOfferRef.current;
      if (stored && stored.callId === callId) {
        await answerCall(callId);
        return true;
      } else if (callSessionRef.current?.callId === callId) {
        console.log(`ℹ️ Already in call ${callId}`);
        return true;
      } else {
        console.log(`⏳ Offer not yet received for call ${callId}, waiting...`);
        
        const waitForOffer = new Promise<boolean>((resolve) => {
          const checkInterval = setInterval(() => {
            const current = pendingOfferRef.current;
            if (current && current.callId === callId) {
              clearInterval(checkInterval);
              console.log(`✅ Offer arrived for call ${callId}`);
              resolve(true);
            }
          }, 100);
          
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
      
      // Clean up any active call
      if (callState !== 'idle' && callState !== 'ended') {
        console.log('🧹 Cleaning up active call on unmount');
        endCall('user-ended');
      }
    };
  }, [
    handleIncomingOffer, 
    handleRemoteAnswer, 
    addIceCandidate, 
    updateCallState, 
    endCall, 
    handleIncomingCall,
    callState
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
    isConnected: callState === 'connected',
    callDuration: callConnectedTimeRef.current ? 
      Math.floor((Date.now() - callConnectedTimeRef.current) / 1000) : 0
  };
};