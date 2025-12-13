"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Message, User, DecryptedMediaForUI } from "@/types";
import MessageBubble from "./MessageBubble";
import { Phone, Video, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ChatWindow.module.css";

interface ChatWindowProps {
  selectedUser: User | null;
  messages: Array<Message>;
  currentUserId: string;
  decryptedMessages: Record<string, string>;
  decryptedMedia?: Record<string, DecryptedMediaForUI[]>;
  onDecryptMessage: (message: Message) => Promise<string | null>;
  onDecryptMedia?: (
    messageId: string,
    mediaIndex: number
  ) => Promise<DecryptedMediaForUI | undefined>;
  isTyping: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  selectedUser,
  messages,
  currentUserId,
  decryptedMessages,
  decryptedMedia = {},
  onDecryptMessage,
  onDecryptMedia,
  isTyping,
  onClose,
  isLoading = false,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const prevMessagesLengthRef = useRef<number>(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  
  // FIX: Use ReturnType<typeof setTimeout> for cross-environment compatibility
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on user change
  useEffect(() => {
    if (!selectedUser) return;

    initialLoadRef.current = true;
    prevMessagesLengthRef.current = 0;
    
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Use setTimeout to avoid synchronous state update in effect
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 0);

    return () => {
      clearTimeout(timer);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [selectedUser?._id]);

  // Handle initial scroll to bottom when loading a new chat
  useEffect(() => {
    if (!containerRef.current || messages.length === 0 || !initialLoadRef.current) return;

    // Scroll to bottom immediately for initial load
    const scrollToBottom = () => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "auto" });
      }
    };

    // Use requestAnimationFrame for smooth initial scroll
    const rafId = requestAnimationFrame(() => {
      scrollToBottom();
      
      setTimeout(() => {
        setShowSkeleton(false);
        initialLoadRef.current = false;
        prevMessagesLengthRef.current = messages.length;
        
        // Set a small delay before allowing user scroll detection
        setTimeout(() => {
          setIsUserScrolling(false);
        }, 100);
      }, 500);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [messages]);

  // Track user scrolling with useCallback to avoid recreating on every render
  const handleScroll = useCallback(() => {
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // User is actively scrolling
    setIsUserScrolling(true);

    // Reset after 150ms of no scrolling
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
      scrollTimeoutRef.current = null;
    }, 150);
  }, []);

  // Add scroll event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [handleScroll]);

  // Scroll to bottom when new messages arrive (only if user is at bottom or sent the message)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0 || isUserScrolling) return;

    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    const lastMessage = messages[messages.length - 1];
    
    if (hasNewMessages && lastMessage) {
      // Check if we're already near the bottom (within 100px)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      // Only auto-scroll if:
      // 1. User is near bottom OR
      // 2. User sent the message
      if (isNearBottom || lastMessage.sender === currentUserId) {
        const scrollTimer = setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
        
        return () => clearTimeout(scrollTimer);
      }
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages, currentUserId, isUserScrolling]);

  // Smooth scroll when typing indicator appears (only if user is near bottom)
  useEffect(() => {
    if (!isTyping || isUserScrolling) return;

    const container = containerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (isNearBottom) {
      const typingTimer = setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      
      return () => clearTimeout(typingTimer);
    }
  }, [isTyping, isUserScrolling]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, []);

  // DEBUG: Log isTyping changes
  useEffect(() => {
    console.log('ChatWindow - isTyping:', isTyping, 'selectedUser:', selectedUser?._id);
  }, [isTyping, selectedUser?._id]);

  const chatName = selectedUser?.fullName || selectedUser?.username || "Unknown User";
  const chatImage = selectedUser?.profilePic;
  const isOnline = selectedUser?.isOnline;

  if (!selectedUser) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>
          <span className={styles.emptyStateEmoji}>💬</span>
        </div>
        <h2 className={styles.emptyStateTitle}>Welcome to Reon</h2>
        <p className={styles.emptyStateText}>
          Select a chat to start messaging securely with end-to-end encryption.
        </p>
        
        <div className={styles.emptyStateFeatures}>
          <div className={styles.emptyStateFeature}>
            <div className={styles.featureIcon}>🔒</div>
            <span className={styles.featureText}>End-to-End Encryption</span>
          </div>
          <div className={styles.emptyStateFeature}>
            <div className={styles.featureIcon}>🚀</div>
            <span className={styles.featureText}>Instant Messages</span>
          </div>
          <div className={styles.emptyStateFeature}>
            <div className={styles.featureIcon}>🖼️</div>
            <span className={styles.featureText}>Secure Media</span>
          </div>
        </div>
      </div>
    );
  }

  const handleDecryptMediaWrapper = onDecryptMedia
    ? async (messageId: string, mediaIndex: number) => {
        try {
          return await onDecryptMedia(messageId, mediaIndex);
        } catch (error) {
          console.error("Media decryption error:", error);
          return undefined;
        }
      }
    : undefined;

  const renderSkeletonMessages = () => (
    <>
      {/* Skeleton messages should show from bottom */}
      {[...Array(3)].map((_, i) => (
        <div key={`skeleton-outgoing-${i}`} className={styles.skeletonMessageOutgoing}>
          <div className={styles.skeletonMessageContent}>
            <div className={cn(styles.skeletonText, i === 2 && styles.skeletonTextShort)}></div>
            <div className={styles.skeletonTime}></div>
          </div>
        </div>
      ))}
      {[...Array(5)].map((_, i) => (
        <div key={`skeleton-incoming-${i}`} className={styles.skeletonMessageIncoming}>
          <div className={styles.skeletonAvatar}></div>
          <div className={styles.skeletonMessageContent}>
            <div className={cn(styles.skeletonText, i === 3 && styles.skeletonTextShort)}></div>
            {i === 4 && (
              <div className={styles.skeletonMedia}>
                <div className={styles.skeletonImage}></div>
              </div>
            )}
            <div className={styles.skeletonTime}></div>
          </div>
        </div>
      ))}
      <div className={styles.encryptionNoticeSkeleton}>
        <div className={styles.skeletonBadge}></div>
      </div>
    </>
  );

  return (
    <div className={styles.chatWindow}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatarContainer}>
            <img
              src={
                chatImage ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&background=random`
              }
              alt={chatName}
              className={styles.avatar}
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  chatName
                )}&background=random`;
              }}
            />
            {isOnline && <div className={styles.onlineIndicator}></div>}
          </div>
          <div className={styles.chatInfo}>
            <h3 className={styles.chatName}>{chatName}</h3>
            <p className={styles.chatStatus}>
              {isTyping ? (
                <span className={styles.typingIndicator}>
                  Typing
                  <div className={styles.typingDots}>
                    <div className={`${styles.typingDot} ${styles.typingDot1}`}></div>
                    <div className={`${styles.typingDot} ${styles.typingDot2}`}></div>
                    <div className={`${styles.typingDot} ${styles.typingDot3}`}></div>
                  </div>
                </span>
              ) : isOnline ? (
                <span style={{ color: "#22c55e" }}>🟢 Online</span>
              ) : (
                <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>⚫ Offline</span>
              )}
            </p>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.actionButton} aria-label="Voice call">
            <Phone size={20} />
          </button>
          <button className={styles.actionButton} aria-label="Video call">
            <Video size={20} />
          </button>
          <button className={styles.actionButton} aria-label="Close chat" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div 
        ref={containerRef} 
        className={cn(styles.messagesContainer, "custom-scrollbar")}
      >
        {/* Encryption notice at top - FIXED POSITION */}
        <div className={styles.encryptionNotice}>
          <span className={styles.encryptionBadge}>
            <Lock size={12} className={styles.lockIcon} />
            Messages and media are end-to-end encrypted
          </span>
        </div>

        {isLoading && showSkeleton ? (
          <div className={styles.skeletonWrapper}>
            {renderSkeletonMessages()}
          </div>
        ) : (
          <>
            {/* Messages list - oldest first */}
            {messages.map((msg, index) => {
              const isMe = msg.sender === currentUserId;
              const messageId = msg._id;
              const mediaForThisMessage = decryptedMedia[messageId] || [];

              return (
                <MessageBubble
                  key={messageId || `msg-${index}`}
                  message={msg}
                  isMe={isMe}
                  currentUserId={currentUserId}
                  onDecrypt={() => onDecryptMessage(msg)}
                  onDecryptMedia={handleDecryptMediaWrapper}
                  decryptedText={decryptedMessages[messageId]}
                  decryptedMedia={mediaForThisMessage}
                />
              );
            })}

            {/* Typing indicator - always at bottom */}
            {isTyping && (
              <div className={styles.typingBubble}>
                <div className={styles.typingIndicator}>
                  <div className={styles.typingDots}>
                    <div className={`${styles.typingDot} ${styles.typingDot1}`}></div>
                    <div className={`${styles.typingDot} ${styles.typingDot2}`}></div>
                    <div className={`${styles.typingDot} ${styles.typingDot3}`}></div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} className={styles.bottomRef} />
      </div>
    </div>
  );
};

export default ChatWindow;