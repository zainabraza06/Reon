"use client";
import { use, useState, useEffect, useRef, useCallback } from "react";
import { Phone, Video, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/context/AuthContext";
import { useCallContext } from "@/context/CallContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import { encryptText, encryptFile, decryptText, getStoredPublicKey, getStoredPrivateKey } from "@/lib/crypto";
import type { Message, User } from "@/types";

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
  const { startCall } = useCallContext();
  const { messages, loading, hasMore, loadMore, setMessages } = useMessages(userId, me?._id ?? null);
  const [recipient, setRecipient] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.friends.list().then(({ friends }) => {
      const found = friends.find((f) => f._id === userId);
      if (found) setRecipient(found);
    }).catch(() => {});
    api.messages.markRead(userId).catch(() => {});
  }, [userId]);

  useEffect(() => {
    const onStatus = (d: unknown) => { const { userId: u, isOnline: o } = d as { userId: string; isOnline: boolean }; if (u === userId) setIsOnline(o); };
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendSingle = useCallback(async (text: string, file: File | null, isVoice = false) => {
    if (!me) return;

    const tempId = `temp-${Date.now()}-${Math.random()}`;

    // Optimistic: add "sending" message immediately
    const optimistic: Message = {
      _id: tempId,
      tempId,
      sender: me._id,
      receiver: userId,
      contentType: file ? guessFileType(file.type) : "text",
      plaintext: text || undefined,
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

      // Decrypt for display
      let plaintext = text || undefined;
      if (message.ciphertext && privateKey && message.senderEncryptedKey) {
        try { plaintext = await decryptText(message.ciphertext, message.senderEncryptedKey, privateKey); } catch {}
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
    socketService.emit(t ? "start-typing" : "stop-typing", { senderId: me._id, receiverId: userId });
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
        <Avatar src={recipient?.profilePic} name={recipient?.fullName || "…"} size={40} isOnline={isOnline} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{recipient?.fullName || "…"}</p>
          <p className="text-xs text-gray-500 h-4">
            {isTyping ? <span className="text-violet-500 dark:text-violet-400 font-medium">typing…</span> : isOnline ? <span className="text-emerald-500 font-medium">Online</span> : ""}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => startCall(userId, recipient?.fullName || "User", "audio")}
            className="p-2.5 rounded-xl text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all" title="Voice call">
            <Phone size={19} />
          </button>
          <button type="button" onClick={() => startCall(userId, recipient?.fullName || "User", "video")}
            className="p-2.5 rounded-xl text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all" title="Video call">
            <Video size={19} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-0.5 chat-bg">
        {hasMore && !loading && (
          <div className="text-center py-2">
            <button type="button" onClick={loadMore} className="text-xs text-violet-600 dark:text-violet-400 hover:underline bg-white dark:bg-[#1a1a3a] px-3 py-1.5 rounded-full shadow-sm transition-colors">
              Load earlier messages
            </button>
          </div>
        )}
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
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

      <MessageInput onSend={handleSend} onVoiceNote={handleVoiceNote} onTyping={handleTyping} placeholder={`Message ${recipient?.fullName || "…"}`} />
    </div>
  );
}
