"use client";
import { use, useState, useEffect, useRef } from "react";
import { ArrowLeft, Info, Users, Check, CheckCheck } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import MessageInput from "@/components/chat/MessageInput";
import { useGroupMessages } from "@/hooks/useGroupMessages";
import { useAuth } from "@/context/AuthContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import { encryptGroupText, encryptFile, getStoredPublicKey, getStoredPrivateKey } from "@/lib/crypto";
import type { GroupChat, GroupMessage } from "@/types";

function GroupTick({ senderId, readBy, deliveredTo, memberCount }: {
  senderId: string; readBy?: string[]; deliveredTo?: string[]; memberCount: number;
}) {
  const otherDelivered = (deliveredTo ?? []).filter((id) => id !== senderId).length;
  const otherRead      = (readBy     ?? []).filter((id) => id !== senderId).length;
  const allRead        = memberCount > 0 && otherRead >= memberCount;
  const anyDelivered   = otherDelivered > 0;

  if (allRead)      return <CheckCheck size={13} className="text-cyan-300" />;
  if (anyDelivered) return <CheckCheck size={13} className="text-white/60" />;
  return               <Check     size={13} className="text-white/45" />;
}

function GroupMessageBubble({ message, isMine, memberCount }: {
  message: GroupMessage; isMine: boolean; memberCount: number;
}) {
  const time       = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text       = message.plaintext || message.ciphertext;
  const senderName = typeof message.sender === "object" ? message.sender.fullName : "";
  const senderId   = typeof message.sender === "object" ? message.sender._id : message.sender;

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} mb-1`}>
      {!isMine && (
        <div className="flex items-center gap-2 mb-0.5 ml-2">
          <Avatar src={typeof message.sender === "object" ? message.sender.profilePic : ""} name={senderName} size={20} />
          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">{senderName}</span>
        </div>
      )}
      <div className={`relative max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
        isMine
          ? "bubble-gradient text-white rounded-br-[4px] shadow-violet-500/20"
          : "bg-white dark:bg-[#1a1a3a] text-gray-900 dark:text-gray-100 rounded-bl-[4px]"
      }`}>
        {text && <p className="text-sm whitespace-pre-wrap break-words leading-[1.5]">{text}</p>}
        {message.media && message.media.length > 0 && (
          <p className="text-xs italic opacity-70">[{message.media[0].type} attachment]</p>
        )}
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMine ? "text-white/55" : "text-gray-400"}`}>
          <span className="text-[11px]">{time}</span>
          {isMine && (
            <GroupTick
              senderId={senderId}
              readBy={message.readBy}
              deliveredTo={message.deliveredTo}
              memberCount={memberCount}
            />
          )}
        </div>
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
    api.groups.get(groupId).then(({ group: g }) => setGroup(g)).catch(() => {});
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
    else   socketService.emit("group-typing-stop", { groupId });
  };

  if (!me) return null;

  return (
    <div className="flex flex-col h-full bg-[#eef2ff] dark:bg-[#080816]">
      {/* Header */}
      <div className="chat-header flex items-center gap-3 px-4 py-2.5 shrink-0 shadow-sm">
        <Link href="/chat" className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-white/6 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <Avatar src={group?.avatar} name={group?.name || "…"} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{group?.name || "…"}</p>
          <p className="text-xs text-gray-400">{group?.members.length ?? 0} members</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className={`p-2 rounded-xl transition-colors ${showInfo ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" : "text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"}`}
        >
          <Info size={18} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-1 chat-bg">
            {hasMore && (
              <div className="text-center mb-3">
                <button type="button" onClick={loadMore} disabled={loading} title="Load earlier messages"
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline bg-white dark:bg-[#1a1a3a] px-3 py-1.5 rounded-full shadow-sm disabled:opacity-50 transition-colors">
                  {loading ? "Loading…" : "Load earlier"}
                </button>
              </div>
            )}

            {messages.map((msg) => (
              <GroupMessageBubble
                key={msg._id}
                message={msg}
                isMine={typeof msg.sender === "object" ? msg.sender._id === me._id : msg.sender === me._id}
                memberCount={(group?.members.length ?? 1) - 1}
              />
            ))}

            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-1 pl-1">
                <div className="bg-white dark:bg-[#1a1a3a] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
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

        {/* Info panel — full-screen overlay on mobile, side panel on desktop */}
        {showInfo && group && (
          <div
            className="fixed inset-0 z-30 md:static md:z-auto md:inset-auto md:w-64 border-l border-gray-200 dark:border-white/6 bg-white dark:bg-[#0f0f28] flex flex-col overflow-hidden shadow-xl md:shadow-none"
            onClick={(e) => { if (e.target === e.currentTarget) setShowInfo(false); }}
          >
            <div className="px-4 py-4 border-b border-gray-100 dark:border-white/6">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{group.name}</h3>
              {group.description && <p className="text-xs text-gray-400 mt-1">{group.description}</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{group.members.length} Members</span>
              </div>
              <ul className="space-y-2">
                {group.members.map((m) => {
                  const isAdmin   = group.admins.some((a) => a._id === m.user._id);
                  const isCreator = group.creator._id === m.user._id;
                  return (
                    <li key={m.user._id} className="flex items-center gap-2.5 py-1">
                      <Avatar src={m.user.profilePic} name={m.user.fullName} size={30} />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{m.user.fullName}</p>
                      </div>
                      {(isCreator || isAdmin) && (
                        <span className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-semibold">
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
