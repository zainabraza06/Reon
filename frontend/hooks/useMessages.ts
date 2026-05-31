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

    const handleDelivered = (data: unknown) => {
      const { messageId } = data as { messageId: string };
      setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, status: "delivered", delivered: true } : m));
    };

    const handleRead = (data: unknown) => {
      const { messageId } = data as { messageId: string };
      setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, status: "read", read: true } : m));
    };

    socketService.on("new-message", handleNew);
    socketService.on("message-delivered", handleDelivered);
    socketService.on("message-read", handleRead);

    return () => {
      socketService.off("new-message", handleNew);
      socketService.off("message-delivered", handleDelivered);
      socketService.off("message-read", handleRead);
    };
  }, [chatUserId, myId, decryptMsg]);

  const loadMore = () => {
    if (!hasMore || loading || messages.length === 0) return;
    loadMessages(messages[0].sentAt);
  };

  return { messages, loading, hasMore, loadMore, setMessages };
}
