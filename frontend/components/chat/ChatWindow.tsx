// ChatWindow.tsx
"use client";

import React, { useRef, useEffect } from 'react';
import { Message, User, Group, GroupMessage, DecryptedMediaForUI } from '@/types';
import MessageBubble from './MessageBubble';
import { Phone, Video, MoreVertical, ArrowLeft, Lock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './ChatWindow.module.css';

interface ChatWindowProps {
  selectedUser: User | null;
  selectedGroup: Group | null;
  messages: Array<Message | GroupMessage>;
  currentUserId: string;
  decryptedMessages: Record<string, string>;
  decryptedMedia?: Record<string, DecryptedMediaForUI[]>;
  onDecryptMessage: (message: Message | GroupMessage) => Promise<string>;
  onDecryptMedia?: (messageId: string, mediaIndex: number) => Promise<DecryptedMediaForUI | undefined>;
  isTyping: boolean;
  onBack: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  selectedUser,
  selectedGroup,
  messages,
  currentUserId,
  decryptedMessages,
  decryptedMedia = {},
  onDecryptMessage,
  onDecryptMedia,
  isTyping,
  onBack
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const chatName = selectedUser ? (selectedUser.fullName || selectedUser.username) : selectedGroup?.name;
  const chatImage = selectedUser ? selectedUser.profilePic : selectedGroup?.profilePic;
  const isOnline = selectedUser?.isOnline;
  const isGroup = !!selectedGroup;

  if (!selectedUser && !selectedGroup) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>
          <span className={styles.emptyStateEmoji}>💬</span>
        </div>
        <h2 className={styles.emptyStateTitle}>Welcome to Reon</h2>
        <p className={styles.emptyStateText}>Select a chat to start messaging securely.</p>
      </div>
    );
  }

  // Create a wrapper function that matches MessageBubble's expected signature
  const handleDecryptMediaWrapper = onDecryptMedia 
    ? async (messageId: string, mediaIndex: number) => {
        try {
          console.log(`🔓 Decrypting media ${mediaIndex} for message ${messageId}`);
          const result = await onDecryptMedia(messageId, mediaIndex);
          
          if (result) {
            console.log(`✅ Media decryption successful for ${result.fileName}`);
          } else {
            console.log(`❌ Media decryption failed or returned undefined`);
          }
          
          return result;
        } catch (error) {
          console.error(`Error in ChatWindow media decryption:`, error);
          return undefined;
        }
      }
    : undefined;

  return (
    <div className={styles.chatWindow}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            onClick={onBack} 
            className={styles.backButton}
            aria-label="Back to chats"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className={styles.avatarContainer}>
            <img 
              src={chatImage || `https://ui-avatars.com/api/?name=${chatName}&background=random`} 
              alt={chatName} 
              className={styles.avatar}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const name = chatName || 'User';
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
              }}
            />
            {isOnline && <div className={styles.onlineIndicator}></div>}
          </div>
          
          <div className={styles.chatInfo}>
            <h3 className={cn(styles.chatName, isGroup && styles.chatNameGroup)}>
              {chatName}
              {isGroup && (
                <span className={styles.groupHeader}>
                  <Users size={14} className={styles.groupIcon} />
                </span>
              )}
            </h3>
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
                <span style={{ color: '#22c55e' }}>🟢 Online</span>
              ) : selectedGroup ? (
                <span className={styles.memberCount}>
                  👥 {selectedGroup.members?.length || 0} members
                </span>
              ) : (
                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>⚫ Offline</span>
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
          <button className={styles.actionButton} aria-label="More options">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={containerRef} className={cn(styles.messagesContainer, 'custom-scrollbar')}>
        {/* Encryption Notice */}
        <div className={styles.encryptionNotice}>
          <span className={styles.encryptionBadge}>
            <Lock size={12} className={styles.lockIcon} /> 
            Messages and media are end-to-end encrypted
          </span>
        </div>

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
              onDecryptMedia={handleDecryptMediaWrapper} // Use the wrapper function
              decryptedText={decryptedMessages[messageId]}
              decryptedMedia={mediaForThisMessage}
            />
          );
        })}
        
        {isTyping && !messages.some(msg => msg.sender !== currentUserId && !msg.delivered) && (
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
        
        <div ref={bottomRef} className={styles.bottomRef} />
      </div>
    </div>
  );
};

export default ChatWindow;