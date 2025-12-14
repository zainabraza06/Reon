/* WebRTC Peer helper focused on resilience and low setup latency. */

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
  encodedInsertableStreams?: boolean;
};

export class Peer {
  private pc: RTCPeerConnection;
  private callbacks: PeerCallbacks;
  private bufferedCandidates: RTCIceCandidateInit[] = [];
  private turnOnlyFallback = false;

  constructor(config: PeerConfig, callbacks: PeerCallbacks = {}) {
    this.callbacks = callbacks;
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceTransportPolicy: config.iceTransportPolicy || "all",
      bundlePolicy: config.bundlePolicy || "balanced"
    });

    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.callbacks.onIceCandidate) {
        this.callbacks.onIceCandidate(e.candidate.toJSON());
      }
    };

    this.pc.ontrack = (ev) => this.callbacks.onTrack?.(ev);
    this.pc.oniceconnectionstatechange = () =>
      this.callbacks.onIceConnectionStateChange?.(this.pc.iceConnectionState);
    this.pc.onconnectionstatechange = () =>
      this.callbacks.onConnectionStateChange?.(this.pc.connectionState);
    this.pc.onnegotiationneeded = () =>
      this.callbacks.onNegotiationNeeded?.();
  }

  get connection() {
    return this.pc;
  }

  addLocalTracks(stream: MediaStream) {
    const tracks = stream.getTracks();
    const audioTracks = tracks.filter(t => t.kind === 'audio');
    const videoTracks = tracks.filter(t => t.kind === 'video');
    
    console.log(`📡 Adding tracks: ${audioTracks.length} audio, ${videoTracks.length} video`);
    
    // CRITICAL: Ensure all audio tracks are enabled and not muted before adding
    audioTracks.forEach((track) => {
      if (!track.enabled) {
        console.warn(`⚠️ Audio track ${track.id} is disabled, enabling it`);
        track.enabled = true;
      }
      if (track.muted) {
        console.warn(`⚠️ Audio track ${track.id} is muted`);
      }
      console.log(`  Audio track state: id=${track.id}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });
    
    // CRITICAL: Lock track add order - audio FIRST, then video
    // This ensures m-line order is consistent: m=audio, m=video
    // Order must never change across call lifecycle
    const orderedTracks = [...audioTracks, ...videoTracks];
    
    orderedTracks.forEach((t) => {
      this.pc.addTrack(t, stream);
      console.log(`  Added ${t.kind} track: id=${t.id}, enabled=${t.enabled}`);
    });
    
    // Verify tracks were added and senders are configured
    const senders = this.pc.getSenders();
    const audioSenders = senders.filter(s => s.track && s.track.kind === 'audio');
    const videoSenders = senders.filter(s => s.track && s.track.kind === 'video');
    console.log(`✅ Senders after add: ${audioSenders.length} audio, ${videoSenders.length} video`);
    
    // CRITICAL: Verify audio senders have active tracks
    audioSenders.forEach((sender, idx) => {
      const track = sender.track;
      if (track) {
        console.log(`  Audio sender ${idx}: trackId=${track.id}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        if (!track.enabled || track.muted || track.readyState !== 'live') {
          console.error(`❌ Audio sender ${idx} has inactive track!`);
        }
      } else {
        console.error(`❌ Audio sender ${idx} has no track!`);
      }
    });
  }

  async createOffer() {
    // CRITICAL: Hard fail safety guard - only create offer if signaling state is stable
    if (this.pc.signalingState !== 'stable') {
      const error = `Cannot create offer: signaling state is "${this.pc.signalingState}", not "stable"`;
      console.error(`❌ [createOffer] ${error}`);
      throw new Error(error);
    }
    
    // CRITICAL: Safety check - ensure no null tracks
    const senders = this.pc.getSenders();
    const hasNullTrack = senders.some(s => s.track === null);
    if (hasNullTrack) {
      const error = 'Cannot create offer: found sender with null track';
      console.error(`❌ [createOffer] ${error}`);
      throw new Error(error);
    }
    
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    // Verify we have tracks before creating answer
    const senders = this.pc.getSenders();
    const audioSenders = senders.filter(s => s.track && s.track.kind === 'audio');
    console.log('📤 Creating answer - audio senders:', audioSenders.length);
    
    const answer = await this.pc.createAnswer();
    
    // Verify SDP includes audio
    if (answer.sdp) {
      const hasAudio = answer.sdp.includes('m=audio');
      console.log('📋 Answer SDP has audio:', hasAudio);
      if (!hasAudio) {
        console.error('❌ Answer SDP missing audio media line!');
      }
    }
    
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptRemoteOffer(offer: RTCSessionDescriptionInit) {
    // CRITICAL: Verify offer SDP includes audio before accepting
    if (offer.sdp) {
      const hasAudio = offer.sdp.includes('m=audio');
      console.log('📥 Accepting remote offer - SDP has audio:', hasAudio);
      if (!hasAudio) {
        console.error('❌ Remote offer SDP missing audio media line!');
      }
    }
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Verify we have receivers after setting remote description
    const receivers = this.pc.getReceivers();
    const audioReceivers = receivers.filter(r => r.track && r.track.kind === 'audio');
    console.log('📥 After setting remote offer - audio receivers:', audioReceivers.length);
    
    await this.flushBufferedCandidates();
    return this.createAnswer();
  }

  async acceptRemoteAnswer(answer: RTCSessionDescriptionInit) {
    // CRITICAL: Verify answer SDP includes audio before accepting
    if (answer.sdp) {
      const hasAudio = answer.sdp.includes('m=audio');
      console.log('📥 Accepting remote answer - SDP has audio:', hasAudio);
      if (!hasAudio) {
        console.error('❌ Remote answer SDP missing audio media line!');
      }
    }
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    
    // Verify we have receivers after setting remote description
    const receivers = this.pc.getReceivers();
    const audioReceivers = receivers.filter(r => r.track && r.track.kind === 'audio');
    console.log('📥 After setting remote answer - audio receivers:', audioReceivers.length);
    
    await this.flushBufferedCandidates();
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
    const queued = [...this.bufferedCandidates];
    this.bufferedCandidates = [];
    for (const cand of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn("Buffered candidate add failed", err);
      }
    }
  }

  async restartIce(turnOnly = false) {
    // CRITICAL: Block restartIce from creating new offers during active call
    // This prevents SDP m-line ordering errors
    console.warn('⚠️ [restartIce] BLOCKED: restartIce() should not be called during active call to prevent renegotiation');
    throw new Error('restartIce() is blocked to prevent SDP m-line ordering errors');
  }

  // Prioritize audio by lowering video max bitrate if bandwidth drops.
  async setMaxBitrate(track: MediaStreamTrack, maxBitrate: number) {
    const sender = this.pc.getSenders().find((s) => s.track?.id === track.id);
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    params.encodings[0].maxBitrate = maxBitrate;
    await sender.setParameters(params);
  }

  close() {
    // CRITICAL: Do NOT stop tracks here - tracks are owned by useWebRTC
    // Only close the peer connection. Track cleanup is handled by useWebRTC.endCall()
    console.log('🔌 Closing peer connection (tracks preserved for cleanup by owner)');
    this.pc.close();
  }
}

