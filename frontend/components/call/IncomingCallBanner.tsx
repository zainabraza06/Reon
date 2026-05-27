"use client";

import React from "react";
import { Phone, PhoneOff, Video } from "lucide-react";

interface IncomingCallBannerProps {
  isVisible: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCallBanner: React.FC<IncomingCallBannerProps> = ({
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
    `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&size=48&background=random`;

  return (
    /* animate-slide-down-banner is defined in globals.css */
    <div className="fixed top-5 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] z-[2000] animate-slide-down-banner sm:top-2.5 sm:w-[95%]">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 sm:px-3 sm:py-2.5 sm:gap-2.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <img
            src={avatarSrc}
            alt={callerName}
            className="w-12 h-12 rounded-full object-cover sm:w-10 sm:h-10"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&size=48&background=random`;
            }}
          />
          {callType === "video" && (
            <div className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-blue-500 rounded-full flex items-center justify-center border-2 border-gray-900/95 text-white">
              <Video size={10} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-white text-[0.9375rem] font-semibold truncate leading-tight sm:text-sm">
            {callerName}
          </div>
          <div className="text-white/60 text-[0.8125rem] truncate sm:text-xs">
            {callType === "video" ? "Incoming video call" : "Incoming voice call"}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border-0 text-white bg-red-500 hover:bg-red-400 active:scale-95 sm:w-9 sm:h-9"
            onClick={onReject}
            aria-label="Reject call"
            title="Reject"
          >
            <PhoneOff size={18} />
          </button>
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border-0 text-white bg-green-500 hover:bg-green-400 active:scale-95 sm:w-9 sm:h-9"
            onClick={onAccept}
            aria-label="Accept call"
            title="Accept"
          >
            {callType === "video" ? <Video size={18} /> : <Phone size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallBanner;
