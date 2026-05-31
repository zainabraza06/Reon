"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Settings, Plus, LogOut, Search } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import type { ChatListItem, GroupChat } from "@/types";

interface Props {
  onNewGroup?: () => void;
}

export default function Sidebar({ onNewGroup }: Props) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [tab, setTab] = useState<"dms" | "groups">("dms");
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.messages.sidebar().then(({ chats }) => setChats(chats)).catch(() => {});
    api.groups.list().then(({ groups }) => setGroups(groups)).catch(() => {});
    api.friends.pendingCount().then(({ count }) => setPendingCount(count)).catch(() => {});
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
    const onGroupAdded = (data: unknown) => {
      const { group } = data as { group: GroupChat };
      setGroups((prev) => {
        if (prev.find((g) => g._id === group._id)) return prev;
        return [group, ...prev];
      });
    };
    const onGroupUpdated = (data: unknown) => {
      const { group } = data as { group: GroupChat };
      setGroups((prev) => prev.map((g) => g._id === group._id ? group : g));
    };
    const onGroupDeleted = (data: unknown) => {
      const { groupId } = data as { groupId: string };
      setGroups((prev) => prev.filter((g) => g._id !== groupId));
    };
    const onGroupRemoved = (data: unknown) => {
      const { groupId } = data as { groupId: string };
      setGroups((prev) => prev.filter((g) => g._id !== groupId));
    };
    const onNewMsg = (data: unknown) => {
      const msg = data as { sender: string; sentAt: string };
      setChats((prev) =>
        prev.map((c) =>
          c._id === msg.sender
            ? { ...c, lastMessage: { sentAt: msg.sentAt }, unreadCount: (c.unreadCount || 0) + 1 }
            : c
        )
      );
    };
    const onNewGroupMsg = (data: unknown) => {
      const { message, groupId } = data as { message: { sentAt: string }; groupId: string };
      setGroups((prev) =>
        prev.map((g) =>
          g._id === groupId
            ? { ...g, lastMessage: { ...g.lastMessage, sentAt: message.sentAt, content: "[new message]" } as GroupChat["lastMessage"] }
            : g
        )
      );
    };

    socketService.on("user-status-changed", onStatus);
    socketService.on("group-added", onGroupAdded);
    socketService.on("group-updated", onGroupUpdated);
    socketService.on("group-deleted", onGroupDeleted);
    socketService.on("group-removed", onGroupRemoved);
    socketService.on("new-message", onNewMsg);
    socketService.on("new-group-message", onNewGroupMsg);

    return () => {
      socketService.off("user-status-changed", onStatus);
      socketService.off("group-added", onGroupAdded);
      socketService.off("group-updated", onGroupUpdated);
      socketService.off("group-deleted", onGroupDeleted);
      socketService.off("group-removed", onGroupRemoved);
      socketService.off("new-message", onNewMsg);
      socketService.off("new-group-message", onNewGroupMsg);
    };
  }, []);

  const filteredChats = chats.filter((c) =>
    !search || c.fullName.toLowerCase().includes(search.toLowerCase()) || c.username?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = groups.filter((g) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (d?: string) => {
    if (!d) return "";
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <aside className="flex h-full w-72 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">Reon</span>
        <div className="flex items-center gap-1">
          <Link href="/friends" className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative ${pathname === "/friends" ? "text-indigo-600" : "text-gray-500"}`}>
            <Users size={18} />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </Link>
          <Link href="/settings" className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${pathname === "/settings" ? "text-indigo-600" : "text-gray-500"}`}>
            <Settings size={18} />
          </Link>
          <button onClick={logout} className="p-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none flex-1"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-3 gap-1 mb-2">
        <button
          onClick={() => setTab("dms")}
          className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === "dms" ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          <MessageSquare size={14} className="inline mr-1" />
          Chats
        </button>
        <button
          onClick={() => setTab("groups")}
          className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === "groups" ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          <Users size={14} className="inline mr-1" />
          Groups
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tab === "dms" && (
          <ul className="space-y-0.5 px-2">
            {filteredChats.length === 0 && (
              <li className="text-center text-gray-400 text-sm py-8">No conversations yet</li>
            )}
            {filteredChats.map((chat) => {
              const active = pathname === `/chat/${chat._id}`;
              return (
                <li key={chat._id}>
                  <Link
                    href={`/chat/${chat._id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                  >
                    <Avatar src={chat.profilePic} name={chat.fullName} size={42} isOnline={onlineUsers.has(chat._id)} />
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium truncate ${active ? "text-indigo-700 dark:text-indigo-300" : "text-gray-900 dark:text-gray-100"}`}>
                          {chat.fullName}
                        </p>
                        <span className="text-[11px] text-gray-400 shrink-0 ml-1">{formatTime(chat.lastMessage?.sentAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500 truncate">
                          {chat.lastMessage?.contentType !== "text" ? `[${chat.lastMessage?.contentType}]` : ""}
                          {!chat.lastMessage && "No messages yet"}
                        </p>
                        {(chat.unreadCount || 0) > 0 && (
                          <span className="bg-indigo-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "groups" && (
          <div className="px-2">
            <button
              onClick={onNewGroup}
              className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 rounded-xl text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors font-medium"
            >
              <Plus size={16} />
              New Group
            </button>
            <ul className="space-y-0.5">
              {filteredGroups.length === 0 && (
                <li className="text-center text-gray-400 text-sm py-8">No groups yet</li>
              )}
              {filteredGroups.map((g) => {
                const active = pathname === `/group/${g._id}`;
                return (
                  <li key={g._id}>
                    <Link
                      href={`/group/${g._id}`}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                    >
                      <Avatar src={g.avatar} name={g.name} size={42} />
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium truncate ${active ? "text-indigo-700 dark:text-indigo-300" : "text-gray-900 dark:text-gray-100"}`}>
                            {g.name}
                          </p>
                          <span className="text-[11px] text-gray-400 shrink-0 ml-1">{formatTime(g.lastMessage?.sentAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{g.members.length} members</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* User info */}
      {user && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <Avatar src={user.profilePic} name={user.fullName} size={36} isOnline />
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.fullName}</p>
            <p className="text-xs text-gray-400 truncate">@{user.username || user.email}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
