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
  // REMOVED: onDecryptMessage and onDecryptMedia - handled in parent
  isTyping: boolean;
  onClose: () => void;
  isLoading?: boolean;
  onLoadMore?: () => Promise<void>;

  onVoiceCall?: (userId: string) => void;
  onVideoCall?: (userId: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  selectedUser,
  messages,
  currentUserId,
  decryptedMessages,
  decryptedMedia = {},
  isTyping,
  onClose,
  isLoading = false,
    onLoadMore,
    onVoiceCall,
  onVideoCall,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const prevMessagesLengthRef = useRef<number>(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const loadingOlderRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on user change
  useEffect(() => {
    if (!selectedUser) return;

    initialLoadRef.current = true;
    prevMessagesLengthRef.current = 0;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
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

    const scrollToBottom = () => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "auto" });
      }
    };

    const rafId = requestAnimationFrame(() => {
      scrollToBottom();
      
      setTimeout(() => {
        setShowSkeleton(false);
        initialLoadRef.current = false;
        prevMessagesLengthRef.current = messages.length;
        
        setTimeout(() => {
          setIsUserScrolling(false);
        }, 100);
      }, 500);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    setIsUserScrolling(true);

    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
      scrollTimeoutRef.current = null;
    }, 150);
  }, []);

  // Trigger load more when user scrolls near top
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onLoadMore) return;

    let ticking = false;

    const onScroll = async () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(async () => {
        try {
          if (container.scrollTop < 120 && !loadingOlderRef.current) {
            if (!onLoadMore) return;
            loadingOlderRef.current = true;
            setLoadingOlder(true);
            const prevScrollHeight = container.scrollHeight;
            const prevScrollTop = container.scrollTop;
            try {
              await onLoadMore();
              // Wait for DOM to update then restore position
              requestAnimationFrame(() => {
                const newScrollHeight = container.scrollHeight;
                container.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
              });
            } catch (err) {
              console.error('onLoadMore error', err);
            } finally {
              loadingOlderRef.current = false;
              setLoadingOlder(false);
            }
          }
        } finally {
          ticking = false;
        }
      });
    };

    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [onLoadMore]);

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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0 || isUserScrolling) return;

    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    const lastMessage = messages[messages.length - 1];
    
    if (hasNewMessages && lastMessage) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom || lastMessage.sender === currentUserId) {
        const scrollTimer = setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
        
        return () => clearTimeout(scrollTimer);
      }
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages, currentUserId, isUserScrolling]);

  // Smooth scroll when typing indicator appears
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

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, []);

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

  const renderSkeletonMessages = () => (
    <>
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
          <button 
            className={styles.actionButton} 
            aria-label="Voice call"
            onClick={() => selectedUser && onVoiceCall?.(selectedUser._id)}
            disabled={!selectedUser}
          >
            <Phone size={20} />
          </button>
          <button 
            className={styles.actionButton} 
            aria-label="Video call"
            onClick={() => selectedUser && onVideoCall?.(selectedUser._id)}
            disabled={!selectedUser}
          >
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
        {/* Encryption notice at top */}
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
            {/* Messages list */}
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
                  // ✅ UPDATED: Only pass decrypted data, not decrypt functions
                  decryptedText={decryptedMessages[messageId]}
                  decryptedMedia={mediaForThisMessage}
                />
              );
            })}

            {/* Typing indicator */}
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