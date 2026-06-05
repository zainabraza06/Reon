"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "@/lib/api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:5001";

export type CallStatus = "idle" | "calling" | "incoming" | "connecting" | "active" | "ended";
export type CallEndReason = "completed" | "declined" | "missed" | "busy" | "failed" | null;

export interface CallState {
  status: CallStatus;
  callId: string | null;
  peerId: string | null;
  peerName: string | null;
  type: "audio" | "video";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  duration: number;
  endReason: CallEndReason;
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
  endReason: null,
};

// Save a call-log message in the conversation so both sides see it
async function saveCallLog(
  myId: string,
  peerId: string,
  callType: "audio" | "video",
  outcome: "completed" | "missed" | "declined" | "busy",
  duration: number
) {
  try {
    const fd = new FormData();
    fd.append("data", JSON.stringify({
      sender: myId,
      receiver: peerId,
      contentType: "call-log",
      ciphertext: JSON.stringify({ callType, outcome, duration }),
      encryptedKey: "",
      senderEncryptedKey: "",
    }));
    await api.messages.send(fd);
  } catch {
    // Non-critical — don't crash if call log fails
  }
}

export function useCall(myId: string | null) {
  const [state, setState] = useState<CallState>(INIT);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callSockRef = useRef<Socket | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  // Track if call was ever active (to distinguish missed from never-answered)
  const wasActivatedRef = useRef(false);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

  const stopDurationTimer = () => {
    if (durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null; }
  };

  const endCallLocal = useCallback((reason: CallEndReason = "completed") => {
    const { localStream, peerId, type, duration, status } = stateRef.current;
    stopDurationTimer();
    localStream?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    iceQueueRef.current = [];
    pendingOfferRef.current = null; // Clear any pending offer

    // Save call log if we have a peer and reason is meaningful
    if (myId && peerId) {
      const outcome =
        reason === "declined" ? "declined" :
        reason === "missed"   ? "missed" :
        reason === "busy"     ? "busy" :
        status === "active" || wasActivatedRef.current ? "completed" : "missed";
      saveCallLog(myId, peerId, type, outcome, duration);
    }

    wasActivatedRef.current = false;
    setState({ ...INIT, status: "ended", endReason: reason });
    // Reset to fully idle after a brief moment (enough for UI to show the reason)
    setTimeout(() => setState(INIT), 3500);
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ensurePeerConnection = useCallback(async (callId: string, type: "audio" | "video") => {
    if (pcRef.current) return pcRef.current;
    const { iceServers } = await api.calls.get(callId);
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) callSockRef.current?.emit("call:candidate", { callId, candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        wasActivatedRef.current = true;
        setState((s) => ({ ...s, status: "active" }));
        // start timer
        if (!durationTimer.current) {
          durationTimer.current = setInterval(() =>
            setState((s) => ({ ...s, duration: s.duration + 1 })), 1000);
        }
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        endCallLocalRef.current?.("completed");
      }
    };
    pc.ontrack = (e) => {
      setState((s) => ({ ...s, remoteStream: e.streams[0] ?? null }));
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      setState((s) => ({ ...s, localStream: stream }));
    } catch {
      console.warn("Media access denied — audio/video unavailable");
    }

    pcRef.current = pc;
    return pc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processOffer = useCallback(async (callId: string, offer: RTCSessionDescriptionInit, type: "audio" | "video") => {
    await ensurePeerConnectionRef.current?.(callId, type);
    const pc = pcRef.current!;
    try {
      await pc.setRemoteDescription(offer);
      for (const c of iceQueueRef.current) await pc.addIceCandidate(c).catch(() => {});
      iceQueueRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      callSockRef.current?.emit("call:answer", { callId, answer });
      setState((s) => ({ ...s, status: "connecting" }));
    } catch (err) {
      console.error("processOffer error:", err);
      endCallLocalRef.current?.("failed");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable refs for callbacks invoked inside socket handlers to avoid stale closures
  const processOfferRef = useRef(processOffer);
  processOfferRef.current = processOffer;

  const endCallLocalRef = useRef(endCallLocal);
  endCallLocalRef.current = endCallLocal;

  const ensurePeerConnectionRef = useRef(ensurePeerConnection);
  ensurePeerConnectionRef.current = ensurePeerConnection;

  const connectCallSocket = useCallback(() => {
    if (callSockRef.current?.connected) return;
    const sock = io(`${SOCKET_URL}/calls`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    callSockRef.current = sock;

    sock.on("call:initiate", ({ callId, fromUserId, fromUserName, type }: {
      callId: string; fromUserId: string; fromUserName: string; type: "audio" | "video";
    }) => {
      if (stateRef.current.status !== "idle") {
        sock.emit("call:busy", { callId, reason: "busy" });
        return;
      }
      setState((s) => ({ ...s, status: "incoming", callId, peerId: fromUserId, peerName: fromUserName, type }));
    });

    sock.on("call:offer", async ({ callId, offer, type }: { callId: string; offer: RTCSessionDescriptionInit; type: string }) => {
      if (stateRef.current.callId !== callId) return;
      pendingOfferRef.current = offer;
      
      // Only process offer if user has already accepted and we are in connecting status
      if (stateRef.current.status === "connecting") {
        await processOfferRef.current?.(callId, offer, type as "audio" | "video");
      }
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

    sock.on("call:reject", ({ callId }: { callId: string }) => {
      if (stateRef.current.callId === callId) endCallLocalRef.current?.("declined");
    });
    sock.on("call:hangup", ({ callId }: { callId: string }) => {
      if (stateRef.current.callId === callId) endCallLocalRef.current?.("completed");
    });
    sock.on("call:busy", ({ callId }: { callId: string }) => {
      if (stateRef.current.callId === callId) endCallLocalRef.current?.("busy");
    });

    sock.on("call:track:update", (_: unknown) => { /* remote mute state — future */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (myId) connectCallSocket();
    return () => { callSockRef.current?.disconnect(); };
  }, [myId, connectCallSocket]);

  const startCall = useCallback(async (toUserId: string, peerName: string, type: "audio" | "video") => {
    if (!myId || stateRef.current.status !== "idle") return;
    try {
      const { callId } = await api.calls.create(toUserId, type);
      setState((s) => ({ ...s, status: "calling", callId, peerId: toUserId, peerName, type }));
      await ensurePeerConnection(callId, type);
      const pc = pcRef.current!;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      callSockRef.current?.emit("call:offer", { callId, offer, type });
    } catch (err) {
      console.error("startCall error:", err);
      endCallLocal("failed");
    }
  }, [myId, ensurePeerConnection, endCallLocal]);

  const answerCall = useCallback(async () => {
    const { callId, type } = stateRef.current;
    if (!callId || stateRef.current.status !== "incoming") return;
    setState((s) => ({ ...s, status: "connecting" }));

    if (pendingOfferRef.current) {
      await processOffer(callId, pendingOfferRef.current, type);
      pendingOfferRef.current = null;
    } else {
      await ensurePeerConnection(callId, type);
    }
  }, [ensurePeerConnection, processOffer]);

  const rejectCall = useCallback(() => {
    const { callId } = stateRef.current;
    if (callId) callSockRef.current?.emit("call:reject", { callId });
    endCallLocal("declined");
  }, [endCallLocal]);

  const hangUp = useCallback(() => {
    const { callId } = stateRef.current;
    if (callId) callSockRef.current?.emit("call:hangup", { callId });
    endCallLocal("completed");
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
