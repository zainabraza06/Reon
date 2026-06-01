"use client";
import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, PhoneIncoming, PhoneMissed } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import type { CallState, CallEndReason } from "@/hooks/useCall";

interface Props {
  call: CallState;
  onAnswer: () => void;
  onReject: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  peerProfilePic?: string;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function endReasonLabel(reason: CallEndReason) {
  if (reason === "declined") return "Call declined";
  if (reason === "missed")   return "Call not answered";
  if (reason === "busy")     return "Line busy";
  if (reason === "failed")   return "Call failed";
  return "Call ended";
}

export default function CallModal({ call, onAnswer, onReject, onHangUp, onToggleMute, onToggleCamera, peerProfilePic }: Props) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current  && call.localStream)  localVideoRef.current.srcObject  = call.localStream;
  }, [call.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && call.remoteStream) remoteVideoRef.current.srcObject = call.remoteStream;
  }, [call.remoteStream]);

  if (call.status === "idle") return null;

  const isVideo    = call.type === "video";
  const isActive   = call.status === "active";
  const isIncoming = call.status === "incoming";
  const isCalling  = call.status === "calling";
  const isEnded    = call.status === "ended";

  // ── Ended / dismissed state ────────────────────────────────────────────────
  if (isEnded) {
    const isNegative = call.endReason === "declined" || call.endReason === "missed" || call.endReason === "busy" || call.endReason === "failed";
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 bg-black/40 backdrop-blur-sm">
        <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white text-sm font-medium
          ${isNegative ? "bg-red-600" : "bg-gray-800"}`}>
          <PhoneMissed size={18} />
          <span>{endReasonLabel(call.endReason)}</span>
          {!isNegative && call.duration > 0 && (
            <span className="opacity-70 text-xs ml-1">{fmt(call.duration)}</span>
          )}
        </div>
      </div>
    );
  }

  // ── Incoming ring ──────────────────────────────────────────────────────────
  if (isIncoming) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Blurred backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden">
          {/* Top section */}
          <div className="bg-gradient-to-b from-indigo-600 to-indigo-700 px-6 pt-8 pb-6 flex flex-col items-center gap-3">
            <div className="relative">
              {/* Ripple rings */}
              <div className="absolute inset-0 rounded-full bg-white/20 animate-ping scale-125" />
              <div className="absolute inset-0 rounded-full bg-white/10 animate-ping scale-150 [animation-delay:0.3s]" />
              <Avatar src={peerProfilePic} name={call.peerName || "?"} size={80} className="ring-4 ring-white/30 relative z-10" />
            </div>
            <p className="text-white font-semibold text-lg">{call.peerName}</p>
            <p className="text-indigo-200 text-sm">
              Incoming {call.type === "video" ? "video" : "voice"} call…
            </p>
          </div>

          {/* Buttons */}
          <div className="flex justify-center gap-16 py-7 bg-white dark:bg-gray-900">
            <button
              onClick={onReject}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center shadow-lg transition-all">
                <PhoneOff size={26} className="text-white" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Decline</span>
            </button>
            <button
              onClick={onAnswer}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 flex items-center justify-center shadow-lg transition-all">
                <PhoneIncoming size={26} className="text-white" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Answer</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active / calling / connecting ──────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      {/* Video area */}
      {isVideo ? (
        <div className="flex-1 relative bg-black overflow-hidden">
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
          {!call.remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Avatar src={peerProfilePic} name={call.peerName || "?"} size={80} className="ring-4 ring-white/20" />
            </div>
          )}
          {/* Local PiP */}
          <div className="absolute top-4 right-4 w-28 h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl bg-gray-800">
            <video
              ref={localVideoRef}
              autoPlay playsInline muted
              className={`w-full h-full object-cover ${call.isCameraOff ? "hidden" : ""}`}
            />
            {call.isCameraOff && (
              <div className="w-full h-full flex items-center justify-center">
                <VideoOff size={18} className="text-gray-400" />
              </div>
            )}
          </div>
          {/* Status overlay */}
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur rounded-full px-3 py-1.5">
            <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
            <span className="text-xs font-medium">
              {isActive ? fmt(call.duration) : isCalling ? "Calling…" : "Connecting…"}
            </span>
          </div>
        </div>
      ) : (
        // Audio call
        <div className="flex-1 flex flex-col items-center justify-center relative bg-gradient-to-b from-indigo-900 to-gray-950">
          {/* Animated rings */}
          {(isCalling || call.status === "connecting") && (
            <>
              <div className="absolute w-52 h-52 rounded-full bg-indigo-500/10 animate-ping" />
              <div className="absolute w-40 h-40 rounded-full bg-indigo-500/15 animate-ping [animation-delay:0.4s]" />
            </>
          )}
          <Avatar src={peerProfilePic} name={call.peerName || "?"} size={96} className="ring-4 ring-white/10 relative z-10" />
          <p className="text-xl font-semibold mt-4 relative z-10">{call.peerName}</p>
          <p className={`text-sm mt-1 relative z-10 ${isActive ? "text-green-400" : "text-gray-400"}`}>
            {isCalling ? "Ringing…" : call.status === "connecting" ? "Connecting…" : isActive ? fmt(call.duration) : ""}
          </p>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-5 py-8 bg-gray-900/95 backdrop-blur shrink-0 border-t border-white/5">
        {/* Mute */}
        <ControlBtn
          active={call.isMuted}
          activeLabel="Unmute"
          inactiveLabel="Mute"
          onClick={onToggleMute}
          icon={<Mic size={22} />}
          activeIcon={<MicOff size={22} />}
          activeClass="bg-red-500/20 text-red-400 ring-2 ring-red-500/30"
        />

        {/* Camera (video only) */}
        {isVideo && (
          <ControlBtn
            active={call.isCameraOff}
            activeLabel="Show camera"
            inactiveLabel="Hide camera"
            onClick={onToggleCamera}
            icon={<Video size={22} />}
            activeIcon={<VideoOff size={22} />}
            activeClass="bg-red-500/20 text-red-400 ring-2 ring-red-500/30"
          />
        )}

        {/* End call */}
        <button
          onClick={onHangUp}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg transition-all"
          title="End call"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}

function ControlBtn({ active, activeLabel, inactiveLabel, onClick, icon, activeIcon, activeClass }: {
  active: boolean; activeLabel: string; inactiveLabel: string;
  onClick: () => void; icon: React.ReactNode; activeIcon: React.ReactNode; activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5`}
    >
      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${active ? activeClass : "bg-white/10 text-white hover:bg-white/20"}`}>
        {active ? activeIcon : icon}
      </div>
      <span className="text-[11px] text-gray-400 font-medium">{active ? activeLabel : inactiveLabel}</span>
    </button>
  );
}
