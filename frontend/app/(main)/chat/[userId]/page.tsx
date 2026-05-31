"use client";
import { use, useEffect, useRef, useCallback } from "react";
import { Phone, Video, Info, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/context/AuthContext";
import { useCallContext } from "@/context/CallContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import {
  encryptText,
  encryptFile,
  decryptText,
  getStoredPublicKey,
  getStoredPrivateKey,
} from "@/lib/crypto";
import { useState } from "react";
import type { Message, User } from "@/types";

// Detect the best supported audio MIME type for MediaRecorder
function bestAudioMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

function mimeToExt(mime: string): string {
  if (mime.startsWith("audio/webm")) return ".webm";
  if (mime.startsWith("audio/ogg")) return ".ogg";
  if (mime.startsWith("audio/mp4")) return ".m4a";
  return ".webm";
}

function guessFileType(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
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
    api.friends
      .list()
      .then(({ friends }) => {
        const found = friends.find((f) => f._id === userId);
        if (found) setRecipient(found);
      })
      .catch(() => {});
    api.messages.markRead(userId).catch(() => {});
  }, [userId]);

  useEffect(() => {
    const onStatus = (data: unknown) => {
      const { userId: uid, isOnline: online } = data as { userId: string; isOnline: boolean };
      if (uid === userId) setIsOnline(online);
    };
    socketService.on("user-status-changed", onStatus);
    return () => socketService.off("user-status-changed", onStatus);
  }, [userId]);

  useEffect(() => {
    const onTyping = (data: unknown) => {
      const { senderId, isTyping: t } = data as { senderId: string; isTyping: boolean };
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

  // Build and send one message (text, OR one file, OR text+one file)
  const sendSingle = useCallback(
    async (text: string, file: File | null, isVoice = false) => {
      if (!me) return;

      const myPublicKey = await getStoredPublicKey();
      const recipientKeyRes = await api.keys.get(userId).catch(() => null);
      const privateKey = await getStoredPrivateKey();

      const fd = new FormData();

      // ── Text encryption ───────────────────────────────────────────────
      const jsonData: Record<string, unknown> = {
        sender: me._id,
        receiver: userId,
        contentType: file
          ? guessFileType(file.type)
          : "text",
      };

      if (text) {
        if (myPublicKey && recipientKeyRes?.publicKey) {
          const enc = await encryptText(text, recipientKeyRes.publicKey, myPublicKey);
          jsonData.ciphertext = enc.ciphertext;
          jsonData.encryptedKey = enc.encryptedKey;
          jsonData.senderEncryptedKey = enc.senderEncryptedKey;
        } else {
          jsonData.ciphertext = text;
          jsonData.encryptedKey = "";
          jsonData.senderEncryptedKey = "";
        }
      }

      // ── File encryption ───────────────────────────────────────────────
      if (file) {
        const buf = await file.arrayBuffer();
        const fType = guessFileType(file.type);

        if (myPublicKey && recipientKeyRes?.publicKey) {
          const enc = await encryptFile(buf, recipientKeyRes.publicKey, myPublicKey);
          const encBlob = new Blob([enc.encryptedBuffer]);
          fd.append("files", encBlob, file.name);
          fd.append("mediaEncryptedKey", enc.encryptedKey);
          fd.append("mediaSenderEncryptedKey", enc.senderEncryptedKey);
          fd.append("encryptionIV", enc.encryptionIV);
        } else {
          fd.append("files", file, file.name);
          fd.append("mediaEncryptedKey", "");
          fd.append("mediaSenderEncryptedKey", "");
          fd.append("encryptionIV", "");
        }

        fd.append("mediaType", fType);
        fd.append("originalName", file.name);
        if (isVoice) fd.append("isVoiceMessage", "true");
      }

      fd.append("data", JSON.stringify(jsonData));

      const message = await api.messages.send(fd);

      // Decrypt sender's copy for immediate display
      let plaintext = text || undefined;
      if (message.ciphertext && privateKey && message.senderEncryptedKey) {
        try {
          plaintext = await decryptText(message.ciphertext, message.senderEncryptedKey, privateKey);
        } catch {}
      }

      setMessages((prev: Message[]) => {
        if (prev.find((m) => m._id === message._id)) return prev;
        return [...prev, { ...message, plaintext }];
      });
    },
    [me, userId, setMessages]
  );

  // Handle send from MessageInput (text + multiple files become multiple messages)
  const handleSend = useCallback(
    async (text: string, files: File[]) => {
      if (!files.length) {
        if (text) await sendSingle(text, null);
        return;
      }
      // Send text with first file, remaining files as separate messages
      for (let i = 0; i < files.length; i++) {
        await sendSingle(i === 0 ? text : "", files[i]);
      }
    },
    [sendSingle]
  );

  // Voice note send
  const handleVoiceNote = useCallback(
    async (blob: Blob, durationSec: number) => {
      const mime = blob.type || bestAudioMime();
      const ext = mimeToExt(mime);
      const file = new File([blob], `voice_${Date.now()}${ext}`, { type: mime });
      void durationSec; // could be stored as metadata
      await sendSingle("", file, true);
    },
    [sendSingle]
  );

  const handleTyping = useCallback(
    (t: boolean) => {
      if (!me) return;
      if (t) socketService.emit("start-typing", { senderId: me._id, receiverId: userId });
      else socketService.emit("stop-typing", { senderId: me._id, receiverId: userId });
    },
    [me, userId]
  );

  const initiateCall = (type: "audio" | "video") => {
    startCall(userId, recipient?.fullName || "Unknown", type);
  };

  if (!me) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <Link href="/chat" className="md:hidden p-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <Avatar
          src={recipient?.profilePic}
          name={recipient?.fullName || "…"}
          size={40}
          isOnline={isOnline}
        />
        <div className="flex-1">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">
            {recipient?.fullName || "…"}
          </p>
          <p className="text-xs text-gray-500">
            {isTyping ? "typing…" : isOnline ? "Online" : "Offline"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => initiateCall("audio")}
            className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Voice call"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => initiateCall("video")}
            className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Video call"
          >
            <Video size={18} />
          </button>
          <button className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Info size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {hasMore && (
          <div className="text-center mb-4">
            <button
              onClick={loadMore}
              disabled={loading}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg._id} message={msg} isMine={msg.sender === me._id} />
        ))}

        {isTyping && (
          <div className="flex justify-start mb-1">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onVoiceNote={handleVoiceNote}
        onTyping={handleTyping}
        placeholder={`Message ${recipient?.fullName || "…"}`}
      />
    </div>
  );
}
