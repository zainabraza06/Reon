"use client";
import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, PhoneIncoming } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import type { CallState } from "@/hooks/useCall";

interface Props {
  call: CallState;
  onAnswer: () => void;
  onReject: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  peerProfilePic?: string;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallModal({
  call,
  onAnswer,
  onReject,
  onHangUp,
  onToggleMute,
  onToggleCamera,
  peerProfilePic,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
    }
  }, [call.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && call.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
    }
  }, [call.remoteStream]);

  if (call.status === "idle") return null;

  const isVideo = call.type === "video";
  const isActive = call.status === "active";
  const isIncoming = call.status === "incoming";
  const isCalling = call.status === "calling";

  // ── Incoming call ring ────────────────────────────────────────────────────
  if (isIncoming) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 w-72 text-center">
          <div className="mb-2">
            <div className="w-3 h-3 rounded-full bg-green-400 mx-auto mb-4 animate-ping" />
            <Avatar src={peerProfilePic} name={call.peerName || "?"} size={72} className="mx-auto" />
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-3">{call.peerName}</p>
          <p className="text-sm text-gray-500 mt-1">Incoming {call.type} call…</p>

          <div className="flex justify-center gap-10 mt-8">
            <button
              onClick={onReject}
              className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
              title="Decline"
            >
              <PhoneOff size={22} />
            </button>
            <button
              onClick={onAnswer}
              className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg"
              title="Answer"
            >
              <PhoneIncoming size={22} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Calling / connecting / active ─────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
      {/* Video area */}
      {isVideo ? (
        <div className="flex-1 relative overflow-hidden bg-black">
          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Local video PiP */}
          <div className="absolute top-4 right-4 w-28 h-20 rounded-2xl overflow-hidden border-2 border-white/30 shadow-lg bg-black">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${call.isCameraOff ? "opacity-0" : ""}`}
            />
            {call.isCameraOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <VideoOff size={18} className="text-gray-400" />
              </div>
            )}
          </div>
        </div>
      ) : (
        // Audio call — avatar display
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Avatar src={peerProfilePic} name={call.peerName || "?"} size={96} className="ring-4 ring-white/20" />
          <p className="text-xl font-semibold">{call.peerName}</p>
          <p className="text-sm text-gray-400">
            {isCalling
              ? "Calling…"
              : call.status === "connecting"
              ? "Connecting…"
              : isActive
              ? formatDuration(call.duration)
              : ""}
          </p>
          {/* Pulse rings for calling state */}
          {isCalling && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 rounded-full border-2 border-white/10 animate-ping" />
            </div>
          )}
        </div>
      )}

      {/* Status bar for video calls */}
      {isVideo && (
        <div className="absolute top-4 left-4 text-sm text-white/70">
          {isActive ? formatDuration(call.duration) : isCalling ? "Calling…" : "Connecting…"}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 py-8 bg-gray-900/90 backdrop-blur shrink-0">
        {/* Mute */}
        <button
          onClick={onToggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            call.isMuted
              ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          title={call.isMuted ? "Unmute" : "Mute"}
        >
          {call.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {/* Camera (video only) */}
        {isVideo && (
          <button
            onClick={onToggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              call.isCameraOff
                ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title={call.isCameraOff ? "Turn on camera" : "Turn off camera"}
          >
            {call.isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}

        {/* Hang up */}
        <button
          onClick={onHangUp}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors shadow-lg"
          title="End call"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}
