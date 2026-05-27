"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageSquare,
  Maximize2,
} from "lucide-react";
import { CallState } from "@/types";

type CallType = "audio" | "video";
type CallViewMode = "full" | "mini";

interface ActiveCallScreenProps {
  isVisible: boolean;
  remoteUserName: string;
  remoteUserAvatar?: string;
  callType: CallType;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  callState?: CallState;
  onHangup: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  onOpenChat?: () => void;
  viewMode?: CallViewMode;
  onExpand?: () => void;
  onCollapse?: () => void;
  onBackToCall?: () => void;
}

const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  isVisible,
  remoteUserName,
  remoteUserAvatar,
  callType,
  localStream,
  remoteStream,
  callState = "idle",
  onHangup,
  onToggleMic,
  onToggleCamera,
  isMicEnabled,
  isCameraEnabled,
  onOpenChat,
  viewMode = "full",
  onExpand,
  onCollapse,
  onBackToCall,
}) => {
  const [callDuration, setCallDuration] = useState(0);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getCallStatus = useCallback(() => {
    switch (callState) {
      case "initiating":
      case "ringing":
        return "Ringing...";
      case "connecting":
        return "Connecting...";
      case "connected":
        return null;
      case "failed":
        return "Call failed";
      case "ended":
        return "Call ended";
      case "rejected":
        return "Call rejected";
      case "busy":
        return "User is busy";
      default:
        return "Dialing...";
    }
  }, [callState]);

  // Remote stream attachment
  useEffect(() => {
    if (!remoteStream) return;
    const setup = () => {
      if (remoteVideoRef.current && callType === "video") {
        if (remoteVideoRef.current.srcObject !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      }
      if (remoteAudioRef.current && callType === "audio") {
        if (remoteAudioRef.current.srcObject !== remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    };
    requestAnimationFrame(setup);
  }, [remoteStream, callType]);

  // Local stream attachment — re-runs when isCameraEnabled changes so
  // the video element is re-attached after it re-mounts on camera toggle
  useEffect(() => {
    if (!localStream) {
      if (localVideoRef.current?.srcObject) localVideoRef.current.srcObject = null;
      return;
    }
    const setup = () => {
      if (localVideoRef.current) {
        if (localVideoRef.current.srcObject !== localStream) {
          localVideoRef.current.srcObject = localStream;
        }
      }
    };
    requestAnimationFrame(setup);
  }, [localStream, isCameraEnabled]);

  // Call duration timer
  useEffect(() => {
    if (callState === "connected" && isVisible) {
      if (!timerIntervalRef.current) {
        timerIntervalRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [callState, isVisible]);

  const getDisplayText = useCallback(() => {
    return callState === "connected" ? formatDuration(callDuration) : getCallStatus();
  }, [callState, callDuration, getCallStatus]);

  if (!isVisible) return null;

  const avatarSrc =
    remoteUserAvatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=200&background=random`;

  // ── MINI MODE ─────────────────────────────────────────────────────────────
  if (viewMode === "mini") {
    return (
      <div className="fixed bottom-5 right-5 w-[280px] bg-[rgba(11,20,26,0.95)] backdrop-blur-xl rounded-xl shadow-2xl z-[1000] overflow-hidden border border-white/10 md:w-[260px] sm:w-[230px] sm:bottom-2.5 sm:right-2.5">
        <div className="flex items-center gap-3 p-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 shrink-0 border-2 border-white/10 sm:w-10 sm:h-10">
            <img
              src={avatarSrc}
              alt={remoteUserName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=64&background=random`;
              }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="text-white text-[0.9375rem] font-medium truncate sm:text-sm">
              {remoteUserName}
            </div>
            <div className="text-white/70 text-[0.8125rem] truncate sm:text-xs">
              {getDisplayText()}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 sm:w-7 sm:h-7 ${
                !isMicEnabled
                  ? "bg-red-500/30 opacity-80"
                  : "bg-white/15 hover:bg-white/25 hover:scale-110 active:scale-95"
              }`}
              onClick={onToggleMic}
              title={isMicEnabled ? "Mute" : "Unmute"}
              type="button"
            >
              {isMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
            </button>

            {callType === "video" && (
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 sm:w-7 sm:h-7 ${
                  !isCameraEnabled
                    ? "bg-red-500/30 opacity-80"
                    : "bg-white/15 hover:bg-white/25 hover:scale-110 active:scale-95"
                }`}
                onClick={onToggleCamera}
                title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
                type="button"
              >
                {isCameraEnabled ? <Video size={14} /> : <VideoOff size={14} />}
              </button>
            )}

            <button
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 bg-red-500 hover:bg-[#da190b] hover:scale-110 active:scale-95 sm:w-7 sm:h-7"
              onClick={onHangup}
              title="End call"
              type="button"
            >
              <PhoneOff size={14} />
            </button>

            {onBackToCall && (
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 bg-white/15 hover:bg-white/25 hover:scale-110 active:scale-95 sm:w-7 sm:h-7"
                onClick={onBackToCall}
                title="Back to call"
                type="button"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── FULL MODE ─────────────────────────────────────────────────────────────
  const isVideoCall = callType === "video";
  const hasRemoteVideo = isVideoCall && remoteStream;
  const showAvatar = !isVideoCall || !hasRemoteVideo;

  return (
    <div className="call-screen-group fixed inset-0 w-full h-full bg-black flex flex-col items-center justify-between overflow-hidden z-[1000]">
      {/* Hidden audio element for audio-only calls */}
      {callType === "audio" && (
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          style={{ position: "absolute", left: "-9999px", width: 0, height: 0 }}
        />
      )}

      {/* Remote Video Background */}
      {hasRemoteVideo && (
        <video
          ref={remoteVideoRef}
          className="absolute inset-0 w-full h-full object-cover z-[1]"
          autoPlay
          playsInline
          muted={false}
        />
      )}

      {/* Main Content */}
      <div className="relative flex-1 w-full flex flex-col items-center justify-center p-8 z-[2] sm:p-4">
        {showAvatar && (
          <div className="mb-6">
            <div className="w-[200px] h-[200px] rounded-full overflow-hidden bg-white/10 flex items-center justify-center sm:w-40 sm:h-40">
              <img
                src={avatarSrc}
                alt={remoteUserName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=200&background=random`;
                }}
              />
            </div>
          </div>
        )}

        <h1 className="text-white text-2xl font-medium mb-2 text-center leading-tight sm:text-xl">
          {remoteUserName}
        </h1>

        <p className="text-white/60 text-[0.9375rem] text-center min-h-[1.5rem] sm:text-sm">
          {getDisplayText()}
        </p>

        {/* Local Video PiP */}
        {isVideoCall && localStream && isCameraEnabled && (
          <div className="absolute bottom-[120px] right-5 w-[120px] h-[120px] rounded-full overflow-hidden bg-black border-[3px] border-white/30 shadow-lg z-10 sm:w-[100px] sm:h-[100px] sm:bottom-[100px] sm:right-4">
            <video
              ref={localVideoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="call-action-bar w-full flex justify-center items-center gap-4 py-6 px-8 bg-black/40 backdrop-blur-xl z-10 transition-opacity duration-300 sm:py-5 sm:px-4 sm:gap-3.5">
        {/* Mic */}
        <button
          className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 sm:w-12 sm:h-12 ${
            !isMicEnabled
              ? "bg-red-500/30 opacity-80"
              : "bg-white/20 hover:bg-white/30 hover:scale-105 active:scale-95"
          }`}
          onClick={onToggleMic}
          title={isMicEnabled ? "Mute" : "Unmute"}
          type="button"
        >
          {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Camera (video calls only) */}
        {callType === "video" && (
          <button
            className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 sm:w-12 sm:h-12 ${
              !isCameraEnabled
                ? "bg-red-500/30 opacity-80"
                : "bg-white/20 hover:bg-white/30 hover:scale-105 active:scale-95"
            }`}
            onClick={onToggleCamera}
            title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
            type="button"
          >
            {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
        )}

        {/* Chat / Collapse */}
        {onCollapse && (
          <button
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 bg-white/20 hover:bg-white/30 hover:scale-105 active:scale-95 sm:w-12 sm:h-12"
            onClick={onCollapse}
            title="Show chat"
            type="button"
          >
            <MessageSquare size={20} />
          </button>
        )}

        {/* End Call */}
        <button
          className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 border-0 text-white shrink-0 bg-red-500 hover:bg-red-400 hover:scale-105 active:scale-95 sm:w-14 sm:h-14"
          onClick={onHangup}
          title="End call"
          type="button"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
};

export default ActiveCallScreen;
