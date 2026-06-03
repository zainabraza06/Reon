"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Settings, Plus, LogOut, Search, Compass } from "lucide-react";
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
    api.messages.sidebar().then(({ chats: c }) => setChats(c)).catch(() => {});
    api.groups.list().then(({ groups: g }) => setGroups(g)).catch(() => {});
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
      setGroups((prev) => prev.find((g) => g._id === group._id) ? prev : [group, ...prev]);
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
    if (date.toDateString() === now.toDateString())
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const navIconCls = (path: string) =>
    `p-2 rounded-xl transition-colors ${
      pathname === path
        ? "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/15"
        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
    }`;

  return (
    <aside className="sidebar-root flex h-full w-[300px] flex-col">

      {/* Header */}
      <div className="sidebar-header flex items-center justify-between px-4 py-3">
        <span className="text-lg font-black brand-gradient tracking-tight select-none">Reon</span>
        <div className="flex items-center gap-0.5">
          <Link href="/recommendations" className={navIconCls("/recommendations")} title="Discover people">
            <Compass size={17} />
          </Link>
          <Link href="/friends" className={`${navIconCls("/friends")} relative`} title="Friends">
            <Users size={17} />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] rounded-full w-[15px] h-[15px] flex items-center justify-center font-bold">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </Link>
          <Link href="/settings" className={navIconCls("/settings")} title="Settings">
            <Settings size={17} />
          </Link>
        </div>
      </div>

      {/* Search + tabs */}
      <div className="px-3 pt-2.5 pb-2 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/[0.05]">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/[0.06] rounded-xl px-3 py-2 mb-2.5">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 flex-1 min-w-0"
          />
        </div>
        <div className="flex gap-1.5">
          {(["dms", "groups"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                t === tab
                  ? "btn-gradient text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
              }`}>
              {t === "dms" ? "Chats" : "Groups"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat / group list */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0f0f28]">

        {/* DM list */}
        {tab === "dms" && (
          <ul className="py-1">
            {filteredChats.length === 0 && (
              <li className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">No conversations yet</li>
            )}
            {filteredChats.map((chat) => {
              const active = pathname === `/chat/${chat._id}`;
              return (
                <li key={chat._id}>
                  <Link
                    href={`/chat/${chat._id}`}
                    className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl transition-all ${
                      active
                        ? "bg-violet-50 dark:bg-violet-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <Avatar src={chat.profilePic} name={chat.fullName} size={46} isOnline={onlineUsers.has(chat._id)} />
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={`text-[14px] font-semibold truncate ${active ? "text-violet-700 dark:text-violet-300" : "text-gray-900 dark:text-gray-100"}`}>
                          {chat.fullName}
                        </p>
                        <span className="text-[11px] text-gray-400 shrink-0 ml-1">{formatTime(chat.lastMessage?.sentAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {chat.lastMessage?.contentType && chat.lastMessage.contentType !== "text"
                            ? `📎 ${chat.lastMessage.contentType}`
                            : !chat.lastMessage ? "No messages yet" : ""}
                        </p>
                        {(chat.unreadCount || 0) > 0 && (
                          <span className="btn-gradient text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold shrink-0 ml-1">
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

        {/* Groups list */}
        {tab === "groups" && (
          <div className="py-1 px-2">
            <button
              type="button"
              onClick={onNewGroup}
              className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 rounded-xl text-sm text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors font-semibold"
            >
              <Plus size={15} />
              New Group
            </button>
            <ul className="space-y-0.5">
              {filteredGroups.length === 0 && (
                <li className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">No groups yet</li>
              )}
              {filteredGroups.map((g) => {
                const active = pathname === `/group/${g._id}`;
                return (
                  <li key={g._id}>
                    <Link
                      href={`/group/${g._id}`}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                        active ? "bg-violet-50 dark:bg-violet-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <Avatar src={g.avatar} name={g.name} size={42} />
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-semibold truncate ${active ? "text-violet-700 dark:text-violet-300" : "text-gray-900 dark:text-gray-100"}`}>
                            {g.name}
                          </p>
                          <span className="text-[11px] text-gray-400 shrink-0 ml-1">{formatTime(g.lastMessage?.sentAt)}</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{g.members.length} members</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Me / footer */}
      {user && (
        <div className="sidebar-footer flex items-center gap-3 px-4 py-3">
          <Avatar src={user.profilePic} name={user.fullName} size={36} isOnline />
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user.fullName}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">@{user.username || "me"}</p>
          </div>
          <button type="button" onClick={logout} title="Logout"
            className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      )}
    </aside>
  );
}
