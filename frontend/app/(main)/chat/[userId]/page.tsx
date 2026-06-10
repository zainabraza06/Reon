"use client";
import { use, useState, useEffect, useRef, useCallback } from "react";
import {  ArrowLeft } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/context/AuthContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import { encryptText, encryptFile, decryptText, getStoredPublicKey, getStoredPrivateKey } from "@/lib/crypto";
import type { Message, User } from "@/types";

function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "last seen just now";
  if (mins < 60) return `last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last seen ${hrs}h ago`;
  if (date.toDateString() === new Date(now.getTime() - 86400000).toDateString())
    return `last seen yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `last seen ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function bestAudioMime() {
  const c = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "audio/webm";
}
function mimeToExt(m: string) { if (m.startsWith("audio/webm")) return ".webm"; if (m.startsWith("audio/ogg")) return ".ogg"; if (m.startsWith("audio/mp4")) return ".m4a"; return ".webm"; }
function guessFileType(m: string): "image" | "video" | "audio" | "document" {
  if (m.startsWith("image/")) return "image"; if (m.startsWith("video/")) return "video"; if (m.startsWith("audio/")) return "audio"; return "document";
}

export default function DMPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { user: me } = useAuth();
  const { messages, loading, hasMore, loadMore, setMessages } = useMessages(userId, me?._id ?? null);
  const [recipient, setRecipient] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | undefined>(undefined);
  const [isTyping, setIsTyping] = useState(false);
  const [isFriend, setIsFriend] = useState(true); // optimistic: assume friend until proven otherwise
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastMessageIdRef = useRef<string>("");
  const scrollHeightRef = useRef<number>(0);
  const scrollTopRef = useRef<number>(0);

  useEffect(() => {
    api.friends.list().then(({ friends }) => {
      const found = friends.find((f) => f._id === userId);
      setIsFriend(!!found);
      if (found) {
        setRecipient(found);
        if (found.lastSeen) setLastSeen(found.lastSeen);
      }
    }).catch(() => {});
    api.messages.markRead(userId).catch(() => {});
  }, [userId]);

  // Detect real-time friendship removal while inside the chat
  useEffect(() => {
    const onFriendRemoved = (d: unknown) => {
      const { userId: removerId, friendId: removedId } = d as { userId: string; friendId: string };
      const involved =
        (removerId === me?._id && removedId === userId) ||
        (removerId === userId && removedId === me?._id);
      if (involved) setIsFriend(false);
    };
    socketService.on("friend-removed", onFriendRemoved);
    return () => socketService.off("friend-removed", onFriendRemoved);
  }, [userId, me?._id]);

  // Seed initial online status — don't wait for a status-change event
  useEffect(() => {
    const onOnlineFriends = (data: unknown) => {
      const { onlineFriends } = data as { onlineFriends?: string[] };
      if (Array.isArray(onlineFriends)) setIsOnline(onlineFriends.includes(userId));
    };
    socketService.on("online-friends-response", onOnlineFriends);
    socketService.emit("request-online-friends");
    return () => socketService.off("online-friends-response", onOnlineFriends);
  }, [userId]);

  useEffect(() => {
    const onStatus = (d: unknown) => {
      const { userId: u, isOnline: o, lastSeen: ls } = d as { userId: string; isOnline: boolean; lastSeen?: string };
      if (u !== userId) return;
      setIsOnline(o);
      if (!o && ls) setLastSeen(ls);
    };
    socketService.on("user-status-changed", onStatus);
    return () => socketService.off("user-status-changed", onStatus);
  }, [userId]);

  useEffect(() => {
    const onTyping = (d: unknown) => {
      const { senderId, isTyping: t } = d as { senderId: string; isTyping: boolean };
      if (senderId !== userId) return;
      setIsTyping(t);
      if (t) {
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setIsTyping(false), 4000);
      }
    };
    socketService.on("user-typing", onTyping);
    return () => socketService.off("user-typing", onTyping);
  }, [userId]);

  // Scroll to bottom when typing indicator appears so it's fully visible
  useEffect(() => {
    if (isTyping) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isTyping]);

  // Infinite scroll sentinel observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          // Record scroll position before loading more
          const container = chatContainerRef.current;
          if (container) {
            scrollHeightRef.current = container.scrollHeight;
            scrollTopRef.current = container.scrollTop;
          }
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => {
      observer.unobserve(sentinel);
    };
  }, [loadMore, hasMore, loading]);

  // Adjust scroll position after prepending older messages (scroll anchoring)
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container && scrollHeightRef.current > 0) {
      const delta = container.scrollHeight - scrollHeightRef.current;
      container.scrollTop = scrollTopRef.current + delta;
      scrollHeightRef.current = 0;
    }
  }, [messages]);

  // Smart scroll-to-bottom behavior
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    const isNewMessage = lastMsg._id !== lastMessageIdRef.current;

    if (isNewMessage) {
      const prevId = lastMessageIdRef.current;
      lastMessageIdRef.current = lastMsg._id;

      const isMine = String(lastMsg.sender) === String(me?._id);
      const container = chatContainerRef.current;
      
      const isNearBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight < 200
        : true;

      // Scroll to bottom only if:
      // 1. First initial load (prevId is empty)
      // 2. Sent by me
      // 3. User is already scrolled near the bottom
      const isInitial = !prevId;
      if (isMine || isInitial || isNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, me?._id]);

  const sendSingle = useCallback(async (text: string, file: File | null, isVoice = false) => {
    if (!me) return;

    const tempId = `temp-${Date.now()}-${Math.random()}`;

    const tempMedia = file ? {
      url: URL.createObjectURL(file),
      type: guessFileType(file.type),
      fileName: file.name,
      originalName: file.name,
      fileSize: file.size,
      isEncrypted: false,
    } : undefined;

    // Optimistic: add "sending" message immediately
    const optimistic: Message = {
      _id: tempId,
      tempId,
      sender: me._id,
      receiver: userId,
      contentType: file ? guessFileType(file.type) : "text",
      plaintext: text || undefined,
      media: tempMedia ? [tempMedia] : undefined,
      sentAt: new Date().toISOString(),
      status: "sending",
      isVoiceMessage: isVoice,
    };
    setMessages((prev: Message[]) => [...prev, optimistic]);

    try {
      const [myPublicKey, recipientKeyRes, privateKey] = await Promise.all([
        getStoredPublicKey(),
        api.keys.get(userId).catch(() => null),
        getStoredPrivateKey(),
      ]);

      if (!myPublicKey) throw new Error("Your encryption keys are missing. Please refresh the page.");
      if (!recipientKeyRes?.publicKey) throw new Error("Recipient has no encryption key yet. Ask them to log in first.");

      const fd = new FormData();
      const jsonData: Record<string, unknown> = { sender: me._id, receiver: userId, contentType: file ? guessFileType(file.type) : "text" };

      if (text) {
        const enc = await encryptText(text, recipientKeyRes.publicKey, myPublicKey);
        Object.assign(jsonData, enc);
      }

      if (file) {
        const buf = await file.arrayBuffer();
        const fType = guessFileType(file.type);
        const enc = await encryptFile(buf, recipientKeyRes.publicKey, myPublicKey);
        fd.append("files", new Blob([enc.encryptedBuffer]), file.name);
        fd.append("mediaEncryptedKey", enc.encryptedKey);
        fd.append("mediaSenderEncryptedKey", enc.senderEncryptedKey);
        fd.append("encryptionIV", enc.encryptionIV);
        fd.append("mediaType", fType);
        fd.append("originalName", file.name);
        if (isVoice) fd.append("isVoiceMessage", "true");
      }

      fd.append("data", JSON.stringify(jsonData));
      const message = await api.messages.send(fd);

      // Decrypt for display — API returns `encryptedKey` resolved to the sender's key
      let plaintext = text || undefined;
      if (message.ciphertext && privateKey && message.encryptedKey) {
        try { plaintext = await decryptText(message.ciphertext, message.encryptedKey, privateKey); } catch {}
      }

      // Replace optimistic with real message
      setMessages((prev: Message[]) => {
        const without = prev.filter((m) => m.tempId !== tempId && m._id !== message._id);
        return [...without, { ...message, plaintext, tempId }];
      });
    } catch (err) {
      console.error("sendSingle error:", err);
      // Mark as failed so retry button appears
      setMessages((prev: Message[]) =>
        prev.map((m) => m.tempId === tempId ? { ...m, status: "failed" as const } : m)
      );
    }
  }, [me, userId, setMessages]);

  const handleSend = useCallback(async (text: string, files: File[]) => {
    if (!files.length) { if (text) await sendSingle(text, null); return; }
    for (let i = 0; i < files.length; i++) await sendSingle(i === 0 ? text : "", files[i]);
  }, [sendSingle]);

  const handleVoiceNote = useCallback(async (blob: Blob, _dur: number) => {
    const mime = blob.type || bestAudioMime();
    await sendSingle("", new File([blob], `voice_${Date.now()}${mimeToExt(mime)}`, { type: mime }), true);
  }, [sendSingle]);

  const handleTyping = useCallback((t: boolean) => {
    if (!me) return;
    socketService.emit(t ? "start-typing" : "stop-typing", { senderId: me._id, receiverId: userId, isTyping: t });
  }, [me, userId]);

  const handleRetry = useCallback(async (msg: Message) => {
    // Remove failed message, re-send original text
    setMessages((prev: Message[]) => prev.filter((m) => m.tempId !== msg.tempId && m._id !== msg._id));
    await sendSingle(msg.plaintext || "", null);
  }, [sendSingle, setMessages]);

  if (!me) return null;

  return (
    <div className="flex flex-col h-full bg-[#eef2ff] dark:bg-[#080816]">
      {/* Header */}
      <div className="chat-header flex items-center gap-3 px-3 sm:px-4 py-2.5 shrink-0 shadow-sm">
        <Link href="/chat" className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <Avatar
          src={recipient?.profilePic}
          name={recipient?.fullName || "…"}
          size={40}
          isOnline={isOnline && (recipient?.privacySettings?.showActiveStatus !== false)}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{recipient?.fullName || "…"}</p>
          <p className="text-xs text-gray-500 h-4">
            {isTyping
              ? <span className="text-violet-500 dark:text-violet-400 font-medium">typing…</span>
              : isOnline && recipient?.privacySettings?.showActiveStatus !== false
                ? <span className="text-emerald-500 font-medium">Online</span>
                : !isOnline && lastSeen && recipient?.privacySettings?.showLastSeen !== false
                  ? <span className="text-gray-400">{formatLastSeen(lastSeen)}</span>
                  : null
            }
          </p>
        </div>
        
      </div>

      {/* Messages area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-0.5 chat-bg">
        {/* Infinite Scroll Sentinel — only shown while there are already messages (pagination) */}
        {hasMore && messages.length > 0 && (
          <div ref={sentinelRef} className="h-6 w-full flex items-center justify-center py-2">
            {loading && (
              <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            )}
          </div>
        )}
        {/* Initial load spinner — only when no messages exist yet */}
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.tempId ?? msg._id}
            message={msg}
            isMine={String(msg.sender) === String(me._id)}
            onRetry={msg.status === "failed" ? () => handleRetry(msg) : undefined}
          />
        ))}

        {isTyping && (
          <div className="flex justify-start pl-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {isFriend ? (
        <MessageInput onSend={handleSend} onVoiceNote={handleVoiceNote} onTyping={handleTyping} placeholder={`Message ${recipient?.fullName || "…"}`} />
      ) : (
        <div className="flex items-center justify-center gap-2 px-4 py-3.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
            You&apos;re no longer friends. Messaging is unavailable.
          </p>
        </div>
      )}
    </div>
  );
}
