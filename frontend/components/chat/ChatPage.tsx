"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatLogic from "@/hooks/useChatLogic";
import Sidebar from "./SideBar";
import ChatWindow from "./ChatWindow";
import InputArea from "./InputArea";
import { cn } from "@/lib/utils";
import { User } from "@/types";
import styles from "./ChatPage.module.css";
import { useRouter, usePathname } from "next/navigation";

const ChatPage: React.FC = () => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const loadedUsers = useRef(false);

  const router = useRouter();
  const pathname = usePathname();

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
    setSelectedUser,
    loadMessages,
    loadChatUsers,
    setMessages,
    setDecryptedMessages,
    decryptSingleMedia,
    decryptMessage,
    resetUnreadCount,
    markMessagesAsRead,
    startTyping,  // Already provided by useChatLogic
    stopTyping,   // Already provided by useChatLogic
  } = useChatLogic({
    userId: currentUser?._id || "",
    onError: (err) => console.error(err),
    onNewNotification: (n) => console.log("Notification", n),
  });

  // Load chat users once
  useEffect(() => {
    if (currentUser?._id && !loadedUsers.current) {
      loadedUsers.current = true;
      loadChatUsers();
    }
  }, [currentUser?._id, loadChatUsers]);

  // Handle selecting a user
  const handleSelectUser = async (user: User) => {
    const params = new URLSearchParams();
    params.set("userId", user._id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    setSelectedUser(user);
    setMessages([]);
    setDecryptedMessages({});

    resetUnreadCount(user._id);

    try {
      await loadMessages();
      await markMessagesAsRead(user._id);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleBack = () => {
    router.replace(pathname, { scroll: false });
    setSelectedUser(null);
    setMessages([]);
    setDecryptedMessages({});
  };

  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!selectedUser) return;

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

  const handleDecryptMedia = async (messageId: string, mediaIndex: number) => {
    if (!decryptSingleMedia) return undefined;
    try {
      return await decryptSingleMedia(messageId, mediaIndex);
    } catch (error) {
      console.error("Failed to decrypt media:", error);
      return undefined;
    }
  };

  const handleTyping = useCallback((isTyping: boolean) => {
    if (!selectedUser?._id || !currentUser?._id) return;
    
    console.log(`⌨️ [ChatPage] Typing ${isTyping ? 'started' : 'stopped'} to ${selectedUser._id}`);
    
    // Use functions already provided by useChatLogic
    if (isTyping) {
      startTyping();
    } else {
      stopTyping();
    }
  }, [selectedUser, currentUser?._id, startTyping, stopTyping]);

  const isTyping = selectedUser ? typingUsers.includes(selectedUser._id) : false;

  if (authLoading || !currentUser) {
    return <div className={styles.loadingContainer}>Loading...</div>;
  }

  const mobileView = selectedUser ? "chat" : "list";

  

  return (
    <div className={styles.pageContainer}>
      <div className={cn(styles.blob, styles.blobPurple)} />
      <div className={cn(styles.blob, styles.blobBlue)} />
      <div className={cn(styles.blob, styles.blobTeal)} />

      <div className={styles.mainContainer}>
        <div className={styles.chatWrapper}>
          <div
            className={cn(
              styles.sidebarContainer,
              mobileView === "chat" ? styles.sidebarHidden : styles.sidebarVisible
            )}
          >
            <Sidebar
              users={users}
              currentUserId={currentUser._id}
              currentUser={currentUser}
              selectedId={selectedUser?._id}
              onSelectUser={handleSelectUser}
              onSearch={searchUsers}
            />
          </div>

          <div
            className={cn(
              styles.chatAreaContainer,
              mobileView === "list" ? styles.chatAreaHidden : styles.chatAreaVisible
            )}
          >
            {selectedUser ? (
              <>
                <ChatWindow
                  selectedUser={selectedUser}
                  messages={messages}
                  currentUserId={currentUser._id}
                  decryptedMessages={decryptedMessages}
                  decryptedMedia={decryptedMedia}
                  onDecryptMessage={decryptMessage}
                  onDecryptMedia={handleDecryptMedia}
                  isTyping={isTyping}
                  onBack={handleBack}
                />
                <InputArea
                  onSendMessage={handleSendMessage}
                  onTyping={handleTyping}
                  disabled={isSending}
                />
              </>
            ) : (
              <div className={styles.emptyState}>
                Select a chat to start messaging
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;