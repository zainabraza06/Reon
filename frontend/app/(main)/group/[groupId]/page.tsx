"use client";
import { use, useState, useEffect, useRef } from "react";
import { ArrowLeft, Info, Users } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import MessageInput from "@/components/chat/MessageInput";
import { useGroupMessages } from "@/hooks/useGroupMessages";
import { useAuth } from "@/context/AuthContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import { encryptGroupText, encryptFile, getStoredPublicKey, getStoredPrivateKey } from "@/lib/crypto";
import type { GroupChat, GroupMessage } from "@/types";

function GroupMessageBubble({ message, isMine }: { message: GroupMessage; isMine: boolean }) {
  const time = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text = message.plaintext || message.ciphertext;
  const senderName = typeof message.sender === "object" ? message.sender.fullName : "";

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} mb-1`}>
      {!isMine && (
        <div className="flex items-center gap-2 mb-0.5 ml-2">
          <Avatar src={typeof message.sender === "object" ? message.sender.profilePic : ""} name={senderName} size={20} />
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{senderName}</span>
        </div>
      )}
      <div
        className={`relative max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
          isMine
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
        }`}
      >
        {text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
        {message.media && message.media.length > 0 && (
          <p className="text-xs italic opacity-70">[{message.media[0].type} attachment]</p>
        )}
        <p className={`text-[11px] mt-0.5 ${isMine ? "text-white/60" : "text-gray-400"} text-right`}>{time}</p>
      </div>
    </div>
  );
}

export default function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user: me } = useAuth();
  const { messages, loading, hasMore, loadMore, setMessages } = useGroupMessages(groupId, me?._id ?? null);
  const [group, setGroup] = useState<GroupChat | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.groups.get(groupId).then(({ group }) => setGroup(group)).catch(() => {});
  }, [groupId]);

  useEffect(() => {
    const onTyping = (data: unknown) => {
      const { groupId: gid, userId: uid, isTyping } = data as { groupId: string; userId: string; isTyping: boolean };
      if (gid !== groupId || uid === me?._id) return;
      setTypingUsers((prev) => isTyping ? [...new Set([...prev, uid])] : prev.filter((u) => u !== uid));
    };
    const onUpdated = (data: unknown) => {
      const { group: g } = data as { group: GroupChat };
      if (g._id === groupId) setGroup(g);
    };
    socketService.on("group-user-typing", onTyping);
    socketService.on("group-updated", onUpdated);
    return () => {
      socketService.off("group-user-typing", onTyping);
      socketService.off("group-updated", onUpdated);
    };
  }, [groupId, me?._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string, files: File[]) => {
    if (!me || !group) return;

    // Gather member public keys
    const memberKeys: { userId: string; publicKey: import("@/types").User["_id"] }[] = [];
    for (const m of group.members) {
      try {
        const { publicKey } = await api.keys.get(m.user._id);
        memberKeys.push({ userId: m.user._id, publicKey: publicKey as unknown as import("@/types").User["_id"] });
      } catch {}
    }

    const fd = new FormData();
    let msgData: Record<string, unknown> = { contentType: files.length > 0 ? "document" : "text" };

    if (text && memberKeys.length > 0) {
      const enc = await encryptGroupText(text, memberKeys as unknown as { userId: string; publicKey: JsonWebKey }[]);
      msgData.ciphertext = enc.ciphertext;
      msgData.memberKeys = enc.memberKeys;
    } else if (text) {
      msgData.ciphertext = text;
      msgData.memberKeys = [];
    }

    const mediaKeys: unknown[] = [];
    for (const file of files) {
      fd.append("files", file, file.name);
      mediaKeys.push({});
    }
    msgData.mediaKeys = mediaKeys;
    fd.append("data", JSON.stringify(msgData));

    try {
      const { message } = await api.groups.sendMessage(groupId, fd) as { message: GroupMessage };
      const privateKey = await getStoredPrivateKey();
      let plaintext = text;
      if (message.ciphertext && privateKey && message.encryptedKey) {
        try {
          const { decryptGroupText } = await import("@/lib/crypto");
          plaintext = await decryptGroupText(message.ciphertext, message.encryptedKey, privateKey);
        } catch {}
      }
      setMessages((prev) => {
        if (prev.find((m) => m._id === message._id)) return prev;
        return [...prev, { ...message, plaintext: plaintext || text }];
      });
    } catch (err) {
      console.error("sendGroupMessage error:", err);
    }

    socketService.emit("group-typing-stop", { groupId });
  };

  const handleTyping = (t: boolean) => {
    if (t) socketService.emit("group-typing-start", { groupId });
    else socketService.emit("group-typing-stop", { groupId });
  };

  if (!me) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Link href="/chat" className="md:hidden p-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <Avatar src={group?.avatar} name={group?.name || "…"} size={40} />
        <div className="flex-1">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">{group?.name || "…"}</p>
          <p className="text-xs text-gray-500">{group?.members.length ?? 0} members</p>
        </div>
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Info size={18} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {hasMore && (
              <div className="text-center mb-4">
                <button onClick={loadMore} disabled={loading} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                  {loading ? "Loading…" : "Load earlier"}
                </button>
              </div>
            )}

            {messages.map((msg) => (
              <GroupMessageBubble
                key={msg._id}
                message={msg}
                isMine={typeof msg.sender === "object" ? msg.sender._id === me._id : msg.sender === me._id}
              />
            ))}

            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-1">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2.5">
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

          <MessageInput onSend={sendMessage} onTyping={handleTyping} placeholder={`Message ${group?.name || "group"}`} />
        </div>

        {/* Info panel */}
        {showInfo && group && (
          <div className="w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{group.name}</h3>
              {group.description && <p className="text-xs text-gray-500 mt-1">{group.description}</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{group.members.length} Members</span>
              </div>
              <ul className="space-y-2">
                {group.members.map((m) => {
                  const isAdmin = group.admins.some((a) => a._id === m.user._id);
                  const isCreator = group.creator._id === m.user._id;
                  return (
                    <li key={m.user._id} className="flex items-center gap-2">
                      <Avatar src={m.user.profilePic} name={m.user.fullName} size={28} />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{m.user.fullName}</p>
                      </div>
                      {(isCreator || isAdmin) && (
                        <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">
                          {isCreator ? "Creator" : "Admin"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
