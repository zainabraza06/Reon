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
      // API resolves the correct key into `encryptedKey` for both sender and receiver.
      // `senderEncryptedKey` is only present on raw DB payloads — use it when available,
      // fall back to `encryptedKey` (which already holds the correct key for the caller).
      const key = msg.sender === myId
        ? (msg.senderEncryptedKey ?? msg.encryptedKey)
        : msg.encryptedKey;
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
    console.log("[useMessages] loadMessages called:", { chatUserId, myId, before });
    setLoading(true);
    try {
      const { messages: raw, hasMore: rawHasMore } = await api.messages.get(chatUserId, { before });
      console.log("[useMessages] Loaded ", raw.length, " messages from API, hasMore:", rawHasMore);
      const decrypted = await Promise.all(raw.map(decryptMsg));
      console.log("[useMessages] Decrypted all messages");
      setMessages((prev) => {
        const newMessages = before ? [...decrypted, ...prev] : decrypted;
        console.log("[useMessages] Messages state after load:", newMessages.length);
        return newMessages;
      });
      setHasMore(rawHasMore);
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
      const senderStr = String(msg.sender);
      const receiverStr = String(msg.receiver);
      const chatUserIdStr = String(chatUserId);
      const myIdStr = String(myId);
      
      console.log("[useMessages] handleNew received:", { 
        msgId: msg._id, 
        sender: senderStr, 
        receiver: receiverStr, 
        chatUserId: chatUserIdStr, 
        myId: myIdStr,
        matches: {
          fromOther: senderStr === chatUserIdStr && receiverStr === myIdStr,
          fromMe: senderStr === myIdStr && receiverStr === chatUserIdStr
        }
      });
      
      if (
        (senderStr === chatUserIdStr && receiverStr === myIdStr) ||
        (senderStr === myIdStr && receiverStr === chatUserIdStr)
      ) {
        console.log("[useMessages] Message matches, decrypting...");
        const decrypted = await decryptMsg(msg);
        console.log("[useMessages] Decrypted message:", { 
          id: decrypted._id, 
          plaintext: decrypted.plaintext?.substring(0, 50),
          hasPlaintext: !!decrypted.plaintext
        });
        
        setMessages((prev) => {
          const isDuplicate = prev.find((m) => m._id === decrypted._id);
          console.log("[useMessages] Message state update:", {
            currentCount: prev.length,
            isDuplicate,
            newMessage: decrypted._id
          });
          if (isDuplicate) {
            console.log("[useMessages] Skipping duplicate");
            return prev;
          }
          console.log("[useMessages] Adding message, new count will be:", prev.length + 1);
          return [...prev, decrypted];
        });
        
        if (String(msg.sender) !== String(myId)) {
          console.log("[useMessages] Receiver - marking as read");
          api.messages.markRead(chatUserId).catch(() => {});
          socketService.emit("message-read", { messageId: msg._id, senderId: msg.sender });
        }
      } else {
        console.log("[useMessages] Message doesn't match chat context, ignoring");
      }
    };

    // Server confirms our sent message — just update status, never remove other messages
    const handleSent = (data: unknown) => {
      const msg = data as Message;
      const isSender = String(msg.sender) === String(myId);
      console.log("[useMessages] handleSent received:", { msgId: msg._id, status: msg.status, isSender });
      if (!isSender) {
        console.log("[useMessages] handleSent - ignoring, not our message");
        return;
      }
      console.log("[useMessages] handleSent - updating status to:", msg.status);
      setMessages((prev) =>
        prev.map((m) => m._id === msg._id ? { ...m, status: msg.status ?? m.status ?? "sent" } : m)
      );
    };

    // Delivery receipt for one message
    const handleDelivered = (data: unknown) => {
      const { messageId } = data as { messageId: string };
      console.log("[useMessages] handleDelivered:", { messageId });
      setMessages((prev) =>
        prev.map((m) => m._id === messageId ? { ...m, status: "delivered" as const, delivered: true } : m)
      );
    };

    // Batch delivery receipts
    const handleDeliveredBatch = (data: unknown) => {
      const { messages: batch } = data as { messages: { messageId: string }[] };
      console.log("[useMessages] handleDeliveredBatch:", { count: batch?.length });
      if (!batch?.length) return;
      const ids = new Set(batch.map((b) => b.messageId));
      setMessages((prev) =>
        prev.map((m) => ids.has(m._id) ? { ...m, status: "delivered" as const, delivered: true } : m)
      );
    };

    // Read receipt — supports both single messageId and batch messageIds
    const handleRead = (data: unknown) => {
      const payload = data as { messageId?: string; messageIds?: string[] };
      const ids = new Set(payload.messageIds ?? (payload.messageId ? [payload.messageId] : []));
      if (ids.size === 0) return;
      console.log("[useMessages] handleRead:", { count: ids.size });
      setMessages((prev) =>
        prev.map((m) => ids.has(m._id) ? { ...m, status: "read" as const, read: true } : m)
      );
    };

    console.log("[useMessages] Attaching socket listeners for chat:", { chatUserId, myId });
    socketService.on("new-message", handleNew);
    socketService.on("message-sent", handleSent);
    socketService.on("message-delivered", handleDelivered);
    socketService.on("messages-delivered-batch", handleDeliveredBatch);
    socketService.on("message-read", handleRead);

    return () => {
      console.log("[useMessages] Cleaning up socket listeners for chat:", { chatUserId, myId });
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
