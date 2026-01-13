// ChatPage.tsx - Complete Fixed Version
"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatLogic from "@/hooks/useChatLogic";
import Sidebar from "./SideBar";
import ChatWindow from "./ChatWindow";
import InputArea from "./InputArea";
import { cn } from "@/lib/utils";
import { ChatItem } from "@/types";
import styles from "./ChatPage.module.css";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useWebRTC } from "@/hooks/useWEBRTC";
import { useCall } from "@/context/CallContext";
import IncomingCallModal from "@/components/call/IncomingCallModal";
import IncomingCallBanner from "@/components/call/IncomingCallBanner";
import ActiveCallScreen from "@/components/call/ActiveCallScreen";
import { api } from "@/lib/api";

const ChatPage: React.FC = () => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const initialLoad = useRef(true);
  const shouldLoadMessagesRef = useRef(false);
  const loadMessagesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const { 
    incomingCall, 
    dismissIncomingCall, 
    startCall, 
    endCall: contextEndCall, 
    setIsMicEnabled, 
    setIsCameraEnabled, 
    activeCall, 
    updateCallStreams, 
    updateCallState, 
    isMicEnabled, 
    isCameraEnabled, 
    showIncomingCall, 
    callViewMode, 
    setCallViewMode 
  } = useCall();

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
    loadOlderMessages,
  } = useChatLogic({
    userId: currentUser?._id || "",
    onError: (err) => console.error(err),
  });

  // Refs for state management
  const activeCallSessionRef = useRef(activeCall);
  const selectedUserRef = useRef(selectedUser);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  
  // Keep refs updated
  useEffect(() => {
    activeCallSessionRef.current = activeCall;
    if (activeCall?.localStream) {
      localStreamRef.current = activeCall.localStream;
    }
    if (activeCall?.remoteStream) {
      remoteStreamRef.current = activeCall.remoteStream;
    }
  }, [activeCall]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // WebRTC hook with proper stream updates
  const { 
    initiateCall, 
    endCall, 
    answerCallById, 
    rejectCall, 
    toggleMic, 
    toggleCamera 
  } = useWebRTC({
    userId: currentUser?._id || "",
    onCallStateChange: (state, session) => {
      console.log('📞 Call state changed:', state, session);
      
      // Update call state in context
      updateCallState(state);
      
      // Update streams when session changes
      if (session) {
        // Update local refs
        if (session.localStream) {
          localStreamRef.current = session.localStream;
        }
        if (session.remoteStream) {
          remoteStreamRef.current = session.remoteStream;
        }
        
        // Update context with streams (always update, don't compare IDs)
        updateCallStreams(session.localStream, session.remoteStream);
      }
      
      // Handle call termination
      if (state === 'ended' || state === 'failed' || state === 'rejected' || state === 'busy') {
        localStreamRef.current = null;
        remoteStreamRef.current = null;
        contextEndCall();
      }
    },
    onRemoteStream: (stream) => {
      console.log('📹 Remote stream received:', stream);
      if (stream) {
        remoteStreamRef.current = stream;
        updateCallStreams(localStreamRef.current || undefined, stream);
      }
    },
    onIncomingCall: async (data) => {
      console.log('📞 Incoming call notification:', data);
      try {
        const response = await api.get(`/auth/details/${data.fromUserId}`);
        const caller = response.data.data;
        showIncomingCall({
          callId: data.callId,
          fromUserId: data.fromUserId,
          fromUserName: caller.fullName || caller.username || 'Unknown',
          fromUserAvatar: caller.profilePic,
          type: data.type
        });
      } catch (error) {
        console.error('Failed to fetch caller info:', error);
        showIncomingCall({
          callId: data.callId,
          fromUserId: data.fromUserId,
          fromUserName: 'Unknown',
          type: data.type
        });
      }
    },
    onError: (error) => {
      console.error('❌ Call error:', error);
    }
  });

  // Debounced message loading
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

  // Typing handler
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

  // User selection handler
  const handleSelectUser = useCallback((user: ChatItem) => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping?.();
    }

    if (loadMessagesTimeoutRef.current) {
      clearTimeout(loadMessagesTimeoutRef.current);
    }

    const params = new URLSearchParams();
    params.set("userId", user._id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    setSelectedUser(user);
    setMessages([]);
    setDecryptedMessages({});
    resetUnreadCount(user._id);
    
    shouldLoadMessagesRef.current = true;
  }, [router, pathname, setSelectedUser, setMessages, setDecryptedMessages, resetUnreadCount, stopTyping]);

  // Voice call handler
  const handleVoiceCall = useCallback(async (userId: string) => {
    try {
      console.log('📞 Starting voice call with:', userId);
      
      let callee = users.find(u => u._id === userId);
      
      if (!callee) {
        console.log('User not found locally, fetching from API...');
        try {
          const response = await api.get(`/auth/details/${userId}`);
          if (response.data.success) {
            callee = response.data.data;
          } else {
            throw new Error('User not found');
          }
        } catch (fetchError) {
          console.error('Failed to fetch user details:', fetchError);
          return;
        }
      }
      
      if (!callee) {
        console.error('Callee not found');
        return;
      }
      
      // Start the call in context first
      startCall({
        callId: '',
        userId: userId,
        userName: callee.fullName || callee.username || 'Unknown',
        userAvatar: callee.profilePic,
        type: 'audio',
        startTime: Date.now(),
        callState: 'initiating',
      });
      
      setCallViewMode('full');
      
      // Now initiate the WebRTC call
      await initiateCall(userId, callee.fullName || callee.username || 'Unknown', 'audio');
    } catch (error) {
      console.error('Failed to start voice call:', error);
      contextEndCall();
    }
  }, [initiateCall, users, startCall, contextEndCall, setCallViewMode]);

  // Video call handler
  const handleVideoCall = useCallback(async (userId: string) => {
    try {
      console.log('📹 Starting video call with:', userId);
      
      let callee = users.find(u => u._id === userId);
      
      if (!callee) {
        console.log('User not found locally, fetching from API...');
        try {
          const response = await api.get(`/auth/details/${userId}`);
          if (response.data.success) {
            callee = response.data.data;
          } else {
            throw new Error('User not found');
          }
        } catch (fetchError) {
          console.error('Failed to fetch user details:', fetchError);
          return;
        }
      }
      
      if (!callee) {
        console.error('Callee not found');
        return;
      }
      
      // Start the call in context first
      startCall({
        callId: '',
        userId: userId,
        userName: callee.fullName || callee.username || 'Unknown',
        userAvatar: callee.profilePic,
        type: 'video',
        startTime: Date.now(),
        callState: 'initiating',
      });
      
      setCallViewMode('full');
      
      // Now initiate the WebRTC call
      await initiateCall(userId, callee.fullName || callee.username || 'Unknown', 'video');
    } catch (error) {
      console.error('Failed to start video call:', error);
      contextEndCall();
    }
  }, [initiateCall, users, startCall, contextEndCall, setCallViewMode]);

  // Accept incoming call handler
  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      // Set initial media states
      setIsMicEnabled(true);
      setIsCameraEnabled(incomingCall.type === 'video');
      
      // Navigate to caller's chat if needed
      const isInCallerChat = selectedUser?._id === incomingCall.fromUserId;
      
      if (!isInCallerChat) {
        const callerUser = users.find(u => u._id === incomingCall.fromUserId);
        if (callerUser) {
          await handleSelectUser(callerUser);
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          const params = new URLSearchParams();
          params.set("userId", incomingCall.fromUserId);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Start the call in context
      startCall({
        callId: incomingCall.callId,
        userId: incomingCall.fromUserId,
        userName: incomingCall.fromUserName,
        userAvatar: incomingCall.fromUserAvatar,
        type: incomingCall.type,
        startTime: Date.now(),
        callState: 'connecting',
      });
      
      setCallViewMode('full');
      
      // Answer the call
      await answerCallById(incomingCall.callId);
      
      dismissIncomingCall();
    } catch (error) {
      console.error('Failed to accept call:', error);
      contextEndCall();
      dismissIncomingCall();
    }
  }, [incomingCall, setIsMicEnabled, setIsCameraEnabled, startCall, dismissIncomingCall, answerCallById, contextEndCall, selectedUser, setCallViewMode, users, handleSelectUser, router, pathname]);

  // Reject incoming call handler
  const handleRejectIncomingCall = useCallback(async () => {
    try {
      if (incomingCall?.callId) {
        rejectCall(incomingCall.callId);
      }
      dismissIncomingCall();
    } catch (error) {
      console.error('Failed to reject call:', error);
      dismissIncomingCall();
    }
  }, [incomingCall, rejectCall, dismissIncomingCall]);

  // End call handler
  const handleEndCall = useCallback(async () => {
    try {
      await endCall('user-ended');
      contextEndCall();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }, [endCall, contextEndCall]);

  // Close chat handler
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

  // Send message handler
  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!selectedUser) return;

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

  // Initial load effect
  useEffect(() => {
    if (initialLoad.current && currentUser?._id && userIdParam) {
      const userFromParam = users.find((user) => user._id === userIdParam);
      
      if (userFromParam) {
        // User found in chat list
        setSelectedUser(userFromParam);
        shouldLoadMessagesRef.current = true;
        initialLoad.current = false;
      } else if (users.length > 0 || initialLoad.current) {
        // Users list loaded or still loading - try to fetch user details from API
        api.get(`/auth/details/${userIdParam}`)
          .then(res => {
            if (res.data.data) {
              const user = res.data.data;
              const chatItem: ChatItem = {
                _id: user._id,
                username: user.username,
                fullName: user.fullName,
                profilePic: user.profilePic || '',
                lastMessage: '',
                isOnline: false,
                unreadCount: 0,
              };
              setSelectedUser(chatItem);
              shouldLoadMessagesRef.current = true;
              initialLoad.current = false;
            }
          })
          .catch(err => {
            console.error('Failed to fetch user details:', err);
            initialLoad.current = false;
          });
      }
    }
  }, [currentUser, userIdParam, users, setSelectedUser]);

  // Load messages effect
  useEffect(() => {
    if (!selectedUser?._id || !shouldLoadMessagesRef.current) return;
    debounceLoadMessages();
    shouldLoadMessagesRef.current = false;
  }, [selectedUser, debounceLoadMessages]);

  // Reset load flag effect
  useEffect(() => {
    if (selectedUser?._id && !shouldLoadMessagesRef.current) {
      shouldLoadMessagesRef.current = true;
    }
  }, [selectedUser]);

  // Cleanup effect
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

  // Typing status helper
  const isUserTypingInChat = useCallback(() => {
    return selectedUser ? typingUsers[selectedUser._id] === true : false;
  }, [selectedUser, typingUsers]);

  // Loading state
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

      {/* Incoming call notifications */}
      {incomingCall && (
        <>
          {selectedUser?._id !== incomingCall.fromUserId && (
            <IncomingCallBanner
              isVisible={!!incomingCall}
              callerName={incomingCall.fromUserName}
              callerAvatar={incomingCall.fromUserAvatar}
              callType={incomingCall.type}
              onAccept={handleAcceptIncomingCall}
              onReject={handleRejectIncomingCall}
            />
          )}
          
          {selectedUser?._id === incomingCall.fromUserId && (
            <div className={styles.incomingCallOverlay}>
              <IncomingCallModal
                isVisible={!!incomingCall}
                callerName={incomingCall.fromUserName}
                callerAvatar={incomingCall.fromUserAvatar}
                callType={incomingCall.type}
                onAccept={handleAcceptIncomingCall}
                onReject={handleRejectIncomingCall}
              />
            </div>
          )}
        </>
      )}

      <div className={styles.mainContainer}>
        <div className={styles.chatWrapper}>
          {/* Sidebar */}
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

          {/* Chat area */}
          <div className={cn(
            styles.chatAreaContainer,
            mobileView === "list" ? styles.chatAreaHidden : styles.chatAreaVisible
          )}>
            {!(activeCall && callViewMode === 'full') && (
              selectedUser ? (
                <>
                  <ChatWindow
                    selectedUser={users.find(u => u._id === selectedUser?._id) || selectedUser}
                    messages={messages}
                    currentUserId={currentUser._id}
                    decryptedMessages={decryptedMessages}
                    decryptedMedia={decryptedMedia}
                    isTyping={isUserTypingInChat()}
                    onClose={handleCloseChat}
                    isLoading={false}
                    onVoiceCall={handleVoiceCall}
                    onVideoCall={handleVideoCall}
                    onLoadMore={() => loadOlderMessages?.()}
                  />
                  <div className={styles.inputAreaContainer}>
                    <InputArea
                      onSendMessage={handleSendMessage}
                      onTyping={handleTyping}
                      disabled={isSending}
                    />
                  </div>
                </>
              ) : (
                <div className={styles.emptyChat}>
                  <div className={styles.emptyChatIcon}>💬</div>
                  <h2 className={styles.emptyChatTitle}>Welcome to Chat</h2>
                  <p className={styles.emptyChatText}>
                    Select a conversation from the sidebar to start chatting
                  </p>
                </div>
              )
            )}

            {/* Full-screen call */}
            {activeCall && callViewMode === 'full' && (
              <div className={styles.callOverlay}>
                <ActiveCallScreen
                  isVisible={!!activeCall}
                  remoteUserName={activeCall.userName}
                  remoteUserAvatar={activeCall.userAvatar}
                  callType={activeCall.type}
                  localStream={activeCall.localStream}
                  remoteStream={activeCall.remoteStream}
                  callState={activeCall.callState}
                  onHangup={handleEndCall}
                  onToggleMic={() => {
                    const newState = !isMicEnabled;
                    setIsMicEnabled(newState);
                    toggleMic(newState);
                  }}
                  onToggleCamera={() => {
                    const newState = !isCameraEnabled;
                    setIsCameraEnabled(newState);
                    toggleCamera(newState);
                  }}
                  isMicEnabled={isMicEnabled}
                  isCameraEnabled={isCameraEnabled}
                  onCollapse={() => {
                    if (activeCall.userId) {
                      const user = users.find(u => u._id === activeCall.userId);
                      if (user) {
                        handleSelectUser(user);
                        setCallViewMode('mini');
                      }
                    }
                  }}
                  viewMode="full"
                />
              </div>
            )}

            {/* Mini call */}
            {activeCall && callViewMode === 'mini' && selectedUser && selectedUser._id === activeCall.userId && (
              <ActiveCallScreen
                isVisible={!!activeCall}
                remoteUserName={activeCall.userName}
                remoteUserAvatar={activeCall.userAvatar}
                callType={activeCall.type}
                localStream={activeCall.localStream}
                remoteStream={activeCall.remoteStream}
                callState={activeCall.callState}
                onHangup={handleEndCall}
                onToggleMic={() => {
                  const newState = !isMicEnabled;
                  setIsMicEnabled(newState);
                  toggleMic(newState);
                }}
                onToggleCamera={() => {
                  const newState = !isCameraEnabled;
                  setIsCameraEnabled(newState);
                  toggleCamera(newState);
                }}
                isMicEnabled={isMicEnabled}
                isCameraEnabled={isCameraEnabled}
                viewMode="mini"
                onBackToCall={() => {
                  setCallViewMode('full');
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;