import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { decryptText, getStoredPrivateKey } from "@/lib/crypto";
import type { Message } from "@/types";

export function useMessages(chatUserId: string | null, myId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const privateKeyRef = useRef<CryptoKey | null>(null);

  const decryptMsg = useCallback(async (msg: Message): Promise<Message> => {
    // Call-log messages have ciphertext as JSON metadata — don't decrypt
    if (msg.contentType === "call-log") {
      try {
        const callLog = msg.ciphertext ? JSON.parse(msg.ciphertext) : null;
        return { ...msg, callLog: callLog ?? undefined };
      } catch {
        return msg;
      }
    }
    if (!privateKeyRef.current || !msg.ciphertext) return msg;
    try {
      const key = msg.sender === myId ? msg.senderEncryptedKey : msg.encryptedKey;
      if (!key) return msg;
      const plaintext = await decryptText(msg.ciphertext, key, privateKeyRef.current);
      return { ...msg, plaintext };
    } catch {
      return { ...msg, plaintext: "[decryption failed]" };
    }
  }, [myId]);

  useEffect(() => {
    getStoredPrivateKey().then((k) => { privateKeyRef.current = k; });
  }, []);

  const loadMessages = useCallback(async (before?: string) => {
    if (!chatUserId || !myId) return;
    setLoading(true);
    try {
      const { messages: raw } = await api.messages.get(chatUserId, { limit: 50, before });
      const decrypted = await Promise.all(raw.map(decryptMsg));
      setMessages((prev) => before ? [...decrypted, ...prev] : decrypted);
      setHasMore(raw.length === 50);
    } catch (err) {
      console.error("loadMessages error:", err);
    } finally {
      setLoading(false);
    }
  }, [chatUserId, myId, decryptMsg]);

  useEffect(() => {
    if (!chatUserId) return;
    setMessages([]);
    setHasMore(true);
    loadMessages();
  }, [chatUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatUserId || !myId) return;

    // New message from socket (received from other user)
    const handleNew = async (data: unknown) => {
      const msg = data as Message;
      if (
        (msg.sender === chatUserId && msg.receiver === myId) ||
        (msg.sender === myId && msg.receiver === chatUserId)
      ) {
        const decrypted = await decryptMsg(msg);
        setMessages((prev) => {
          if (prev.find((m) => m._id === decrypted._id)) return prev;
          return [...prev, decrypted];
        });
        if (msg.sender !== myId) {
          api.messages.markRead(chatUserId).catch(() => {});
          socketService.emit("message-read", { messageId: msg._id, senderId: msg.sender });
        }
      }
    };

    // Server confirms our sent message — just update status, never remove other messages
    const handleSent = (data: unknown) => {
      const msg = data as Message;
      if (msg.sender !== myId) return;
      setMessages((prev) =>
        prev.map((m) => m._id === msg._id ? { ...m, status: msg.status ?? m.status ?? "sent" } : m)
      );
    };

    // Delivery receipt for one message
    const handleDelivered = (data: unknown) => {
      const { messageId } = data as { messageId: string };
      setMessages((prev) =>
        prev.map((m) => m._id === messageId ? { ...m, status: "delivered" as const, delivered: true } : m)
      );
    };

    // Batch delivery receipts
    const handleDeliveredBatch = (data: unknown) => {
      const { messages: batch } = data as { messages: { messageId: string }[] };
      if (!batch?.length) return;
      const ids = new Set(batch.map((b) => b.messageId));
      setMessages((prev) =>
        prev.map((m) => ids.has(m._id) ? { ...m, status: "delivered" as const, delivered: true } : m)
      );
    };

    // Read receipt — mark all MY messages up to and including this one as read
    const handleRead = (data: unknown) => {
      const { messageId } = data as { messageId: string };
      setMessages((prev) => {
        const target = prev.find((m) => m._id === messageId);
        const cutoff = target ? new Date(target.sentAt).getTime() : 0;
        return prev.map((m) =>
          m.sender === myId && new Date(m.sentAt).getTime() <= cutoff
            ? { ...m, status: "read" as const, read: true }
            : m
        );
      });
    };

    socketService.on("new-message", handleNew);
    socketService.on("message-sent", handleSent);
    socketService.on("message-delivered", handleDelivered);
    socketService.on("messages-delivered-batch", handleDeliveredBatch);
    socketService.on("message-read", handleRead);

    return () => {
      socketService.off("new-message", handleNew);
      socketService.off("message-sent", handleSent);
      socketService.off("message-delivered", handleDelivered);
      socketService.off("messages-delivered-batch", handleDeliveredBatch);
      socketService.off("message-read", handleRead);
    };
  }, [chatUserId, myId, decryptMsg]);

  const loadMore = () => {
    if (!hasMore || loading || messages.length === 0) return;
    loadMessages(messages[0].sentAt);
  };

  return { messages, loading, hasMore, loadMore, setMessages };
}
