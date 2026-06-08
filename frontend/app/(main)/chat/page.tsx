"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { MessageSquare, Search, Users, Plus } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import CreateGroupModal from "@/components/chat/CreateGroupModal";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import { decryptText, getStoredPrivateKey } from "@/lib/crypto";
import type { ChatListItem, GroupChat } from "@/types";

function groupMsgPreview(g: GroupChat, myUserId?: string): string {
  const lm = g.lastMessage;
  if (!lm) return "No messages yet";

  const { content, sender, contentType } = lm;

  let text: string;
  if (contentType === "system") return content || "";
  else if (contentType === "image")    text = "📷 Photo";
  else if (contentType === "video")    text = "🎬 Video";
  else if (contentType === "audio")    text = "🎤 Voice note";
  else if (contentType === "document") text = "📎 Document";
  else {
    if (!content || content === "[encrypted]") return "Message";
    if (content === "[image]")    return "📷 Photo";
    if (content === "[video]")    return "🎬 Video";
    if (content === "[audio]")    return "🎤 Voice note";
    if (content === "[document]") return "📎 Document";
    if (content.startsWith("["))  return "Message";
    // readable system-message text
    return content;
  }

  // prefix for media
  const senderId = typeof sender === "object" ? (sender as import("@/types").User)._id : sender as string;
  const prefix = senderId === myUserId
    ? "You: "
    : (lm.senderName
        ? `${lm.senderName.split(" ")[0]}: `
        : (typeof sender === "object" ? `${(sender as import("@/types").User).fullName.split(" ")[0]}: ` : ""));
  return prefix + text;
}

function formatTime(d?: string) {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatLandingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"dms" | "groups">("dms");
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const privateKeyRef = useRef<CryptoKey | null>(null);

  const decryptChatList = async (list: ChatListItem[], key: CryptoKey | null) => {
    if (!key) return list;
    return Promise.all(
      list.map(async (chat) => {
        if (!chat.lastMessage?.ciphertext || chat.lastMessage.contentType !== "text") return chat;
        try {
          const content = await decryptText(chat.lastMessage.ciphertext, chat.lastMessage.encryptedKey || "", key);
          return { ...chat, lastMessage: { ...chat.lastMessage, content } };
        } catch {
          return chat;
        }
      })
    );
  };

  useEffect(() => {
    (async () => {
      const key = await getStoredPrivateKey();
      privateKeyRef.current = key;
      const [{ chats: c }, { groups: g }] = await Promise.all([
        api.messages.sidebar().catch(() => ({ chats: [] as ChatListItem[] })),
        api.groups.list().catch(() => ({ groups: [] as GroupChat[] })),
      ]);
      const decrypted = await decryptChatList(c ?? [], key);
      setChats(decrypted);
      setGroups(g ?? []);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onStatus = (data: unknown) => {
      const { userId, isOnline } = data as { userId: string; isOnline: boolean };
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId); else next.delete(userId);
        return next;
      });
    };
    const onNewMsg = async (data: unknown) => {
      const msg = data as import("@/types").Message;
      let content: string | undefined;
      if (msg.contentType === "text" && msg.ciphertext && privateKeyRef.current) {
        try { content = await decryptText(msg.ciphertext, msg.encryptedKey || "", privateKeyRef.current); } catch {}
      }
      const otherParticipantId = String(msg.sender) === String(user?._id) ? String(msg.receiver) : String(msg.sender);
      const isMine = String(msg.sender) === String(user?._id);
      setChats((prev) => prev.map((c) => c._id === otherParticipantId
        ? {
            ...c,
            lastMessage: {
              ...c.lastMessage,
              sentAt: msg.sentAt,
              contentType: msg.contentType,
              ciphertext: msg.ciphertext || "",
              sender: String(msg.sender),
              encryptedKey: msg.encryptedKey || "",
              content,
            },
            unreadCount: isMine ? c.unreadCount : (c.unreadCount || 0) + 1,
          }
        : c
      ));
    };
    const onNewGroupMsg = (data: unknown) => {
      const { message, groupId } = data as { message: import("@/types").GroupMessage; groupId: string };
      const sender = message.sender as import("@/types").User;
      let content: string;
      if (message.contentType === "system")        content = message.ciphertext || "";
      else if (message.contentType === "image")    content = "[image]";
      else if (message.contentType === "video")    content = "[video]";
      else if (message.contentType === "audio")    content = "[audio]";
      else if (message.contentType === "document") content = "[document]";
      else                                          content = "[encrypted]";
      setGroups((prev) => prev.map((g) => g._id === groupId
        ? { ...g, lastMessage: { content, sender, sentAt: message.sentAt, contentType: message.contentType, senderName: sender?.fullName } }
        : g
      ));
    };
    const onGroupAdded = (data: unknown) => {
      const { group } = data as { group: GroupChat };
      setGroups((prev) => prev.some((g) => g._id === group._id) ? prev : [group, ...prev]);
    };
    socketService.on("user-status-changed", onStatus);
    socketService.on("new-message", onNewMsg);
    socketService.on("new-group-message", onNewGroupMsg);
    socketService.on("group-added", onGroupAdded);
    return () => {
      socketService.off("user-status-changed", onStatus);
      socketService.off("new-message", onNewMsg);
      socketService.off("new-group-message", onNewGroupMsg);
      socketService.off("group-added", onGroupAdded);
    };
  }, []);

  const q = search.toLowerCase();
  const filteredChats  = (chats ?? []).filter((c)  => !q || c.fullName.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q));
  const filteredGroups = (groups ?? []).filter((g) => !q || g.name.toLowerCase().includes(q));

  return (
    <>
      {/* ── Mobile: full chat list ─────────────────────────── */}
      <div className="flex flex-col h-full md:hidden bg-[#f8f7ff] dark:bg-[#0c0c1e]">
        {/* Header */}
        <div className="px-4 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xl font-black brand-gradient tracking-tight select-none">Reon</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/6 rounded-xl px-3 py-2 mb-3">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none flex-1"
            />
          </div>
          <div className="flex gap-1.5">
            {(["dms", "groups"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  t === tab
                    ? "btn-gradient text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/6"
                }`}
              >
                {t === "dms"
                  ? <><MessageSquare size={12} className="inline mr-1" />Chats</>
                  : <><Users size={12} className="inline mr-1" />Groups</>}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : tab === "dms" ? (
            filteredChats.length === 0 ? <EmptyState type="chats" /> : (
              <ul className="px-2 py-1">
                {filteredChats.map((chat) => (
                  <li key={chat._id}>
                    <Link href={`/chat/${chat._id}`}
                      className="flex items-center gap-3 mx-1 px-3 py-3 rounded-xl hover:bg-white dark:hover:bg-white/4 transition-colors active:bg-gray-100 dark:active:bg-white/6">
                      <Avatar src={chat.profilePic} name={chat.fullName} size={46} isOnline={onlineUsers.has(chat._id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{chat.fullName}</p>
                          <span className="text-[11px] text-gray-400 shrink-0">{formatTime(chat.lastMessage?.sentAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {chat.lastMessage ? (
                              <>
                                {chat.lastMessage.sender === user?._id && "You: "}
                                {chat.lastMessage.contentType && chat.lastMessage.contentType !== "text"
                                  ? `📎 ${chat.lastMessage.contentType}`
                                  : chat.lastMessage.content || "Message"}
                              </>
                            ) : "No messages yet"}
                          </p>
                          {(chat.unreadCount || 0) > 0 && (
                            <span className="btn-gradient text-white text-[10px] font-bold rounded-full min-w-4.5 h-4.5 flex items-center justify-center px-1 shrink-0">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <div className="px-3 pt-3 pb-1">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold shadow-md shadow-violet-500/25"
                >
                  <Plus size={15} />
                  New Group
                </button>
              </div>
              {filteredGroups.length === 0 ? <EmptyState type="groups" /> : (
                <ul className="px-2 py-1">
                  {filteredGroups.map((g) => (
                    <li key={g._id}>
                      <Link href={`/group/${g._id}`}
                        className="flex items-center gap-3 mx-1 px-3 py-3 rounded-xl hover:bg-white dark:hover:bg-white/4 transition-colors">
                        <Avatar src={g.avatar} name={g.name} size={46} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{g.name}</p>
                            <span className="text-[11px] text-gray-400 shrink-0">{formatTime(g.lastMessage?.sentAt)}</span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{groupMsgPreview(g, user?._id)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Desktop: select-chat placeholder ──────────────── */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#f8f7ff] dark:bg-[#0c0c1e] gap-4">
        <div className="w-16 h-16 rounded-2xl btn-gradient flex items-center justify-center shadow-lg shadow-violet-600/25">
          <MessageSquare size={28} className="text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your messages</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a conversation to start messaging</p>
        </div>
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={() => {
            api.groups.list().then(({ groups: g }) => setGroups(g ?? [])).catch(() => {});
            setShowCreateGroup(false);
          }}
        />
      )}
    </>
  );
}

function EmptyState({ type }: { type: "chats" | "groups" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center mb-3">
        {type === "chats"
          ? <MessageSquare size={24} className="text-violet-500" />
          : <Users size={24} className="text-violet-500" />}
      </div>
      <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">
        {type === "chats" ? "No conversations yet" : "No groups yet"}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {type === "chats" ? "Add friends to start chatting" : "Create a group to get started"}
      </p>
    </div>
  );
}
