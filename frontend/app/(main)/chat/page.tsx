"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Plus, Search, Users } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import type { ChatListItem, GroupChat } from "@/types";

function formatTime(d?: string) {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatLandingPage() {
  const [tab, setTab] = useState<"dms" | "groups">("dms");
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.messages.sidebar().then(({ chats }) => setChats(chats)).catch(() => {}),
      api.groups.list().then(({ groups }) => setGroups(groups)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onStatus = (data: unknown) => {
      const { userId, isOnline } = data as { userId: string; isOnline: boolean };
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId); else next.delete(userId);
        return next;
      });
    };
    const onNewMsg = (data: unknown) => {
      const msg = data as { sender: string; sentAt: string };
      setChats((prev) =>
        prev.map((c) => c._id === msg.sender
          ? { ...c, lastMessage: { ...c.lastMessage, sentAt: msg.sentAt }, unreadCount: (c.unreadCount || 0) + 1 }
          : c
        )
      );
    };
    const onNewGroupMsg = (data: unknown) => {
      const { groupId, message } = data as { groupId: string; message: { sentAt: string } };
      setGroups((prev) => prev.map((g) => g._id === groupId
        ? { ...g, lastMessage: { ...g.lastMessage, sentAt: message.sentAt, content: "[new message]" } as GroupChat["lastMessage"] }
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
  const filteredChats  = chats.filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q));
  const filteredGroups = groups.filter((g) => !q || g.name.toLowerCase().includes(q));

  return (
    <>
      {/* ── Mobile: full chat list ─────────────────────────────────────────── */}
      <div className="flex flex-col h-full md:hidden bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Messages</h1>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 mb-3">
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none flex-1"
            />
          </div>
          <div className="flex gap-2">
            {(["dms", "groups"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {t === "dms" ? <><MessageSquare size={13} className="inline mr-1" />Chats</> : <><Users size={13} className="inline mr-1" />Groups</>}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : tab === "dms" ? (
            filteredChats.length === 0 ? (
              <EmptyState type="chats" />
            ) : (
              <ul className="px-2 py-1">
                {filteredChats.map((chat) => (
                  <li key={chat._id}>
                    <Link href={`/chat/${chat._id}`} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:bg-gray-100 dark:active:bg-gray-700">
                      <Avatar src={chat.profilePic} name={chat.fullName} size={46} isOnline={onlineUsers.has(chat._id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{chat.fullName}</p>
                          <span className="text-[11px] text-gray-400 shrink-0">{formatTime(chat.lastMessage?.sentAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className="text-xs text-gray-500 truncate">
                            {chat.lastMessage?.contentType && chat.lastMessage.contentType !== "text"
                              ? `[${chat.lastMessage.contentType}]`
                              : !chat.lastMessage ? "No messages yet" : ""}
                          </p>
                          {(chat.unreadCount || 0) > 0 && (
                            <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
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
            filteredGroups.length === 0 ? (
              <EmptyState type="groups" />
            ) : (
              <ul className="px-2 py-1">
                {filteredGroups.map((g) => (
                  <li key={g._id}>
                    <Link href={`/group/${g._id}`} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Avatar src={g.avatar} name={g.name} size={46} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{g.name}</p>
                          <span className="text-[11px] text-gray-400 shrink-0">{formatTime(g.lastMessage?.sentAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500">{g.members.length} members</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>

      {/* ── Desktop: placeholder ──────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-white dark:bg-gray-900 gap-4">
        <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <MessageSquare size={28} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your messages</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a conversation to start messaging</p>
        </div>
      </div>
    </>
  );
}

function EmptyState({ type }: { type: "chats" | "groups" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
        {type === "chats" ? <MessageSquare size={24} className="text-gray-400" /> : <Users size={24} className="text-gray-400" />}
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
