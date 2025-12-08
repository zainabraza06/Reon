"use client";

import React, { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatLogic from "@/hooks/useChatLogic";
import Sidebar from "./SideBar";
import ChatWindow from "./ChatWindow";
import InputArea from "./InputArea";
import { cn } from "@/lib/utils";
import { User, Group } from "@/types";
import styles from "./ChatPage.module.css";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const ChatPage: React.FC = () => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const processingURL = useRef(false);
  const loadedUsers = useRef(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const {
    messages,
    users,
    selectedUser,
    selectedGroup,
    decryptedMessages,
    decryptedMedia, // Add this
    typingUsers,
    groupTypingUsers,
    isSending,
    sendMessage,
    startTyping,
    stopTyping,
    startGroupTyping,
    stopGroupTyping,
    searchUsers,
    decryptMessage,
    decryptSingleMedia, // Add this - the new function
    setSelectedUser,
    setSelectedGroup,
    loadMessages,
    loadChatUsers,
    setMessages,
    setDecryptedMessages,
  } = useChatLogic({
    userId: currentUser?._id || "",
    onError: (err) => console.error(err),
    onNewNotification: (n) => console.log("Notification", n),
  });

  // Get URL params
  const userId = searchParams.get("userId");
  const groupId = searchParams.get("groupId");

  // Load chat users only once
  useEffect(() => {
    if (currentUser?._id && !loadedUsers.current) {
      console.log("📱 Loading chat users list...");
      loadedUsers.current = true;
      loadChatUsers();
    }
  }, [currentUser?._id]);

  const lastHandledUserId = useRef<string | null>(null);
  const lastHandledGroupId = useRef<string | null>(null);

  // Handle URL params for opening chats
  useEffect(() => {
    if (!currentUser || processingURL.current || users.length === 0) return;

    const userIdParam = searchParams.get("userId");
    const groupIdParam = searchParams.get("groupId");

    // Handle user selection from URL
    if (userIdParam && userIdParam !== lastHandledUserId.current) {
      const friend = users.find(
        (u): u is User => "_id" in u && "username" in u && u._id === userIdParam
      );

      if (friend) {
        console.log("✅ URL - Opening user chat:", friend.username);
        processingURL.current = true;
        lastHandledUserId.current = userIdParam;
        lastHandledGroupId.current = null;

        // Clear previous messages and media
        setMessages([]);
        setDecryptedMessages({});
        // Note: decryptedMedia state is managed inside useChatLogic
        
        // Set the user
        setSelectedUser(friend);
        setSelectedGroup(null);

        // Load messages after a short delay to ensure state is updated
        setTimeout(async () => {
          try {
            await loadMessages();
            console.log("✅ Messages loaded from URL");
          } catch (error) {
            console.error("❌ Failed to load messages from URL:", error);
          } finally {
            processingURL.current = false;
          }
        }, 100);
      }
    }

    // Handle group selection from URL
    if (groupIdParam && groupIdParam !== lastHandledGroupId.current) {
      const group = users.find(
        (g): g is Group => "_id" in g && g._id === groupIdParam
      );

      if (group) {
        console.log("✅ URL - Opening group chat:", group.name);
        processingURL.current = true;
        lastHandledGroupId.current = groupIdParam;
        lastHandledUserId.current = null;

        // Clear previous messages and media
        setMessages([]);
        setDecryptedMessages({});
        
        // Set the group
        setSelectedGroup(group);
        setSelectedUser(null);

        // Load messages after a short delay
        setTimeout(async () => {
          try {
            await loadMessages();
            console.log("✅ Group messages loaded from URL");
          } catch (error) {
            console.error("❌ Failed to load group messages:", error);
          } finally {
            processingURL.current = false;
          }
        }, 100);
      }
    }
  }, [searchParams, users, currentUser]);

  // Handle clearing selection when URL params are removed
  useEffect(() => {
    const userIdParam = searchParams.get("userId");
    const groupIdParam = searchParams.get("groupId");

    if (!userIdParam && !groupIdParam && (selectedUser || selectedGroup)) {
      console.log("🗑️ Clearing selection - no URL params");
      
      // Use setTimeout to avoid synchronous updates
      setTimeout(() => {
        setSelectedUser(null);
        setSelectedGroup(null);
        setMessages([]);
        setDecryptedMessages({});
      }, 0);
    }
  }, [searchParams, selectedUser, selectedGroup]);

  const mobileView: "list" | "chat" = selectedUser || selectedGroup ? "chat" : "list";

  if (authLoading || !currentUser) {
    return <div className={styles.loadingContainer}>Loading...</div>;
  }

  // ============================ Handlers ============================

  const handleSelectUser = async (user: User) => {
    console.log("👤 Selecting user:", user.username);
    
    // Update URL
    const params = new URLSearchParams();
    params.set("userId", user._id);
    params.delete("groupId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    
    // Reset tracking refs
    lastHandledUserId.current = user._id;
    lastHandledGroupId.current = null;
    
    // Clear previous messages and set new user
    setMessages([]);
    setDecryptedMessages({});
    setSelectedGroup(null);
    setSelectedUser(user);
    
    // Wait a moment for state to update, then load messages
    setTimeout(async () => {
      try {
        console.log("📨 Loading messages for user:", user._id);
        await loadMessages();
        console.log("✅ Messages loaded successfully");
      } catch (error) {
        console.error("❌ Failed to load messages:", error);
      }
    }, 50);
  };

  const handleSelectGroup = async (group: Group) => {
    console.log("👥 Selecting group:", group.name);
    const params = new URLSearchParams();
    params.set("groupId", group._id);
    params.delete("userId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    
    // Reset tracking refs
    lastHandledGroupId.current = group._id;
    lastHandledUserId.current = null;
    
    // Clear previous messages and set new group
    setMessages([]);
    setDecryptedMessages({});
    setSelectedUser(null);
    setSelectedGroup(group);
    
    // Wait a moment for state to update, then load messages
    setTimeout(async () => {
      try {
        console.log("📨 Loading messages for group:", group._id);
        await loadMessages();
        console.log("✅ Group messages loaded successfully");
      } catch (error) {
        console.error("❌ Failed to load group messages:", error);
      }
    }, 50);
  };

  const handleBack = () => {
    console.log("↩️ Going back to chat list");
    router.replace(pathname, { scroll: false });
    
    setTimeout(() => {
      setSelectedUser(null);
      setSelectedGroup(null);
      setMessages([]);
      setDecryptedMessages({});
    }, 0);
  };

  const handleTyping = (isTyping: boolean) => {
    if (selectedUser) {
      isTyping ? startTyping(selectedUser._id) : stopTyping(selectedUser._id);
    } else if (selectedGroup) {
      isTyping ? startGroupTyping(selectedGroup._id) : stopGroupTyping(selectedGroup._id);
    }
  };

  const handleSendMessage = async (
    text: string,
    files: File[] = []
  ) => {
    console.log('🚀 handleSendMessage called', { text, files: files.length, selectedUser, selectedGroup });
    
    if (!selectedUser && !selectedGroup) {
      console.log('❌ No recipient selected, returning early');
      return;
    }

    // Prepare media
    const media: {
      file: File;
      type: "image" | "audio" | "video" | "document";
    }[] = files
      .map((file) => {
        const mainType = file.type.split("/")[0];

        if (
          mainType === "image" ||
          mainType === "video" ||
          mainType === "audio"
        ) {
          return {
            file,
            type: mainType as "image" | "audio" | "video",
          };
        }

        return {
          file,
          type: "document",
        };
      });

    console.log('📦 Prepared media:', media);

    // 1-to-1 Chat
    if (selectedUser) {
      console.log('👤 Sending to user:', selectedUser._id);
      console.log('📤 Calling sendMessage with:', { 
        ciphertext: text, 
        type: "text", 
        media: media.length ? media : undefined 
      });
      
      try {
        await sendMessage({
          ciphertext: text,
          type: "text",
          media: media.length ? media : undefined,
        });
        console.log('✅ sendMessage completed');
      } catch (error) {
        console.error('❌ sendMessage failed:', error);
      }
    }
  };

  // Handle media decryption - wrapper function
  const handleDecryptMedia = async (messageId: string, mediaIndex: number) => {
    if (!decryptSingleMedia) {
      console.warn('decryptSingleMedia function not available');
      return undefined;
    }
    
    try {
      console.log(`🔓 Decrypting media ${mediaIndex} for message ${messageId}`);
      const result = await decryptSingleMedia(messageId, mediaIndex);
      return result; // This will be DecryptedMediaForUI | undefined
    } catch (error) {
      console.error('Failed to decrypt media:', error);
      return undefined;
    }
  };

  const isTyping =
    selectedUser
      ? typingUsers.includes(selectedUser._id)
      : selectedGroup
      ? (groupTypingUsers[selectedGroup._id] || []).length > 0
      : false;

  // ============================ UI ============================

  return (
    <div className={styles.pageContainer}>
      <div className={cn(styles.blob, styles.blobPurple)}></div>
      <div className={cn(styles.blob, styles.blobBlue)}></div>
      <div className={cn(styles.blob, styles.blobTeal)}></div>

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
              selectedId={selectedUser?._id || selectedGroup?._id}
              onSelectUser={handleSelectUser}
              onSelectGroup={handleSelectGroup}
              onSearch={searchUsers}
            />
          </div>

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
              decryptedMedia={decryptedMedia} // Pass decrypted media state
              onDecryptMessage={decryptMessage}
              onDecryptMedia={handleDecryptMedia} // Pass the media decryption function
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