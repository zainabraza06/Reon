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
import styles from "./ActiveCallScreen.module.css";

import { CallState } from "@/types";
type CallType = "audio" | "video";
type CallViewMode = 'full' | 'mini';

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
  callState = 'idle',
  onHangup,
  onToggleMic,
  onToggleCamera,
  isMicEnabled,
  isCameraEnabled,
  onOpenChat,
  viewMode = 'full',
  onExpand,
  onCollapse,
  onBackToCall,
}) => {
  const [callDuration, setCallDuration] = useState(0);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallStateRef = useRef<CallState>(callState);

  // Format call duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Get call status text
  const getCallStatus = useCallback(() => {
    switch (callState) {
      case 'initiating':
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return null; // Show timer instead
      case 'failed':
        return 'Call failed';
      case 'ended':
        return 'Call ended';
      case 'rejected':
        return 'Call rejected';
      case 'busy':
        return 'User is busy';
      default:
        return 'Dialing...';
    }
  }, [callState]);

 
  // Handle remote stream
  useEffect(() => {
    if (!remoteStream) return;

    const setupRemoteStream = () => {
      // For video calls, attach to video element
      if (remoteVideoRef.current && callType === 'video') {
        const currentStream = remoteVideoRef.current.srcObject;
        if (currentStream !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      }
      
      // For audio-only calls, attach to audio element
      if (remoteAudioRef.current && callType === 'audio') {
        const currentStream = remoteAudioRef.current.srcObject;
        if (currentStream !== remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
          // Attempt to play with error handling
          remoteAudioRef.current.play().catch((err) => {
            console.warn('Audio autoplay prevented:', err);
          });
        }
      }
    };

    // Use requestAnimationFrame to avoid synchronous updates
    requestAnimationFrame(setupRemoteStream);
  }, [remoteStream, callType]);

  // Handle local stream
  useEffect(() => {
    if (!localStream) {
      if (localVideoRef.current?.srcObject) {
        localVideoRef.current.srcObject = null;
      }
      return;
    }

    const setupLocalStream = () => {
      if (localVideoRef.current) {
        const currentStream = localVideoRef.current.srcObject;
        if (currentStream !== localStream) {
          localVideoRef.current.srcObject = localStream;
        }
      }
    };

    requestAnimationFrame(setupLocalStream);
  }, [localStream]);
  useEffect(() => {
  if (callState === 'connected' && isVisible) {
    if (!timerIntervalRef.current) {
      timerIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
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


  // Get display text
  const getDisplayText = useCallback(() => {
    return callState === 'connected' ? formatDuration(callDuration) : getCallStatus();
  }, [callState, callDuration, getCallStatus]);

  if (!isVisible) return null;

  // Mini mode rendering
  if (viewMode === 'mini') {
    return (
      <div className={styles.miniContainer}>
        <div className={styles.miniContent}>
          {/* Avatar */}
          <div className={styles.miniAvatarWrapper}>
            <img
              src={
                remoteUserAvatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=64&background=random`
              }
              alt={remoteUserName}
              className={styles.miniAvatar}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=64&background=random`;
              }}
            />
          </div>

          {/* User Info */}
          <div className={styles.miniUserInfo}>
            <div className={styles.miniUserName}>{remoteUserName}</div>
            <div className={styles.miniStatus}>
              {getDisplayText()}
            </div>
          </div>

          {/* Mini Controls */}
          <div className={styles.miniControls}>
            <button
              className={`${styles.miniButton} ${
                !isMicEnabled ? styles.miniButtonDisabled : ""
              }`}
              onClick={onToggleMic}
              title={isMicEnabled ? "Mute" : "Unmute"}
              type="button"
            >
              {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            </button>

            {callType === 'video' && (
              <button
                className={`${styles.miniButton} ${
                  !isCameraEnabled ? styles.miniButtonDisabled : ""
                }`}
                onClick={onToggleCamera}
                title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
                type="button"
              >
                {isCameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </button>
            )}

            <button
              className={`${styles.miniButton} ${styles.miniEndButton}`}
              onClick={onHangup}
              title="End call"
              type="button"
            >
              <PhoneOff size={16} />
            </button>

            {onBackToCall && (
              <button
                className={styles.miniButton}
                onClick={onBackToCall}
                title="Back to call"
                type="button"
              >
                <Maximize2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full mode rendering
  const isVideoCall = callType === "video";
  const hasRemoteVideo = isVideoCall && remoteStream;
  const showAvatar = !isVideoCall || !hasRemoteVideo;

  return (
    <div className={styles.container}>
      {/* Hidden audio element for audio-only calls */}
      {callType === 'audio' && (
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          style={{ position: 'absolute', left: '-9999px', width: 0, height: 0 }}
        />
      )}

      {/* Remote Video Background (for video calls) */}
      {hasRemoteVideo && (
        <video
          ref={remoteVideoRef}
          className={styles.remoteVideo}
          autoPlay
          playsInline
          muted={false}
        />
      )}

      {/* Main Content Area */}
      <div className={styles.contentArea}>
        {/* Centered Avatar - Show for audio calls or when video not available */}
        {showAvatar && (
          <div className={styles.avatarContainer}>
            <div className={styles.avatarWrapper}>
              <img
                src={
                  remoteUserAvatar ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=200&background=random`
                }
                alt={remoteUserName}
                className={styles.avatar}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUserName)}&size=200&background=random`;
                }}
              />
            </div>
          </div>
        )}

        {/* User Name - Always show */}
        <h1 className={styles.userName}>{remoteUserName}</h1>

        {/* Status Text / Timer */}
        <p className={styles.statusText}>
          {getDisplayText()}
        </p>

        {/* Local Video (PiP) - Only for video calls when camera is enabled */}
        {isVideoCall && localStream && isCameraEnabled && (
          <div className={styles.localVideoContainer}>
            <video
              ref={localVideoRef}
              className={styles.localVideo}
              autoPlay
              muted
              playsInline
            />
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className={styles.actionBar}>
        {/* Toggle Mic */}
        <button
          className={`${styles.actionButton} ${
            !isMicEnabled ? styles.actionButtonDisabled : ""
          }`}
          onClick={onToggleMic}
          title={isMicEnabled ? "Mute" : "Unmute"}
          type="button"
        >
          {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Toggle Camera (only for video calls) */}
        {callType === 'video' && (
          <button
            className={`${styles.actionButton} ${
              !isCameraEnabled ? styles.actionButtonDisabled : ""
            }`}
            onClick={onToggleCamera}
            title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
            type="button"
          >
            {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
        )}

        {/* Show Chat Button */}
        {onCollapse && (
          <button
            className={styles.actionButton}
            onClick={onCollapse}
            title="Show chat"
            type="button"
          >
            <MessageSquare size={20} />
          </button>
        )}

        {/* End Call Button */}
        <button
          className={`${styles.actionButton} ${styles.endCallButton}`}
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