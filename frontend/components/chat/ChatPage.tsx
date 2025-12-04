"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatLogic from "@/hooks/useChatLogic";
import Sidebar from "./SideBar";
import ChatWindow from "./ChatWindow";
import InputArea from "./InputArea";
import { cn } from "@/lib/utils";
import { User, Group } from "@/types";
import styles from './ChatPage.module.css';

const ChatPage: React.FC = () => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const {
    messages,
    users,
    selectedUser,
    selectedGroup,
    decryptedMessages,
    typingUsers,
    groupTypingUsers,
    isSending,
    sendMessage,
    sendGroupMessage,
    startTyping,
    stopTyping,
    startGroupTyping,
    stopGroupTyping,
    searchUsers,
    decryptMessage,
    setSelectedUser,
    setSelectedGroup,
    startNewChat,
    startNewGroupChat
  } = useChatLogic({
    userId: currentUser?._id || "",
    onError: (err) => console.error(err),
    onNewNotification: (n) => console.log("Notification", n),
  });

  if (authLoading || !currentUser) {
    return (
      <div className={styles.loadingContainer}>
        Loading...
      </div>
    );
  }

  // ============================
  // Handlers
  // ============================

  const handleSelectUser = (user: User) => {
    startNewChat(user);
    setMobileView("chat");
  };

  const handleSelectGroup = (group: Group) => {
    startNewGroupChat(group);
    setMobileView("chat");
  };

  const handleBack = () => {
    setMobileView("list");
    setSelectedUser(null);
    setSelectedGroup(null);
  };

  const handleTyping = (isTyping: boolean) => {
    if (selectedUser) {
      isTyping ? startTyping(selectedUser._id) : stopTyping(selectedUser._id);
    } else if (selectedGroup) {
      isTyping
        ? startGroupTyping(selectedGroup._id)
        : stopGroupTyping(selectedGroup._id);
    }
  };

  const handleSendMessage = async (
    text: string,
    files: { file: File; aesKey: string }[]
  ) => {
    if (selectedUser) {
      await sendMessage({
        sender: currentUser._id,
        receiver: selectedUser._id,
        ciphertext: text,
        type: files.length ? files[0].file.type.split("/")[0] : "text",
        media: files.map((f) => ({
          url: URL.createObjectURL(f.file),
          type: f.file.type.split("/")[0],
          encryptedKey: f.aesKey,
        })),
      });
    } else if (selectedGroup) {
      await sendGroupMessage({
        groupId: selectedGroup._id,
        sender: currentUser._id,
        ciphertext: text,
        type: files.length ? files[0].file.type.split("/")[0] : "text",
        media: files.map((f) => ({
          url: URL.createObjectURL(f.file),
          type: f.file.type.split("/")[0],
          encryptedKey: f.aesKey,
        })),
      });
    }
  };

  const isTyping =
    selectedUser
      ? typingUsers.includes(selectedUser._id)
      : selectedGroup
        ? (groupTypingUsers[selectedGroup._id] || []).length > 0
        : false;

  // ============================
  // UI
  // ============================

  return (
    <div className={styles.pageContainer}>
      <div className={cn(styles.blob, styles.blobPurple)}></div>
      <div className={cn(styles.blob, styles.blobBlue)}></div>
      <div className={cn(styles.blob, styles.blobTeal)}></div>

      <div className={styles.mainContainer}>
        <div className={styles.chatWrapper}>
          {/* Sidebar */}
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
              selectedId={selectedUser?._id || selectedGroup?._id}
              onSelectUser={handleSelectUser}
              onSelectGroup={handleSelectGroup}
              onSearch={searchUsers}
            />
          </div>

          {/* Chat Area */}
          <div
            className={cn(
              styles.chatAreaContainer,
              mobileView === "list" ? styles.chatAreaHidden : styles.chatAreaVisible
            )}
          >
            <ChatWindow
              selectedUser={selectedUser}
              selectedGroup={selectedGroup}
              messages={messages}
              currentUserId={currentUser._id}
              decryptedMessages={decryptedMessages}
              onDecryptMessage={decryptMessage}
              isTyping={isTyping}
              onBack={handleBack}
            />

            {(selectedUser || selectedGroup) && (
              <InputArea
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
                disabled={isSending}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
