"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "@/lib/api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:5001";

export type CallStatus =
  | "idle"
  | "calling"    // outgoing, waiting for answer
  | "incoming"   // incoming ring
  | "connecting" // ICE/SDP exchange in progress
  | "active"     // call connected
  | "ended";

export interface CallState {
  status: CallStatus;
  callId: string | null;
  peerId: string | null;       // other user's ID
  peerName: string | null;
  type: "audio" | "video";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  duration: number;            // seconds
}

const INIT: CallState = {
  status: "idle",
  callId: null,
  peerId: null,
  peerName: null,
  type: "audio",
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,
  duration: 0,
};

export function useCall(myId: string | null) {
  const [state, setState] = useState<CallState>(INIT);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callSockRef = useRef<Socket | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // ── connect /calls namespace with cookie auth ────────────────────────────
  const connectCallSocket = useCallback((token?: string) => {
    if (callSockRef.current?.connected) return;
    const sock = io(`${SOCKET_URL}/calls`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      auth: token ? { token } : undefined,
    });
    callSockRef.current = sock;

    sock.on("call:initiate", ({ callId, fromUserId, fromUserName, type }: {
      callId: string; fromUserId: string; fromUserName: string; type: "audio" | "video";
    }) => {
      if (stateRef.current.status !== "idle") {
        sock.emit("call:busy", { callId });
        return;
      }
      setState((s) => ({
        ...s,
        status: "incoming",
        callId,
        peerId: fromUserId,
        peerName: fromUserName,
        type: type as "audio" | "video",
      }));
    });

    sock.on("call:offer", async ({ callId, offer, type }: { callId: string; offer: RTCSessionDescriptionInit; type: string }) => {
      if (stateRef.current.callId !== callId) return;
      await ensurePeerConnection(callId, type as "audio" | "video", false);
      const pc = pcRef.current!;
      await pc.setRemoteDescription(offer);
      // Drain queued ICE candidates
      for (const c of iceQueueRef.current) await pc.addIceCandidate(c).catch(() => {});
      iceQueueRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sock.emit("call:answer", { callId, answer });
      setState((s) => ({ ...s, status: "connecting" }));
    });

    sock.on("call:answer", async ({ callId, answer }: { callId: string; answer: RTCSessionDescriptionInit }) => {
      if (stateRef.current.callId !== callId || !pcRef.current) return;
      await pcRef.current.setRemoteDescription(answer).catch(console.error);
      setState((s) => ({ ...s, status: "connecting" }));
    });

    sock.on("call:candidate", async ({ callId, candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (stateRef.current.callId !== callId) return;
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(candidate).catch(() => {});
      } else {
        iceQueueRef.current.push(candidate);
      }
    });

    sock.on("call:reject",  ({ callId }: { callId: string }) => { if (stateRef.current.callId === callId) endCallLocal("rejected"); });
    sock.on("call:hangup",  ({ callId }: { callId: string }) => { if (stateRef.current.callId === callId) endCallLocal("ended"); });
    sock.on("call:busy",    ({ callId }: { callId: string }) => { if (stateRef.current.callId === callId) endCallLocal("busy"); });

    sock.on("call:track:update", ({ trackType, enabled }: { trackType: string; enabled: boolean }) => {
      // Could show remote mute indicator — omitted for brevity
      void trackType; void enabled;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (myId) connectCallSocket();
    return () => { callSockRef.current?.disconnect(); };
  }, [myId, connectCallSocket]);

  // ── build RTCPeerConnection ───────────────────────────────────────────────
  const ensurePeerConnection = useCallback(async (callId: string, type: "audio" | "video", isInitiator: boolean) => {
    if (pcRef.current) return;
    const { iceServers } = await api.calls.get(callId);
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) callSockRef.current?.emit("call:candidate", { callId, candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setState((s) => ({ ...s, status: "active" }));
        startDurationTimer();
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        endCallLocal("ended");
      }
    };
    pc.ontrack = (e) => {
      setState((s) => ({ ...s, remoteStream: e.streams[0] ?? null }));
    };

    // Attach local tracks
    try {
      const constraints: MediaStreamConstraints = { audio: true, video: type === "video" };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      setState((s) => ({ ...s, localStream: stream }));
    } catch {
      console.warn("Media access issue — continuing without local stream");
    }

    pcRef.current = pc;
    return pc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Duration timer ────────────────────────────────────────────────────────
  const startDurationTimer = () => {
    if (durationTimer.current) return;
    durationTimer.current = setInterval(() => {
      setState((s) => ({ ...s, duration: s.duration + 1 }));
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null; }
  };

  // ── End call (local cleanup) ──────────────────────────────────────────────
  const endCallLocal = useCallback((reason = "ended") => {
    stopDurationTimer();
    stateRef.current.localStream?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    iceQueueRef.current = [];
    setState({ ...INIT });
    void reason;
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const startCall = useCallback(async (toUserId: string, peerName: string, type: "audio" | "video") => {
    if (!myId || stateRef.current.status !== "idle") return;
    try {
      const { callId, iceServers } = await api.calls.create(toUserId, type);
      setState((s) => ({ ...s, status: "calling", callId, peerId: toUserId, peerName, type }));

      await ensurePeerConnection(callId, type, true);
      const pc = pcRef.current!;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      callSockRef.current?.emit("call:offer", { callId, offer, type });
    } catch (err) {
      console.error("startCall error:", err);
      endCallLocal("error");
    }
  }, [myId, ensurePeerConnection, endCallLocal]);

  const answerCall = useCallback(async () => {
    const { callId, type } = stateRef.current;
    if (!callId || stateRef.current.status !== "incoming") return;
    setState((s) => ({ ...s, status: "connecting" }));
    await ensurePeerConnection(callId, type, false);
    // The offer arrives via socket (call:offer event handles createAnswer)
  }, [ensurePeerConnection]);

  const rejectCall = useCallback(() => {
    const { callId } = stateRef.current;
    if (callId) callSockRef.current?.emit("call:reject", { callId });
    endCallLocal("rejected");
  }, [endCallLocal]);

  const hangUp = useCallback(() => {
    const { callId } = stateRef.current;
    if (callId) callSockRef.current?.emit("call:hangup", { callId });
    endCallLocal("hangup");
  }, [endCallLocal]);

  const toggleMute = useCallback(() => {
    const { localStream, isMuted, callId } = stateRef.current;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    callSockRef.current?.emit("call:track:update", { callId, trackType: "audio", enabled: isMuted });
    setState((s) => ({ ...s, isMuted: !s.isMuted }));
  }, []);

  const toggleCamera = useCallback(() => {
    const { localStream, isCameraOff, callId } = stateRef.current;
    localStream?.getVideoTracks().forEach((t) => { t.enabled = isCameraOff; });
    callSockRef.current?.emit("call:track:update", { callId, trackType: "video", enabled: isCameraOff });
    setState((s) => ({ ...s, isCameraOff: !s.isCameraOff }));
  }, []);

  return { state, startCall, answerCall, rejectCall, hangUp, toggleMute, toggleCamera };
}
