"use client";

import React from "react";
import { Phone, PhoneOff, Video } from "lucide-react";

interface IncomingCallModalProps {
  isVisible: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  isVisible,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onReject,
}) => {
  if (!isVisible) return null;

  const avatarSrc =
    callerAvatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&size=200&background=random`;

  return (
    /* animate-fade-in-overlay in globals.css */
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] animate-fade-in-overlay sm:items-end">
      {/* animate-slide-up-modal / animate-slide-up-bottom in globals.css */}
      <div className="w-[90%] max-w-[400px] bg-gray-800 rounded-[20px] px-8 py-10 shadow-2xl overflow-hidden relative animate-slide-up-modal sm:w-full sm:max-w-full sm:rounded-[20px_20px_0_0] sm:px-6 sm:py-8 sm:animate-slide-up-bottom">
        <div className="relative z-[1] flex flex-col items-center gap-8 text-center sm:gap-6">
          {/* Avatar */}
          <div className="w-40 h-40 sm:w-36 sm:h-36">
            <img
              src={avatarSrc}
              alt={callerName}
              className="w-full h-full rounded-full object-cover animate-call-pulse"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&size=200&background=random`;
              }}
            />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-white leading-tight sm:text-[22px]">
              {callerName}
            </h2>
            <p className="text-[15px] text-white/60">
              {callType === "video" ? "Video call" : "Voice call"}
            </p>
            <p className="text-sm text-white/50">Ringing...</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-12 mt-2 justify-center items-center sm:gap-10">
            <button
              className="w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border-0 text-white bg-red-500 hover:bg-red-400 active:scale-95 shadow-lg sm:w-14 sm:h-14"
              onClick={onReject}
              aria-label="Reject call"
            >
              <PhoneOff size={24} />
            </button>
            <button
              className="w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border-0 text-white bg-green-500 hover:bg-green-400 active:scale-95 shadow-lg sm:w-14 sm:h-14"
              onClick={onAccept}
              aria-label="Accept call"
            >
              {callType === "video" ? <Video size={24} /> : <Phone size={24} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
