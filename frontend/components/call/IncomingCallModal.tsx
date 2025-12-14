"use client";

import React, { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useRingtone } from "@/hooks/useRingtone";
import styles from "./IncomingCallModal.module.css";

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
  const [isRinging, setIsRinging] = useState(true);
  const { playRingtone, stopRingtone } = useRingtone();

  useEffect(() => {
    if (isVisible) {
      setIsRinging(true);
      playRingtone();
    } else {
      setIsRinging(false);
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
    <div className={styles.modalOverlay}>
      <div className={styles.modalContainer}>
        {/* Content */}
        <div className={styles.content}>
          {/* Caller Avatar */}
          <div className={styles.avatarContainer}>
            <img
              src={
                callerAvatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&size=200&background=random`
              }
              alt={callerName}
              className={`${styles.avatar} ${isRinging ? styles.pulse : ""}`}
            />
          </div>

          {/* Caller Info */}
          <div className={styles.infoContainer}>
            <h2 className={styles.callerName}>{callerName}</h2>
            <p className={styles.callType}>
              {callType === "video" ? "Video call" : "Voice call"}
            </p>
            <p className={styles.ringtone}>Ringing...</p>
          </div>

          {/* Action Buttons */}
          <div className={styles.actionButtons}>
            {/* Reject Button */}
            <button
              className={`${styles.button} ${styles.rejectButton}`}
              onClick={handleReject}
              aria-label="Reject call"
            >
              <PhoneOff size={24} />
            </button>

            {/* Accept Button */}
            <button
              className={`${styles.button} ${styles.acceptButton}`}
              onClick={handleAccept}
              aria-label="Accept call"
            >
              {callType === "video" ? (
                <Video size={24} />
              ) : (
                <Phone size={24} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
