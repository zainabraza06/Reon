/* eslint-disable @typescript-eslint/no-explicit-any */
type IceServer = RTCIceServer;

export type PeerCallbacks = {
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onTrack?: (event: RTCTrackEvent) => void;
  onNegotiationNeeded?: () => void;
};

export type PeerConfig = {
  iceServers: IceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
};

export class Peer {
  private pc: RTCPeerConnection;
  private callbacks: PeerCallbacks;
  private bufferedCandidates: RTCIceCandidateInit[] = [];
  
  // Track senders for replacement
  private audioSender: RTCRtpSender | null = null;
  private videoSender: RTCRtpSender | null = null;

  constructor(config: PeerConfig, callbacks: PeerCallbacks = {}) {
    this.callbacks = callbacks;
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceTransportPolicy: config.iceTransportPolicy || "all",
      bundlePolicy: config.bundlePolicy || "balanced",
      rtcpMuxPolicy: "require"
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.callbacks.onIceCandidate) {
        this.callbacks.onIceCandidate(e.candidate.toJSON());
      }
    };

    this.pc.ontrack = (ev) => {
      console.log(`📥 Received remote ${ev.track.kind} track`);
      this.callbacks.onTrack?.(ev);
    };
    
    this.pc.oniceconnectionstatechange = () => {
      console.log(`❄️ ICE state: ${this.pc.iceConnectionState}`);
      this.callbacks.onIceConnectionStateChange?.(this.pc.iceConnectionState);
    };
    
    this.pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state: ${this.pc.connectionState}`);
      this.callbacks.onConnectionStateChange?.(this.pc.connectionState);
    };
    
    this.pc.onnegotiationneeded = () => {
      console.log('🔄 Negotiation needed');
      this.callbacks.onNegotiationNeeded?.();
    };
    
    this.pc.onsignalingstatechange = () => {
      console.log(`📡 Signaling state: ${this.pc.signalingState}`);
    };
  }

  get connection() {
    return this.pc;
  }

  addLocalTracks(stream: MediaStream) {
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    
    console.log(`📡 Processing tracks: ${audioTracks.length} audio, ${videoTracks.length} video`);
    
    // Handle audio track
    if (audioTracks.length > 0) {
      const audioTrack = audioTracks[0];
      console.log(`🔊 Audio track: id=${audioTrack.id}, enabled=${audioTrack.enabled}, muted=${audioTrack.muted}`);
      
      if (this.audioSender) {
        // Replace existing audio track
        console.log('🔄 Replacing existing audio track');
        this.audioSender.replaceTrack(audioTrack);
      } else {
        // Add new audio track
        console.log('➕ Adding new audio track');
        this.audioSender = this.pc.addTrack(audioTrack, stream);
      }
    } else if (this.audioSender) {
      // Remove audio if no track provided
      console.log('➖ Removing audio track');
      this.pc.removeTrack(this.audioSender);
      this.audioSender = null;
    }
    
    // Handle video track
    if (videoTracks.length > 0) {
      const videoTrack = videoTracks[0];
      console.log(`📹 Video track: id=${videoTrack.id}, enabled=${videoTrack.enabled}, muted=${videoTrack.muted}`);
      
      if (this.videoSender) {
        // Replace existing video track
        console.log('🔄 Replacing existing video track');
        this.videoSender.replaceTrack(videoTrack);
      } else {
        // Add new video track
        console.log('➕ Adding new video track');
        this.videoSender = this.pc.addTrack(videoTrack, stream);
      }
    } else if (this.videoSender) {
      // Remove video if no track provided
      console.log('➖ Removing video track');
      this.pc.removeTrack(this.videoSender);
      this.videoSender = null;
    }
    
    this.verifyTrackSetup();
  }

  replaceTrack(kind: 'audio' | 'video', newTrack: MediaStreamTrack): boolean {
    const sender = kind === 'audio' ? this.audioSender : this.videoSender;
    
    if (!sender) {
      console.error(`❌ No ${kind} sender to replace`);
      return false;
    }
    
    try {
      console.log(`🔄 Replacing ${kind} track: ${sender.track?.id} → ${newTrack.id}`);
      sender.replaceTrack(newTrack);
      return true;
    } catch (error) {
      console.error(`❌ Failed to replace ${kind} track:`, error);
      return false;
    }
  }

  /**
   * Verify track setup is correct
   */
  private verifyTrackSetup() {
    const senders = this.pc.getSenders();
    const receivers = this.pc.getReceivers();
    
    console.log('🔍 Track verification:');
    console.log(`   Senders: ${senders.length} (audio: ${senders.filter(s => s.track?.kind === 'audio').length}, video: ${senders.filter(s => s.track?.kind === 'video').length})`);
    console.log(`   Receivers: ${receivers.length} (audio: ${receivers.filter(r => r.track?.kind === 'audio').length}, video: ${receivers.filter(r => r.track?.kind === 'video').length})`);
    
    // Check for duplicate track kinds (should never happen)
    const audioSenders = senders.filter(s => s.track?.kind === 'audio');
    const videoSenders = senders.filter(s => s.track?.kind === 'video');
    
    if (audioSenders.length > 1) {
      console.error(`❌ ERROR: Found ${audioSenders.length} audio senders (should be 0 or 1)`);
    }
    
    if (videoSenders.length > 1) {
      console.error(`❌ ERROR: Found ${videoSenders.length} video senders (should be 0 or 1)`);
    }
  }

  async createOffer(options?: RTCOfferOptions) {
    // Verify signaling state
    if (this.pc.signalingState !== 'stable') {
      const error = `Cannot create offer: signaling state is "${this.pc.signalingState}"`;
      console.error(`❌ ${error}`);
      throw new Error(error);
    }
    
    this.verifyTrackSetup();
    
    console.log('📤 Creating offer...');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
      iceRestart: options?.iceRestart || false
    });
    
    // Log SDP details
    this.logSdpDetails('Offer', offer.sdp);
    
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    this.verifyTrackSetup();
    
    console.log('📤 Creating answer...');
    const answer = await this.pc.createAnswer();
    
    // Log SDP details
    this.logSdpDetails('Answer', answer.sdp);
    
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptRemoteOffer(offer: RTCSessionDescriptionInit) {
    console.log('📥 Setting remote description (offer)...');
    
    // Log incoming SDP
    this.logSdpDetails('Remote Offer', offer.sdp);
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log('✅ Remote description set');
    
    await this.flushBufferedCandidates();
    
    return this.createAnswer();
  }

  async acceptRemoteAnswer(answer: RTCSessionDescriptionInit) {
    console.log('📥 Setting remote description (answer)...');
    
    // Log incoming SDP
    this.logSdpDetails('Remote Answer', answer.sdp);
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote answer processed');
    
    await this.flushBufferedCandidates();
  }

  // NEW: Explicit setLocalDescription method
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    console.log(`📝 Setting local description: ${description.type}`);
    await this.pc.setLocalDescription(new RTCSessionDescription(description));
    console.log('✅ Local description set');
  }

  async addCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc.remoteDescription) {
      this.bufferedCandidates.push(candidate);
      return;
    }
    
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("Failed to add ICE candidate", err);
    }
  }

  private async flushBufferedCandidates() {
    if (!this.bufferedCandidates.length) return;
    
    console.log(`📦 Flushing ${this.bufferedCandidates.length} buffered ICE candidates`);
    
    for (const cand of this.bufferedCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn("Buffered candidate add failed", err);
      }
    }
    
    this.bufferedCandidates = [];
  }
  
  private logSdpDetails(type: string, sdp?: string) {
    if (!sdp) return;
    
    const hasAudio = sdp.includes('m=audio');
    const hasVideo = sdp.includes('m=video');
    const audioLines = sdp.split('\n').filter(line => line.includes('a=rtpmap') && line.includes('audio'));
    const videoLines = sdp.split('\n').filter(line => line.includes('a=rtpmap') && line.includes('video'));
    
    console.log(`📋 ${type} SDP Analysis:`);
    console.log(`   Has audio: ${hasAudio}, Has video: ${hasVideo}`);
    console.log(`   Audio codecs: ${audioLines.length}, Video codecs: ${videoLines.length}`);
  }

  getTrackStatus() {
    const senders = this.pc.getSenders();
    const receivers = this.pc.getReceivers();
    
    return {
      localAudio: senders.find(s => s.track?.kind === 'audio')?.track,
      localVideo: senders.find(s => s.track?.kind === 'video')?.track,
      remoteAudio: receivers.find(r => r.track?.kind === 'audio')?.track,
      remoteVideo: receivers.find(r => r.track?.kind === 'video')?.track,
      senderCount: senders.length,
      receiverCount: receivers.length
    };
  }

  close() {
    console.log('🔌 Closing peer connection');
    
    // Clear senders
    this.audioSender = null;
    this.videoSender = null;
    
    // Clear buffers
    this.bufferedCandidates = [];
    
    // Close connection
    if (this.pc.signalingState !== 'closed') {
      this.pc.close();
    }
  }
}