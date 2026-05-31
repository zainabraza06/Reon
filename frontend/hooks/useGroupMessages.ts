import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { decryptGroupText, getStoredPrivateKey } from "@/lib/crypto";
import type { GroupMessage } from "@/types";

export function useGroupMessages(groupId: string | null, myId: string | null) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const privateKeyRef = useRef<CryptoKey | null>(null);

  useEffect(() => {
    getStoredPrivateKey().then((k) => { privateKeyRef.current = k; });
  }, []);

  const decryptMsg = useCallback(async (msg: GroupMessage): Promise<GroupMessage> => {
    if (!privateKeyRef.current || !msg.ciphertext || !msg.encryptedKey) return msg;
    try {
      const plaintext = await decryptGroupText(msg.ciphertext, msg.encryptedKey, privateKeyRef.current);
      return { ...msg, plaintext };
    } catch {
      return { ...msg, plaintext: "[decryption failed]" };
    }
  }, []);

  const load = useCallback(async (before?: string) => {
    if (!groupId) return;
    setLoading(true);
    try {
      const { messages: raw, hasMore: more } = await api.groups.getMessages(groupId, { limit: 50, before });
      const decrypted = await Promise.all(raw.map(decryptMsg));
      setMessages((prev) => before ? [...decrypted, ...prev] : decrypted);
      setHasMore(more);
    } catch (err) {
      console.error("loadGroupMessages error:", err);
    } finally {
      setLoading(false);
    }
  }, [groupId, decryptMsg]);

  useEffect(() => {
    if (!groupId) return;
    setMessages([]);
    setHasMore(true);
    load();
    api.groups.markRead(groupId).catch(() => {});
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!groupId || !myId) return;

    const handleNew = async (data: unknown) => {
      const { message, groupId: gid } = data as { message: GroupMessage; groupId: string };
      if (gid !== groupId) return;
      const decrypted = await decryptMsg(message);
      setMessages((prev) => {
        if (prev.find((m) => m._id === decrypted._id)) return prev;
        return [...prev, decrypted];
      });
      api.groups.markRead(groupId).catch(() => {});
    };

    socketService.on("new-group-message", handleNew);
    return () => socketService.off("new-group-message", handleNew);
  }, [groupId, myId, decryptMsg]);

  const loadMore = () => {
    if (!hasMore || loading || messages.length === 0) return;
    load(messages[0].sentAt);
  };

  return { messages, loading, hasMore, loadMore, setMessages };
}
