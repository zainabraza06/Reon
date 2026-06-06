"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "@/lib/api";

const SOCKET_URL    = process.env.NEXT_PUBLIC_SOCKET_URL  ?? "http://localhost:5001";
const METERED_DOMAIN = process.env.NEXT_PUBLIC_METERED_DOMAIN ?? "";

// ── Metered SDK loader (CDN, singleton) ────────────────────────────────────
let meteredSdkPromise: Promise<void> | null = null;
function loadMeteredSDK(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).Metered) return Promise.resolve();
  if (meteredSdkPromise) return meteredSdkPromise;
  meteredSdkPromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://cdn.metered.ca/sdk/video/1.4.6/sdk.min.js";
    el.onload  = () => resolve();
    el.onerror = () => { meteredSdkPromise = null; reject(new Error("Failed to load Metered SDK")); };
    document.body.appendChild(el);
  });
  return meteredSdkPromise;
}

// ── Types ──────────────────────────────────────────────────────────────────
export type CallStatus    = "idle" | "calling" | "incoming" | "connecting" | "active" | "ended";
export type CallEndReason = "completed" | "declined" | "missed" | "busy" | "failed" | null;

export interface CallState {
  status:      CallStatus;
  callId:      string | null;
  roomName:    string | null;
  roomURL:     string | null;
  peerId:      string | null;
  peerName:    string | null;
  type:        "audio" | "video";
  localStream: MediaStream | null;
  remoteStream:MediaStream | null;
  isMuted:     boolean;
  isCameraOff: boolean;
  duration:    number;
  endReason:   CallEndReason;
}

const INIT: CallState = {
  status: "idle", callId: null, roomName: null, roomURL: null,
  peerId: null, peerName: null, type: "audio",
  localStream: null, remoteStream: null,
  isMuted: false, isCameraOff: false,
  duration: 0, endReason: null,
};

// Save a call-log message in the conversation so both sides see it
async function saveCallLog(
  myId: string, peerId: string,
  callType: "audio" | "video",
  outcome: "completed" | "missed" | "declined" | "busy",
  duration: number
) {
  try {
    const fd = new FormData();
    fd.append("data", JSON.stringify({
      sender: myId, receiver: peerId, contentType: "call-log",
      ciphertext: JSON.stringify({ callType, outcome, duration }),
      encryptedKey: "", senderEncryptedKey: "",
    }));
    await api.messages.send(fd);
  } catch { /* non-critical */ }
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useCall(myId: string | null, myName?: string | null) {
  const [state, setState] = useState<CallState>(INIT);
  const stateRef          = useRef(state);
  stateRef.current        = state;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meetingRef        = useRef<any>(null); // Metered.Meeting instance
  const remoteStreamRef   = useRef<MediaStream | null>(null);
  const callSockRef       = useRef<Socket | null>(null);
  const durationTimer     = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasActivatedRef   = useRef(false);
  const ringTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Duration timer ───────────────────────────────────────────────────────
  const stopTimer = () => {
    if (durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null; }
  };

  const activateCall = useCallback(() => {
    wasActivatedRef.current = true;
    if (!durationTimer.current) {
      durationTimer.current = setInterval(
        () => setState((s) => ({ ...s, duration: s.duration + 1 })), 1000
      );
    }
    setState((s) => s.status === "active" ? s : { ...s, status: "active" });
  }, []);
  const activateCallRef = useRef(activateCall);
  activateCallRef.current = activateCall;

  // ── End call ─────────────────────────────────────────────────────────────
  const endCallLocal = useCallback((reason: CallEndReason = "completed") => {
    const { localStream, peerId, type, duration, status } = stateRef.current;
    stopTimer();
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }

    localStream?.getTracks().forEach((t) => t.stop());
    if (meetingRef.current) {
      try { meetingRef.current.leaveMeeting(); } catch {}
      meetingRef.current = null;
    }
    remoteStreamRef.current = null;

    if (myId && peerId) {
      const outcome =
        reason === "declined" ? "declined" :
        reason === "missed"   ? "missed" :
        reason === "busy"     ? "busy" :
        (status === "active" || wasActivatedRef.current) ? "completed" : "missed";
      saveCallLog(myId, peerId, type, outcome, duration);
    }

    wasActivatedRef.current = false;
    setState({ ...INIT, status: "ended", endReason: reason });
    setTimeout(() => setState(INIT), 3500);
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const endCallLocalRef = useRef(endCallLocal);
  endCallLocalRef.current = endCallLocal;

  // ── Join Metered room ─────────────────────────────────────────────────────
  const joinRoom = useCallback(async (roomURL: string, type: "audio" | "video") => {
    await loadMeteredSDK();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meeting = new (window as any).Metered.Meeting();
    meetingRef.current = meeting;

    const displayName = myName || "User";
    await meeting.join({
      roomURL: roomURL,
      name:    displayName,
    });

    // ── Local tracks ────────────────────────────────────────────────────────
    try {
      await meeting.startAudio();
    } catch (e) {
      console.warn("[Metered] startAudio failed:", e);
    }
    if (type === "video") {
      try {
        await meeting.startVideo();
      } catch (e) {
        console.warn("[Metered] startVideo failed:", e);
      }
    }

    const localStream = new MediaStream();

    meeting.on("localTrackStarted", (item: { type: string; track: MediaStreamTrack }) => {
      localStream.addTrack(item.track);
      setState((s) => ({ ...s, localStream }));
    });

    // ── Remote tracks ────────────────────────────────────────────────────────
    meeting.on("remoteTrackStarted", (item: { type: string; track: MediaStreamTrack }) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      // Remove stale tracks of the same kind to avoid duplicates
      const stale = item.type === "video"
        ? remoteStreamRef.current.getVideoTracks()
        : remoteStreamRef.current.getAudioTracks();
      stale.forEach((t) => remoteStreamRef.current!.removeTrack(t));
      remoteStreamRef.current.addTrack(item.track);
      setState((s) => ({ ...s, remoteStream: remoteStreamRef.current }));
      activateCallRef.current();
    });

    meeting.on("remoteTrackStopped", (item: { type: string; track: MediaStreamTrack }) => {
      remoteStreamRef.current?.removeTrack(item.track);
    });

    // ── Participant left / meeting ended → hang up ───────────────────────────
    meeting.on("participantLeft", () => {
      endCallLocalRef.current("completed");
    });
    meeting.on("meetingEnded", () => {
      endCallLocalRef.current("completed");
    });
  }, [myName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket: incoming call signaling ──────────────────────────────────────
  useEffect(() => {
    if (!myId) return;

    const sock = io(`${SOCKET_URL}/calls`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    callSockRef.current = sock;

    sock.on("call:initiate", ({
      callId, fromUserId, fromUserName, type, roomName, roomURL
    }: { callId: string; fromUserId: string; fromUserName: string; type: "audio" | "video"; roomName: string; roomURL: string }) => {
      if (stateRef.current.status !== "idle") {
        sock.emit("call:busy", { callId, reason: "busy" });
        return;
      }
      // Auto-miss after 45 s of no answer
      ringTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.status === "incoming") endCallLocalRef.current("missed");
      }, 45_000);
      setState((s) => ({ ...s, status: "incoming", callId, roomName, roomURL, peerId: fromUserId, peerName: fromUserName, type }));
    });

    sock.on("call:reject", ({ callId }: { callId: string }) => {
      if (stateRef.current.callId === callId) endCallLocalRef.current("declined");
    });
    sock.on("call:hangup", ({ callId }: { callId: string }) => {
      if (stateRef.current.callId === callId) endCallLocalRef.current("completed");
    });
    sock.on("call:busy", ({ callId }: { callId: string }) => {
      if (stateRef.current.callId === callId) endCallLocalRef.current("busy");
    });

    return () => { sock.disconnect(); };
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ────────────────────────────────────────────────────────────
  const startCall = useCallback(async (toUserId: string, peerName: string, type: "audio" | "video") => {
    if (!myId || stateRef.current.status !== "idle") return;
    try {
      const { callId, roomName, roomURL } = await api.calls.create(toUserId, type);
      setState((s) => ({ ...s, status: "calling", callId, roomName, roomURL, peerId: toUserId, peerName, type }));
      await joinRoom(roomURL, type);
      // Wait for callee to join (they trigger participantJoined → activateCall via remoteTrackStarted)
    } catch (err) {
      console.error("[Call] startCall error:", err);
      endCallLocal("failed");
    }
  }, [myId, joinRoom, endCallLocal]);

  const answerCall = useCallback(async () => {
    const { callId, roomURL, type } = stateRef.current;
    if (!callId || !roomURL || stateRef.current.status !== "incoming") return;
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    setState((s) => ({ ...s, status: "connecting" }));
    try {
      await joinRoom(roomURL, type);
    } catch (err) {
      console.error("[Call] answerCall error:", err);
      endCallLocal("failed");
    }
  }, [joinRoom, endCallLocal]);

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

  const toggleMute = useCallback(async () => {
    const { isMuted } = stateRef.current;
    try {
      if (isMuted) await meetingRef.current?.unmuteAudio();
      else         await meetingRef.current?.muteAudio();
    } catch {
      // Fallback: mute via track directly
      stateRef.current.localStream?.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    }
    setState((s) => ({ ...s, isMuted: !s.isMuted }));
  }, []);

  const toggleCamera = useCallback(async () => {
    const { isCameraOff } = stateRef.current;
    try {
      if (isCameraOff) await meetingRef.current?.startVideo();
      else             await meetingRef.current?.stopVideo();
    } catch {
      stateRef.current.localStream?.getVideoTracks().forEach((t) => { t.enabled = isCameraOff; });
    }
    setState((s) => ({ ...s, isCameraOff: !s.isCameraOff }));
  }, []);

  return { state, startCall, answerCall, rejectCall, hangUp, toggleMute, toggleCamera };
}
