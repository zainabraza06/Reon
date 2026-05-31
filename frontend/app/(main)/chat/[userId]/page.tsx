"use client";
import { use, useState, useEffect, useRef } from "react";
import { Phone, Video, Info, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/context/AuthContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import { encryptText, encryptFile, getStoredPublicKey, getStoredPrivateKey } from "@/lib/crypto";
import type { User } from "@/types";

export default function DMPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { user: me } = useAuth();
  const { messages, loading, hasMore, loadMore, setMessages } = useMessages(userId, me?._id ?? null);
  const [recipient, setRecipient] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fetch recipient info
    api.friends.list().then(({ friends }) => {
      const found = friends.find((f) => f._id === userId);
      if (found) setRecipient(found);
    }).catch(() => {});

    // Mark as read
    api.messages.markRead(userId).catch(() => {});
  }, [userId]);

  // Track online status
  useEffect(() => {
    const onStatus = (data: unknown) => {
      const { userId: uid, isOnline: online } = data as { userId: string; isOnline: boolean };
      if (uid === userId) setIsOnline(online);
    };
    socketService.on("user-status-changed", onStatus);
    return () => socketService.off("user-status-changed", onStatus);
  }, [userId]);

  // Typing indicator
  useEffect(() => {
    const onTyping = (data: unknown) => {
      const { senderId, isTyping: t } = data as { senderId: string; isTyping: boolean };
      if (senderId === userId) {
        setIsTyping(t);
        if (t) {
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setIsTyping(false), 4000);
        }
      }
    };
    socketService.on("user-typing", onTyping);
    return () => socketService.off("user-typing", onTyping);
  }, [userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string, files: File[]) => {
    if (!me) return;

    const myPublicKey = await getStoredPublicKey();
    const recipientKeyRes = await api.keys.get(userId).catch(() => null);

    const fd = new FormData();

    let msgData: Record<string, unknown> = {
      sender: me._id,
      receiver: userId,
      contentType: files.length > 0 ? (files[0].type.startsWith("image/") ? "image" : files[0].type.startsWith("video/") ? "video" : files[0].type.startsWith("audio/") ? "audio" : "document") : "text",
    };

    if (text && myPublicKey && recipientKeyRes?.publicKey) {
      const encrypted = await encryptText(text, recipientKeyRes.publicKey, myPublicKey);
      msgData = { ...msgData, ...encrypted };
    } else if (text) {
      // No encryption keys available — send as plaintext fallback (should not happen in prod)
      msgData.ciphertext = text;
      msgData.encryptedKey = "";
      msgData.senderEncryptedKey = "";
    }

    const mediaKeys: unknown[] = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      if (myPublicKey && recipientKeyRes?.publicKey) {
        const enc = await encryptFile(buf, recipientKeyRes.publicKey, myPublicKey);
        const encBlob = new Blob([enc.encryptedBuffer]);
        fd.append("files", encBlob, file.name);
        mediaKeys.push({
          encryptedKey: enc.encryptedKey,
          senderEncryptedKey: enc.senderEncryptedKey,
          encryptionIV: enc.encryptionIV,
        });
      } else {
        fd.append("files", file, file.name);
        mediaKeys.push({});
      }
    }

    msgData.mediaKeys = mediaKeys;
    fd.append("data", JSON.stringify(msgData));

    const { message } = await api.messages.send(fd) as { message: import("@/types").Message };

    // Decrypt and add to UI
    const privateKey = await getStoredPrivateKey();
    let plaintext = text;
    if (message.ciphertext && privateKey && message.senderEncryptedKey) {
      try {
        const { decryptText: dec } = await import("@/lib/crypto");
        plaintext = await dec(message.ciphertext, message.senderEncryptedKey, privateKey);
      } catch {}
    }
    setMessages((prev) => {
      if (prev.find((m) => m._id === message._id)) return prev;
      return [...prev, { ...message, plaintext: plaintext || text }];
    });

    socketService.emit("stop-typing", { senderId: me._id, receiverId: userId });
  };

  const handleTyping = (t: boolean) => {
    if (!me) return;
    if (t) socketService.emit("start-typing", { senderId: me._id, receiverId: userId });
    else socketService.emit("stop-typing", { senderId: me._id, receiverId: userId });
  };

  if (!me) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <Link href="/chat" className="md:hidden p-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <Avatar src={recipient?.profilePic} name={recipient?.fullName || "…"} size={40} isOnline={isOnline} />
        <div className="flex-1">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">{recipient?.fullName || "…"}</p>
          <p className="text-xs text-gray-500">
            {isTyping ? "typing…" : isOnline ? "Online" : "Offline"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Phone size={18} />
          </button>
          <button className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
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

      {/* Input */}
      <MessageInput
        onSend={sendMessage}
        onTyping={handleTyping}
        placeholder={`Message ${recipient?.fullName || "…"}`}
      />
    </div>
  );
}
