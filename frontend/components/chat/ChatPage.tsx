// ChatPage.tsx
"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatLogic from "@/hooks/useChatLogic";
import Sidebar from "./SideBar";
import ChatWindow from "./ChatWindow";
import InputArea from "./InputArea";
import { cn } from "@/lib/utils";
import { ChatItem } from "@/types";
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
    setCallViewMode,
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

  const activeCallSessionRef = useRef(activeCall);
  const selectedUserRef = useRef(selectedUser);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    activeCallSessionRef.current = activeCall;
    if (activeCall?.localStream) localStreamRef.current = activeCall.localStream;
    if (activeCall?.remoteStream) remoteStreamRef.current = activeCall.remoteStream;
  }, [activeCall]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  const { initiateCall, endCall, answerCallById, rejectCall, toggleMic, toggleCamera } =
    useWebRTC({
      userId: currentUser?._id || "",
      onCallStateChange: (state, session) => {
        updateCallState(state);
        if (session) {
          if (session.localStream) localStreamRef.current = session.localStream;
          if (session.remoteStream) remoteStreamRef.current = session.remoteStream;
          updateCallStreams(session.localStream, session.remoteStream);
        }
        if (["ended", "failed", "rejected", "busy"].includes(state)) {
          localStreamRef.current = null;
          remoteStreamRef.current = null;
          contextEndCall();
        }
      },
      onRemoteStream: (stream) => {
        if (stream) {
          remoteStreamRef.current = stream;
          updateCallStreams(localStreamRef.current || undefined, stream);
        }
      },
      onIncomingCall: async (data) => {
        console.log("📞 Incoming call notification:", data);
        try {
          const response = await api.get(`/auth/details/${data.fromUserId}`);
          const caller = response.data.data;
          showIncomingCall({
            callId: data.callId,
            fromUserId: data.fromUserId,
            fromUserName: caller.fullName || caller.username || "Unknown",
            fromUserAvatar: caller.profilePic,
            type: data.type,
          });
        } catch {
          showIncomingCall({
            callId: data.callId,
            fromUserId: data.fromUserId,
            fromUserName: "Unknown",
            type: data.type,
          });
        }
      },
      onError: (error) => console.error("❌ Call error:", error),
    });

  const debounceLoadMessages = useCallback(() => {
    if (loadMessagesTimeoutRef.current) clearTimeout(loadMessagesTimeoutRef.current);
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

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!selectedUserRef.current?._id || !currentUser?._id) return;
      if (isTyping && !isTypingRef.current) {
        isTypingRef.current = true;
        triggerTyping?.();
      } else if (!isTyping && isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping?.();
      }
    },
    [currentUser, triggerTyping, stopTyping]
  );

  const handleSelectUser = useCallback(
    (user: ChatItem) => {
      if (isTypingRef.current) { isTypingRef.current = false; stopTyping?.(); }
      if (loadMessagesTimeoutRef.current) clearTimeout(loadMessagesTimeoutRef.current);

      const params = new URLSearchParams();
      params.set("userId", user._id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });

      setSelectedUser(user);
      setMessages([]);
      setDecryptedMessages({});
      resetUnreadCount(user._id);
      shouldLoadMessagesRef.current = true;
    },
    [router, pathname, setSelectedUser, setMessages, setDecryptedMessages, resetUnreadCount, stopTyping]
  );

  const handleVoiceCall = useCallback(
    async (userId: string) => {
      try {
        let callee = users.find((u) => u._id === userId);
        if (!callee) {
          const res = await api.get(`/auth/details/${userId}`);
          if (res.data.success) callee = res.data.data;
          else throw new Error("User not found");
        }
        if (!callee) return;

        startCall({
          callId: "",
          userId,
          userName: callee.fullName || callee.username || "Unknown",
          userAvatar: callee.profilePic,
          type: "audio",
          startTime: Date.now(),
          callState: "initiating",
        });
        setCallViewMode("full");
        await initiateCall(userId, callee.fullName || callee.username || "Unknown", "audio");
      } catch (err) {
        console.error("Failed to start voice call:", err);
        contextEndCall();
      }
    },
    [initiateCall, users, startCall, contextEndCall, setCallViewMode]
  );

  const handleVideoCall = useCallback(
    async (userId: string) => {
      try {
        let callee = users.find((u) => u._id === userId);
        if (!callee) {
          const res = await api.get(`/auth/details/${userId}`);
          if (res.data.success) callee = res.data.data;
          else throw new Error("User not found");
        }
        if (!callee) return;

        startCall({
          callId: "",
          userId,
          userName: callee.fullName || callee.username || "Unknown",
          userAvatar: callee.profilePic,
          type: "video",
          startTime: Date.now(),
          callState: "initiating",
        });
        setCallViewMode("full");
        await initiateCall(userId, callee.fullName || callee.username || "Unknown", "video");
      } catch (err) {
        console.error("Failed to start video call:", err);
        contextEndCall();
      }
    },
    [initiateCall, users, startCall, contextEndCall, setCallViewMode]
  );

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      setIsMicEnabled(true);
      setIsCameraEnabled(incomingCall.type === "video");

      const isInCallerChat = selectedUser?._id === incomingCall.fromUserId;
      if (!isInCallerChat) {
        const callerUser = users.find((u) => u._id === incomingCall.fromUserId);
        if (callerUser) {
          await handleSelectUser(callerUser);
          await new Promise((resolve) => setTimeout(resolve, 200));
        } else {
          const params = new URLSearchParams();
          params.set("userId", incomingCall.fromUserId);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      startCall({
        callId: incomingCall.callId,
        userId: incomingCall.fromUserId,
        userName: incomingCall.fromUserName,
        userAvatar: incomingCall.fromUserAvatar,
        type: incomingCall.type,
        startTime: Date.now(),
        callState: "connecting",
      });
      setCallViewMode("full");
      await answerCallById(incomingCall.callId);
      dismissIncomingCall();
    } catch (err) {
      console.error("Failed to accept call:", err);
      contextEndCall();
      dismissIncomingCall();
    }
  }, [
    incomingCall, setIsMicEnabled, setIsCameraEnabled, startCall,
    dismissIncomingCall, answerCallById, contextEndCall, selectedUser,
    setCallViewMode, users, handleSelectUser, router, pathname,
  ]);

  const handleRejectIncomingCall = useCallback(async () => {
    try {
      if (incomingCall?.callId) rejectCall(incomingCall.callId);
      dismissIncomingCall();
    } catch {
      dismissIncomingCall();
    }
  }, [incomingCall, rejectCall, dismissIncomingCall]);

  const handleEndCall = useCallback(async () => {
    try {
      await endCall("user-ended");
      contextEndCall();
    } catch {
      contextEndCall();
    }
  }, [endCall, contextEndCall]);

  const handleCloseChat = () => {
    if (isTypingRef.current) { isTypingRef.current = false; stopTyping?.(); }
    if (loadMessagesTimeoutRef.current) clearTimeout(loadMessagesTimeoutRef.current);
    router.replace(pathname, { scroll: false });
    setSelectedUser(null);
    setMessages([]);
    setDecryptedMessages({});
    shouldLoadMessagesRef.current = false;
    clearSearchResults?.();
  };

  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!selectedUser) return;
    if (isTypingRef.current) { isTypingRef.current = false; stopTyping?.(); }
    const media = files.map((file) => {
      const rawType = file.type.split("/")[0];
      const type: "image" | "video" | "audio" | "document" = ["image", "video", "audio"].includes(rawType)
        ? (rawType as "image" | "video" | "audio")
        : "document";
      return { file, type };
    });
    await sendMessage({ ciphertext: text, type: "text", media: media.length ? media : undefined });
  };

  // Initial load
  useEffect(() => {
    if (initialLoad.current && currentUser?._id && userIdParam) {
      const userFromParam = users.find((u) => u._id === userIdParam);
      if (userFromParam) {
        setSelectedUser(userFromParam);
        shouldLoadMessagesRef.current = true;
        initialLoad.current = false;
      } else if (users.length > 0 || initialLoad.current) {
        api.get(`/auth/details/${userIdParam}`)
          .then((res) => {
            if (res.data.data) {
              const u = res.data.data;
              setSelectedUser({
                _id: u._id, username: u.username, fullName: u.fullName,
                profilePic: u.profilePic || "", lastMessage: "", isOnline: false, unreadCount: 0,
              });
              shouldLoadMessagesRef.current = true;
              initialLoad.current = false;
            }
          })
          .catch(() => { initialLoad.current = false; });
      }
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
      if (loadMessagesTimeoutRef.current) clearTimeout(loadMessagesTimeoutRef.current);
      if (isTypingRef.current) stopTyping?.();
    };
  }, [stopTyping]);

  const isUserTypingInChat = useCallback(
    () => (selectedUser ? typingUsers[selectedUser._id] === true : false),
    [selectedUser, typingUsers]
  );

  // Loading state
  if (authLoading || !currentUser) {
    return (
      <div className="flex flex-col justify-center items-center h-screen text-white bg-slate-900 text-lg font-medium gap-4">
        <div className="w-12 h-12 border-[3px] border-white/30 rounded-full border-t-blue-400 animate-spin-ring" />
        <p>Loading chat...</p>
      </div>
    );
  }

  const mobileView = selectedUser ? "chat" : "list";

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-slate-900 relative">
      {/* Background blobs */}
      <div className="absolute top-0 -left-16 w-72 h-72 bg-purple-500 opacity-40 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute top-0 -right-16 w-72 h-72 bg-blue-500 opacity-40 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-teal-500 opacity-40 rounded-full blur-[80px] pointer-events-none z-0" />

      {/* Incoming call — banner (when not in caller's chat) */}
      {incomingCall && selectedUser?._id !== incomingCall.fromUserId && (
        <IncomingCallBanner
          isVisible={!!incomingCall}
          callerName={incomingCall.fromUserName}
          callerAvatar={incomingCall.fromUserAvatar}
          callType={incomingCall.type}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
        />
      )}

      {/* Incoming call — modal overlay (when already in caller's chat) */}
      {incomingCall && selectedUser?._id === incomingCall.fromUserId && (
        <div className="absolute inset-0 bg-black/80 z-[1001] flex items-center justify-center backdrop-blur-sm">
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

      {/* Main area */}
      <div className="flex-1 overflow-hidden relative z-10 flex justify-center md:p-4 lg:p-8">
        <div
          className={cn(
            "w-full h-full flex bg-white/10 backdrop-blur-2xl shadow-2xl overflow-hidden",
            "md:rounded-3xl md:max-w-full xl:max-w-[1400px] xl:mx-auto"
          )}
        >
          {/* Sidebar */}
          <div
            className={cn(
              "h-full flex flex-col shrink-0 border-r border-white/10 transition-transform duration-300",
              // Mobile: full-width overlay; Tablet+: fixed column
              "absolute z-20 bg-slate-900 w-full",
              "md:relative md:w-80 md:bg-transparent",
              "lg:w-96",
              "2xl:w-[28rem]",
              mobileView === "chat"
                ? "-translate-x-full md:translate-x-0"
                : "translate-x-0"
            )}
          >
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
          <div
            className={cn(
              "flex-1 flex flex-col h-full overflow-hidden transition-transform duration-300",
              "absolute w-full bg-slate-900",
              "md:relative md:w-auto md:bg-transparent",
              mobileView === "list"
                ? "translate-x-full md:translate-x-0"
                : "translate-x-0"
            )}
          >
            {/* Full-screen call overlay */}
            {activeCall && callViewMode === "full" && (
              <div className="absolute inset-0 bg-slate-900 z-[1000]">
                <ActiveCallScreen
                  isVisible={!!activeCall}
                  remoteUserName={activeCall.userName}
                  remoteUserAvatar={activeCall.userAvatar}
                  callType={activeCall.type}
                  localStream={activeCall.localStream}
                  remoteStream={activeCall.remoteStream}
                  callState={activeCall.callState}
                  onHangup={handleEndCall}
                  onToggleMic={() => { const s = !isMicEnabled; setIsMicEnabled(s); toggleMic(s); }}
                  onToggleCamera={() => { const s = !isCameraEnabled; setIsCameraEnabled(s); toggleCamera(s); }}
                  isMicEnabled={isMicEnabled}
                  isCameraEnabled={isCameraEnabled}
                  onCollapse={() => {
                    const user = users.find((u) => u._id === activeCall.userId);
                    if (user) { handleSelectUser(user); setCallViewMode("mini"); }
                  }}
                  viewMode="full"
                />
              </div>
            )}

            {/* Mini call */}
            {activeCall && callViewMode === "mini" && selectedUser?._id === activeCall.userId && (
              <ActiveCallScreen
                isVisible={!!activeCall}
                remoteUserName={activeCall.userName}
                remoteUserAvatar={activeCall.userAvatar}
                callType={activeCall.type}
                localStream={activeCall.localStream}
                remoteStream={activeCall.remoteStream}
                callState={activeCall.callState}
                onHangup={handleEndCall}
                onToggleMic={() => { const s = !isMicEnabled; setIsMicEnabled(s); toggleMic(s); }}
                onToggleCamera={() => { const s = !isCameraEnabled; setIsCameraEnabled(s); toggleCamera(s); }}
                isMicEnabled={isMicEnabled}
                isCameraEnabled={isCameraEnabled}
                viewMode="mini"
                onBackToCall={() => setCallViewMode("full")}
              />
            )}

            {/* Chat content (hidden during full-screen call) */}
            {!(activeCall && callViewMode === "full") && (
              selectedUser ? (
                <>
                  <ChatWindow
                    selectedUser={users.find((u) => u._id === selectedUser?._id) || selectedUser}
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
                  <div className="shrink-0 bg-slate-900/90 border-t border-white/10 p-4 backdrop-blur-md md:p-4 sm:p-3">
                    <InputArea
                      onSendMessage={handleSendMessage}
                      onTyping={handleTyping}
                      disabled={isSending}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full text-white">
                  <div className="text-6xl mb-6 opacity-80 animate-float-y">💬</div>
                  <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Welcome to Chat
                  </h2>
                  <p className="text-white/70 text-base max-w-sm leading-relaxed">
                    Select a conversation from the sidebar to start chatting
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
