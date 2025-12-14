"use client";

import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatLogic from "@/hooks/useChatLogic";
import Sidebar from "./SideBar";
import ChatWindow from "./ChatWindow";
import InputArea from "./InputArea";
import { cn } from "@/lib/utils";
import { ChatItem } from "@/types";
import styles from "./ChatPage.module.css";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const ChatPage: React.FC = () => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const initialLoad = useRef(true);
  const shouldLoadMessagesRef = useRef(false);
  const loadMessagesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("userId");

  const {
    messages,
    users,
    selectedUser,
    decryptedMessages,
    decryptedMedia,
    typingUsers,
    isSending,
    sendMessage,
    searchUsers,
    searchResults,
    clearSearchResults,
    setSelectedUser,
    loadMessages,
    setMessages,
    setDecryptedMessages,
    resetUnreadCount,
    markMessagesAsRead,
    triggerTyping,
    stopTyping,
  } = useChatLogic({
    userId: currentUser?._id || "",
    onError: (err) => console.error(err),
  });

  // ✅ REMOVED: Local decrypted media state - useChatLogic handles it
  // ✅ REMOVED: Auto-decryption useEffect hooks - useChatLogic handles it

  // Filter out temp messages for display (optional)
  const displayMessages = useMemo(() => 
    messages.filter(msg => !msg.isFailed), // Show all except failed messages
    [messages]
  );

  // Keep a ref of the selected user for event handlers
  const selectedUserRef = useRef(selectedUser);
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Load messages with debounce
  const debounceLoadMessages = useCallback(() => {
    if (loadMessagesTimeoutRef.current) {
      clearTimeout(loadMessagesTimeoutRef.current);
    }
    
    loadMessagesTimeoutRef.current = setTimeout(async () => {
      if (selectedUser?._id) {
        try {
          await loadMessages();
          await markMessagesAsRead(selectedUser._id);
        } catch (err) {
          console.error("Failed to load messages:", err);
        }
      }
    }, 300);
  }, [selectedUser, loadMessages, markMessagesAsRead]);

  // Handle typing events
  const handleTyping = useCallback((isTyping: boolean) => {
    if (!selectedUserRef.current?._id || !currentUser?._id) return;

    if (isTyping && !isTypingRef.current) {
      isTypingRef.current = true;
      triggerTyping?.();
    } else if (!isTyping && isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping?.();
    }
  }, [currentUser, triggerTyping, stopTyping]);

  // Handle user selection
  const handleSelectUser = useCallback((user: ChatItem) => {
    // Stop typing if active
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping?.();
    }

    // Clear pending message loads
    if (loadMessagesTimeoutRef.current) {
      clearTimeout(loadMessagesTimeoutRef.current);
    }

    // Update URL
    const params = new URLSearchParams();
    params.set("userId", user._id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    // Update state
    setSelectedUser(user);
    setMessages([]);
    setDecryptedMessages({});
    resetUnreadCount(user._id);
    
    // Load messages
    shouldLoadMessagesRef.current = true;
  }, [router, pathname, setSelectedUser, setMessages, setDecryptedMessages, resetUnreadCount, stopTyping]);

  // Handle closing chat
  const handleCloseChat = () => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping?.();
    }

    if (loadMessagesTimeoutRef.current) {
      clearTimeout(loadMessagesTimeoutRef.current);
    }
    
    router.replace(pathname, { scroll: false });
    setSelectedUser(null);
    setMessages([]);
    setDecryptedMessages({});
    shouldLoadMessagesRef.current = false;
    clearSearchResults?.();
  };

  // Handle sending messages
  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!selectedUser) return;

    // Stop typing
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping?.();
    }

    const media = files.map((file) => {
      const rawType = file.type.split("/")[0];
      const type: "image" | "video" | "audio" | "document" =
        ["image", "video", "audio"].includes(rawType)
          ? (rawType as "image" | "video" | "audio")
          : "document";
      return { file, type };
    });

    await sendMessage({
      ciphertext: text,
      type: "text",
      media: media.length ? media : undefined,
    });
  };

  // Initial load from URL
  useEffect(() => {
    if (initialLoad.current && currentUser?._id && userIdParam && users.length > 0) {
      const userFromParam = users.find((user) => user._id === userIdParam);
      if (userFromParam) {
        setSelectedUser(userFromParam);
        shouldLoadMessagesRef.current = true;
      }
      initialLoad.current = false;
    }
  }, [currentUser, userIdParam, users, setSelectedUser]);

  // Load messages when selected user changes
  useEffect(() => {
    if (!selectedUser?._id || !shouldLoadMessagesRef.current) return;
    debounceLoadMessages();
    shouldLoadMessagesRef.current = false;
  }, [selectedUser, debounceLoadMessages]);

  // Auto-load messages when user is already selected
  useEffect(() => {
    if (selectedUser?._id && !shouldLoadMessagesRef.current) {
      shouldLoadMessagesRef.current = true;
    }
  }, [selectedUser]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (loadMessagesTimeoutRef.current) {
        clearTimeout(loadMessagesTimeoutRef.current);
      }
      if (isTypingRef.current) {
        stopTyping?.();
      }
    };
  }, [stopTyping]);

  // Check if current chat user is typing
  const isUserTypingInChat = useCallback(() => {
    return selectedUser ? typingUsers[selectedUser._id] === true : false;
  }, [selectedUser, typingUsers]);

  if (authLoading || !currentUser) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading chat...</p>
      </div>
    );
  }

  const mobileView = selectedUser ? "chat" : "list";

  return (
    <div className={styles.pageContainer}>
      <div className={cn(styles.blob, styles.blobPurple)} />
      <div className={cn(styles.blob, styles.blobBlue)} />
      <div className={cn(styles.blob, styles.blobTeal)} />

      <div className={styles.mainContainer}>
        <div className={styles.chatWrapper}>
          <div className={cn(
            styles.sidebarContainer,
            mobileView === "chat" ? styles.sidebarHidden : styles.sidebarVisible
          )}>
            <Sidebar
              users={users}
              currentUserId={currentUser._id}
              currentUser={currentUser}
              selectedId={selectedUser?._id}
              onSelectUser={handleSelectUser}
              onSearch={searchUsers}
              searchResults={searchResults}
              clearSearchResults={clearSearchResults}
            />
          </div>

          <div className={cn(
            styles.chatAreaContainer,
            mobileView === "list" ? styles.chatAreaHidden : styles.chatAreaVisible
          )}>
            {selectedUser ? (
              <>
                <ChatWindow
                  selectedUser={users.find(u => u._id === selectedUser?._id) || selectedUser}
                  messages={messages} // Use all messages including temp
                  currentUserId={currentUser._id}
                  decryptedMessages={decryptedMessages}
                  decryptedMedia={decryptedMedia} // Use directly from useChatLogic
                  isTyping={isUserTypingInChat()}
                  onClose={handleCloseChat}
                  isLoading={false}
                />
                <InputArea
                  onSendMessage={handleSendMessage}
                  onTyping={handleTyping}
                  disabled={isSending}
                />
              </>
            ) : (
              <ChatWindow
                selectedUser={null}
                messages={[]}
                currentUserId={currentUser._id}
                decryptedMessages={{}}
                decryptedMedia={{}}
                isTyping={false}
                onClose={handleCloseChat}
                isLoading={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;