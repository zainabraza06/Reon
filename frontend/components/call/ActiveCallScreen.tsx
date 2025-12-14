"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  Maximize2,
} from "lucide-react";
import styles from "./ActiveCallScreen.module.css";

type CallState = 'idle' | 'initiating' | 'dialing' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';

interface ActiveCallScreenProps {
  isVisible: boolean;
  remoteUserName: string;
  remoteUserAvatar?: string;
  callType: "audio" | "video";
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  callState?: CallState;
  onHangup: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  onOpenChat?: () => void;
  viewMode?: 'full' | 'mini';
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
  const getCallStatus = () => {
    switch (callState) {
      case 'initiating':
      case 'dialing':
        return 'Dialing...';
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
      default:
        return 'Dialing...';
    }
  };

  // Timer - only start when call is connected
  useEffect(() => {
    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Reset duration when call ends or fails
    if (callState === 'ended' || callState === 'failed' || callState === 'idle') {
      setCallDuration(0);
      return;
    }

    // Only start timer when connected
    if (callState === 'connected' && isVisible) {
      setCallDuration(0); // Reset when connection is established
      timerIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [callState, isVisible]);

  // Handle remote stream - use stream ID to avoid infinite loops
  useEffect(() => {
    if (remoteStream) {
      const streamId = remoteStream.id;
      
      // For video calls, attach to video element (video element handles both video and audio)
      if (remoteVideoRef.current && callType === 'video') {
        // Only update if stream ID has changed
        const currentStream = remoteVideoRef.current.srcObject;
        if (!currentStream || !(currentStream instanceof MediaStream) || currentStream.id !== streamId) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      }
      
      // For audio-only calls, attach to audio element and attempt to play
      if (remoteAudioRef.current && callType === 'audio') {
        // Only update if stream ID has changed
        const currentStream = remoteAudioRef.current.srcObject;
        if (!currentStream || !(currentStream instanceof MediaStream) || currentStream.id !== streamId) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
        // Attempt to play; browsers may block autoplay without a user gesture
        const _play = remoteAudioRef.current.play?.();
        if (_play && typeof _play.then === 'function') {
          _play.catch((err) => {
            console.warn('Auto-play prevented for remote audio:', err);
          });
        }
      }
    } else {
      // Clear streams when remote stream is removed
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    }
  }, [remoteStream?.id, callType]);

  // Handle local stream - use stream ID to avoid infinite loops
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      const streamId = localStream.id;
      // Only update if stream ID has changed
      const currentStream = localVideoRef.current.srcObject;
      if (!currentStream || !(currentStream instanceof MediaStream) || currentStream.id !== streamId) {
        localVideoRef.current.srcObject = localStream;
      }
    } else if (localVideoRef.current && !localStream) {
      localVideoRef.current.srcObject = null;
    }
  }, [localStream?.id]);

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
            />
          </div>

          {/* User Info */}
          <div className={styles.miniUserInfo}>
            <div className={styles.miniUserName}>{remoteUserName}</div>
            <div className={styles.miniStatus}>
              {callState === 'connected' ? formatDuration(callDuration) : getCallStatus()}
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
            >
              {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            </button>

            {callType === "video" && (
              <button
                className={`${styles.miniButton} ${
                  !isCameraEnabled ? styles.miniButtonDisabled : ""
                }`}
                onClick={onToggleCamera}
                title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {isCameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </button>
            )}

            <button
              className={`${styles.miniButton} ${styles.miniEndButton}`}
              onClick={onHangup}
              title="End call"
            >
              <PhoneOff size={16} />
            </button>

            {onBackToCall && (
              <button
                className={styles.miniButton}
                onClick={onBackToCall}
                title="Back to call"
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
          // Keep the element available for autoplay policies (don't use display:none)
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
              />
            </div>
          </div>
        )}

        {/* User Name - Always show */}
        <h1 className={styles.userName}>{remoteUserName}</h1>

        {/* Status Text / Timer */}
        <p className={styles.statusText}>
          {callState === 'connected' ? formatDuration(callDuration) : getCallStatus()}
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
        >
          {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Toggle Video (only for video calls) */}
        {isVideoCall && (
          <button
            className={`${styles.actionButton} ${
              !isCameraEnabled ? styles.actionButtonDisabled : ""
            }`}
            onClick={onToggleCamera}
            title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
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
          >
            <MessageSquare size={20} />
          </button>
        )}

        {/* End Call Button */}
        <button
          className={`${styles.actionButton} ${styles.endCallButton}`}
          onClick={onHangup}
          title="End call"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
};

export default ActiveCallScreen;
