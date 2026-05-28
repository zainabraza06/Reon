"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Message, User, DecryptedMediaForUI } from "@/types";
import MessageBubble from "./MessageBubble";
import { Phone, Video, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const scrollRestoreRef = useRef<{ messageId: string; scrollTop: number; scrollHeight: number } | null>(null);
  
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

  // Handle initial scroll to bottom only on first load or user change
  useEffect(() => {
    if (!containerRef.current || messages.length === 0 || !initialLoadRef.current) {
      // Reset initial load flag if we switch to a user with no messages yet
      if (selectedUser && messages.length === 0) {
        initialLoadRef.current = true;
        prevMessagesLengthRef.current = 0;
      }
      return;
    }
    
    // Only scroll on initial load, not when loading older messages or restoring scroll
    if (loadingOlder || scrollRestoreRef.current) return;
    
    // Only scroll on initial load, not when loading older messages
    const scrollToBottom = () => {
      if (containerRef.current && bottomRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    };

    // Use double RAF to ensure DOM is ready
    const rafId1 = requestAnimationFrame(() => {
      const rafId2 = requestAnimationFrame(() => {
        scrollToBottom();
        
        setTimeout(() => {
          setShowSkeleton(false);
          initialLoadRef.current = false;
          prevMessagesLengthRef.current = messages.length;
          setIsUserScrolling(false);
        }, 300);
      });
      
      return () => cancelAnimationFrame(rafId2);
    });

    return () => {
      cancelAnimationFrame(rafId1);
    };
  }, [selectedUser?._id, messages.length, loadingOlder]); // Trigger on user change or when messages first load

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

  // Trigger load more when user scrolls near top (WhatsApp-like behavior)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onLoadMore || initialLoadRef.current) return;

    let ticking = false;
    let lastScrollTop = container.scrollTop;

    const onScroll = async () => {
      if (ticking) return;
      ticking = true;
      
      requestAnimationFrame(async () => {
        try {
          const scrollTop = container.scrollTop;
          const scrollThreshold = 200; // Load when within 200px of top
          
          // Only load if scrolling up (not down) and near top
          if (scrollTop < scrollThreshold && scrollTop < lastScrollTop && !loadingOlderRef.current && messages.length > 0) {
            loadingOlderRef.current = true;
            setLoadingOlder(true);
            
            // Find the first visible message element
            const messageElements = Array.from(container.querySelectorAll('[data-message-id]')) as HTMLElement[];
            let firstVisibleMessage: HTMLElement | null = null;
            let firstVisibleMessageId: string | null = null;
            
            for (const el of messageElements) {
              const rect = el.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              if (rect.top >= containerRect.top && rect.top <= containerRect.bottom) {
                firstVisibleMessage = el;
                firstVisibleMessageId = el.getAttribute('data-message-id');
                break;
              }
            }
            
            // Save current state for scroll restoration
            const prevScrollHeight = container.scrollHeight;
            const prevScrollTop = scrollTop;
            
            // Store reference for scroll restoration
            if (firstVisibleMessageId) {
              scrollRestoreRef.current = {
                messageId: firstVisibleMessageId,
                scrollTop: prevScrollTop,
                scrollHeight: prevScrollHeight
              };
            }
            
            try {
              await onLoadMore();
              // Scroll restoration will happen in the useEffect below
            } catch (err) {
              console.error('onLoadMore error', err);
              loadingOlderRef.current = false;
              setLoadingOlder(false);
              scrollRestoreRef.current = null;
            }
          }
          
          lastScrollTop = scrollTop;
        } finally {
          ticking = false;
        }
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [onLoadMore, selectedUser?._id, initialLoadRef, messages.length]);
  
  // Restore scroll position after older messages are loaded
  useEffect(() => {
    const container = containerRef.current;
    const restoreData = scrollRestoreRef.current;
    
    if (!container || !restoreData || !loadingOlder || messages.length === 0) return;
    
    // Wait for DOM to update with new messages
    const restoreScroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Find the message element we saved
          const targetElement = container.querySelector(`[data-message-id="${restoreData.messageId}"]`) as HTMLElement;
          
          if (targetElement && container) {
            const newScrollHeight = container.scrollHeight;
            const heightDifference = newScrollHeight - restoreData.scrollHeight;
            
            // Calculate new scroll position to maintain visual position
            if (heightDifference > 0) {
              const elementOffset = targetElement.offsetTop;
              const newScrollTop = restoreData.scrollTop + heightDifference;
              
              // Set scroll position to maintain the same visual position
              container.scrollTop = newScrollTop;
            }
          }
          
          // Clean up
          loadingOlderRef.current = false;
          setLoadingOlder(false);
          scrollRestoreRef.current = null;
        });
      });
    };
    
    // Small delay to ensure React has finished rendering
    const timeoutId = setTimeout(restoreScroll, 100);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [messages, loadingOlder]);

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

  // Scroll to bottom when new messages arrive (only if user is near bottom or sent message)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    // Don't auto-scroll on initial load or when restoring scroll position
    if (initialLoadRef.current || loadingOlder || scrollRestoreRef.current) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    // Don't auto-scroll if user is actively scrolling up
    if (isUserScrolling) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    const lastMessage = messages[messages.length - 1];
    
    if (hasNewMessages && lastMessage) {
      // Check if user is near bottom (within 150px)
      const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = scrollBottom < 150;
      
      // Auto-scroll if: user is near bottom OR user sent the message
      if (isNearBottom || lastMessage.sender === currentUserId) {
        // Use scrollTop instead of scrollIntoView for better control
        requestAnimationFrame(() => {
          if (container && bottomRef.current) {
            container.scrollTop = container.scrollHeight;
          }
        });
      }
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages, currentUserId, isUserScrolling, initialLoadRef, loadingOlder]);

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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-900 to-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-[20%] w-64 h-64 bg-blue-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[20%] right-[20%] w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute top-[20%] right-[40%] w-48 h-48 bg-teal-400/10 rounded-full blur-3xl" />
        </div>
        <div className="relative z-[1] w-[120px] h-[120px] rounded-full bg-gradient-to-br from-blue-400/15 to-purple-500/15 flex items-center justify-center mb-8 border-[3px] border-white/10 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <span className="text-[3.5rem] drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)] animate-float-y">💬</span>
        </div>
        <h2 className="relative z-[1] text-4xl font-extrabold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 bg-clip-text text-transparent tracking-tight sm:text-3xl">
          Welcome to Reon
        </h2>
        <p className="relative z-[1] text-white/70 text-[1.1rem] max-w-[28rem] leading-relaxed mb-10 sm:text-base sm:px-4">
          Select a chat to start messaging securely with end-to-end encryption.
        </p>
        <div className="relative z-[1] flex flex-col items-center gap-4 px-4 justify-center max-w-[32rem] mt-8 sm:flex-row sm:flex-wrap sm:gap-6 sm:px-0">
          {[
            { icon: '🔒', text: 'End-to-End Encryption' },
            { icon: '🚀', text: 'Instant Messages' },
            { icon: '🖼️', text: 'Secure Media' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-3 p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl min-w-[140px] hover:-translate-y-1 hover:bg-white/[0.08] hover:border-blue-400/30 hover:shadow-[0_8px_25px_rgba(0,0,0,0.2)] transition-all sm:w-full sm:max-w-[280px]">
              <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl text-xl">{icon}</div>
              <span className="text-[0.9rem] text-white/90 font-medium text-center">{text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const renderSkeletonMessages = () => (
    <>
      {[...Array(3)].map((_, i) => (
        <div key={`skeleton-outgoing-${i}`} className="flex justify-end mx-4 my-1 opacity-80 shrink-0">
          <div className="max-w-[70%] flex flex-col gap-1.5">
            <div className={cn("h-4 animate-shimmer rounded-lg", i === 2 ? "w-[120px]" : "w-[200px]")} />
            <div className="h-3 animate-shimmer rounded-md w-[60px] self-end mt-1" />
          </div>
        </div>
      ))}
      {[...Array(5)].map((_, i) => (
        <div key={`skeleton-incoming-${i}`} className="flex gap-2 mx-4 my-1 opacity-80 shrink-0">
          <div className="w-8 h-8 rounded-full animate-shimmer shrink-0" />
          <div className="max-w-[70%] flex flex-col gap-1.5">
            <div className={cn("h-4 animate-shimmer rounded-lg", i === 3 ? "w-[120px]" : "w-[200px]")} />
            {i === 4 && (
              <div className="mt-1">
                <div className="w-[180px] h-[120px] animate-shimmer rounded-lg" />
              </div>
            )}
            <div className="h-3 animate-shimmer rounded-md w-[60px] self-end mt-1" />
          </div>
        </div>
      ))}
      <div className="sticky top-0 z-10 flex justify-center py-2 bg-slate-900/95 backdrop-blur-xl mb-4 border-b border-white/10 shrink-0">
        <div className="w-[250px] h-5 animate-shimmer rounded-[10px]" />
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 bg-slate-900/95 backdrop-blur-xl z-[100] shrink-0 h-16 min-h-16 shadow-[0_2px_8px_rgba(0,0,0,0.2)] sticky top-0 sm:px-3 sm:h-14 sm:min-h-14">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative shrink-0">
            <img
              src={chatImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&background=random`}
              alt={chatName}
              className="w-10 h-10 rounded-full object-cover border-2 border-white/20 hover:border-blue-400/50 hover:scale-105 transition-all sm:w-9 sm:h-9"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&background=random`;
              }}
            />
            {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900 shadow-[0_0_0_2px_rgba(34,197,94,0.3)] animate-pulse" />}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <h3 className="font-semibold text-white leading-tight m-0 text-base whitespace-nowrap overflow-hidden text-ellipsis sm:text-[0.9375rem]">
              {chatName}
            </h3>
            <p className="text-xs text-white/60 mt-0.5 m-0 flex items-center gap-1.5 sm:text-[0.7rem]">
              {isTyping ? (
                <span className="text-green-400 font-medium flex items-center gap-1.5">
                  Typing
                  <span className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-typing-dot" />
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-typing-dot" />
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-typing-dot" />
                  </span>
                </span>
              ) : isOnline ? (
                <span style={{ color: "#22c55e" }}>🟢 Online</span>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.4)" }}>⚫ Offline</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 sm:gap-1.5">
          <button
            className="p-2 rounded-full text-white/80 hover:bg-white/10 hover:-translate-y-px hover:text-white active:translate-y-0 transition-all bg-transparent border-0 cursor-pointer flex items-center justify-center sm:p-1.5"
            aria-label="Voice call"
            onClick={() => selectedUser && onVoiceCall?.(selectedUser._id)}
            disabled={!selectedUser}
          >
            <Phone size={20} />
          </button>
          <button
            className="p-2 rounded-full text-white/80 hover:bg-white/10 hover:-translate-y-px hover:text-white active:translate-y-0 transition-all bg-transparent border-0 cursor-pointer flex items-center justify-center sm:p-1.5"
            aria-label="Video call"
            onClick={() => selectedUser && onVideoCall?.(selectedUser._id)}
            disabled={!selectedUser}
          >
            <Video size={20} />
          </button>
          <button
            className="p-2 rounded-full text-white/80 hover:bg-white/10 hover:-translate-y-px hover:text-white active:translate-y-0 transition-all bg-transparent border-0 cursor-pointer flex items-center justify-center sm:p-1.5"
            aria-label="Close chat"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col min-h-0 relative custom-scrollbar sm:p-2.5">
        {/* Loading older messages */}
        {loadingOlder && (
          <div className="flex flex-col items-center justify-center p-4 gap-3 shrink-0 sticky top-0 z-[5] bg-slate-900/95 backdrop-blur-xl border-b border-white/10 mb-2">
            <div className="w-5 h-5 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin-ring" />
            <span className="text-white/60 text-xs font-medium">Loading older messages...</span>
          </div>
        )}

        {/* Encryption notice */}
        <div className="sticky top-0 z-10 flex justify-center py-2 bg-slate-900/95 backdrop-blur-xl mb-4 border-b border-white/10 shrink-0">
          <span className="bg-yellow-500/15 text-yellow-200 text-xs py-2 px-4 rounded-full border border-yellow-500/30 flex items-center gap-2 font-medium backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.2)] hover:bg-yellow-500/20 hover:-translate-y-px transition-all cursor-default">
            <Lock size={12} className="w-3 h-3 shrink-0" />
            Messages and media are end-to-end encrypted
          </span>
        </div>

        {isLoading && showSkeleton ? (
          <div className="flex flex-col justify-end flex-1 min-h-0 gap-1">
            {renderSkeletonMessages()}
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isMe = msg.sender === currentUserId;
              const messageId = msg._id;
              const mediaForThisMessage = decryptedMedia[messageId] || [];

              return (
                <div key={messageId || `msg-${index}`} data-message-id={messageId || `msg-${index}`}>
                  <MessageBubble
                    message={msg}
                    isMe={isMe}
                    currentUserId={currentUserId}
                    decryptedText={decryptedMessages[messageId]}
                    decryptedMedia={mediaForThisMessage}
                  />
                </div>
              );
            })}

            {/* Typing bubble */}
            {isTyping && (
              <div className="mt-2 mx-4 self-start shrink-0">
                <div className="text-green-400 font-medium flex items-center gap-1.5">
                  <span className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-typing-dot" />
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-typing-dot" />
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-typing-dot" />
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} className="h-px w-full shrink-0 pointer-events-none" />
      </div>
    </div>
  );
};

export default ChatWindow;