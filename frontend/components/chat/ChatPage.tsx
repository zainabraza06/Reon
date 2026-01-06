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

  const { incomingCall, dismissIncomingCall, startCall, endCall: contextEndCall, setIsMicEnabled, setIsCameraEnabled, activeCall, updateCallStreams, updateCallState, isMicEnabled, isCameraEnabled, showIncomingCall, callViewMode, setCallViewMode } = useCall();

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

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef(activeCall);
  
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const { initiateCall, endCall, answerCallById, rejectCall, toggleMic: toggleMicTrack } = useWebRTC({
    userId: currentUser?._id || "",
    onCallStateChange: (state, session) => {
      console.log('📞 Call state changed:', state, session);
      
      updateCallState(state);
      
      if (session && activeCallRef.current) {
        const currentLocalId = localStreamRef.current?.id;
        const currentRemoteId = remoteStreamRef.current?.id;
        const newLocalId = session.localStream?.id;
        const newRemoteId = session.remoteStream?.id;
        
        if (newLocalId && newLocalId !== currentLocalId) {
          localStreamRef.current = session.localStream || null;
        }
        if (newRemoteId && newRemoteId !== currentRemoteId) {
          remoteStreamRef.current = session.remoteStream || null;
        }
        
        if (newLocalId !== currentLocalId || newRemoteId !== currentRemoteId) {
          updateCallStreams(session.localStream, session.remoteStream);
        }
      }
      
      if (state === 'ended' || state === 'failed') {
        localStreamRef.current = null;
        remoteStreamRef.current = null;
        contextEndCall();
      }
    },
    onRemoteStream: (stream) => {
      console.log('📹 Remote stream received:', stream);
      if (activeCallRef.current && stream) {
        const currentRemoteId = remoteStreamRef.current?.id;
        const newRemoteId = stream.id;
        
        if (newRemoteId !== currentRemoteId) {
          remoteStreamRef.current = stream;
          updateCallStreams(localStreamRef.current || undefined, stream);
        }
      }
    },
    onIncomingCall: async (data) => {
      console.log('📞 Incoming call notification:', data);
      try {
        const response = await api.get(`/auth/details/${data.fromUserId}`);
        const caller=response.data.data;
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

  const selectedUserRef = useRef(selectedUser);
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

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

const handleVoiceCall = useCallback(async (userId: string) => {
  try {
    console.log('📞 Starting voice call with:', userId);
    
    // First try to find user in local users array
    let callee = users.find(u => u._id === userId);
    
    // If not found locally, fetch from API
    if (!callee) {
      console.log('User not found locally, fetching from API...');
      try {
        const response = await api.get(`/api/auth/details/${userId}`);
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
    
    await initiateCall(userId, 'audio');
  } catch (error) {
    console.error('Failed to start voice call:', error);
    contextEndCall();
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }
}, [initiateCall, users, startCall, contextEndCall, setCallViewMode]);

const handleVideoCall = useCallback(async (userId: string) => {
  try {
    console.log('📹 Starting video call with:', userId);
    
    // First try to find user in local users array
    let callee = users.find(u => u._id === userId);
    
    // If not found locally, fetch from API
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
    
    await initiateCall(userId, 'video');
  } catch (error) {
    console.error('Failed to start video call:', error);
    contextEndCall();
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }
}, [initiateCall, users, startCall, contextEndCall, setCallViewMode]);

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      setIsMicEnabled(true);
      setIsCameraEnabled(incomingCall.type === 'video');
      
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
      
      await answerCallById(incomingCall.callId);
      
      dismissIncomingCall();
    } catch (error) {
      console.error('Failed to accept call:', error);
      contextEndCall();
      dismissIncomingCall();
      localStreamRef.current = null;
      remoteStreamRef.current = null;
    }
  }, [incomingCall, setIsMicEnabled, setIsCameraEnabled, startCall, dismissIncomingCall, answerCallById, contextEndCall, selectedUser, setCallViewMode, users, handleSelectUser, router, pathname]);

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

  const handleEndCall = useCallback(async () => {
    try {
      await endCall('user-ended');
      contextEndCall();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }, [endCall, contextEndCall]);

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

  useEffect(() => {
    if (!selectedUser?._id || !shouldLoadMessagesRef.current) return;
    debounceLoadMessages();
    shouldLoadMessagesRef.current = false;
  }, [selectedUser, debounceLoadMessages]);

  useEffect(() => {
    if (selectedUser?._id && !shouldLoadMessagesRef.current) {
      shouldLoadMessagesRef.current = true;
    }
  }, [selectedUser]);

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
                    toggleMicTrack(newState);
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
                  toggleMicTrack(newState);
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