"use client";

import React, { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useRingtone } from "@/hooks/useRingtone";
import styles from "./IncomingCallBanner.module.css";

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
  const { playRingtone, stopRingtone } = useRingtone();

  useEffect(() => {
    if (isVisible) {
      playRingtone();
    } else {
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [isVisible, playRingtone, stopRingtone]);

  // Stop ringtone when call is accepted or rejected
  const handleAccept = () => {
    stopRingtone();
    onAccept();
  };

  const handleReject = () => {
    stopRingtone();
    onReject();
  };

  if (!isVisible) return null;

  return (
    <div className={styles.bannerContainer}>
      <div className={styles.bannerContent}>
        {/* Caller Avatar */}
        <div className={styles.avatarWrapper}>
          <img
            src={
              callerAvatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&size=48&background=random`
            }
            alt={callerName}
            className={styles.avatar}
          />
          {callType === "video" && (
            <div className={styles.videoIcon}>
              <Video size={12} />
            </div>
          )}
        </div>

        {/* Caller Info */}
        <div className={styles.infoSection}>
          <div className={styles.callerName}>{callerName}</div>
          <div className={styles.callType}>
            {callType === "video" ? "Incoming video call" : "Incoming voice call"}
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.actionButtons}>
          <button
            className={`${styles.actionButton} ${styles.rejectButton}`}
            onClick={handleReject}
            aria-label="Reject call"
            title="Reject"
          >
            <PhoneOff size={18} />
          </button>
          <button
            className={`${styles.actionButton} ${styles.acceptButton}`}
            onClick={handleAccept}
            aria-label="Accept call"
            title="Accept"
          >
            {callType === "video" ? (
              <Video size={18} />
            ) : (
              <Phone size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallBanner;

