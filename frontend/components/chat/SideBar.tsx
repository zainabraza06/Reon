"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings, Plus, LogOut, Search, Compass } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import { decryptText, getStoredPrivateKey } from "@/lib/crypto";
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
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const privateKeyRef = useRef<CryptoKey | null>(null);

  const decryptChatList = async (list: ChatListItem[], key: CryptoKey | null) => {
    if (!key) return list;
    return Promise.all(
      list.map(async (chat) => {
        if (!chat.lastMessage) return chat;
        let content = "";
        if (chat.lastMessage.contentType === "text" && chat.lastMessage.ciphertext) {
          try {
            content = await decryptText(chat.lastMessage.ciphertext, chat.lastMessage.encryptedKey || "", key);
          } catch {
            content = "[decryption failed]";
          }
        } else if (chat.lastMessage.contentType === "call-log" && chat.lastMessage.ciphertext) {
          try {
            const log = JSON.parse(chat.lastMessage.ciphertext);
            const isVideo = log?.callType === "video";
            const missed  = log?.outcome === "missed" || log?.outcome === "declined";
            content = missed ? `Missed ${isVideo ? "video" : "voice"} call` : `${isVideo ? "Video" : "Voice"} call`;
          } catch {}
        }
        return {
          ...chat,
          lastMessage: {
            ...chat.lastMessage,
            content: content || undefined,
          },
        };
      })
    );
  };

  useEffect(() => {
    api.messages.sidebar().then(async ({ chats: c }) => {
      const k = privateKeyRef.current || await getStoredPrivateKey();
      privateKeyRef.current = k;
      if (k) setPrivateKey(k);
      const decrypted = await decryptChatList(c ?? [], k);
      setChats(decrypted);
    }).catch(() => {});
    api.groups.list().then(({ groups: g }) => setGroups(g ?? [])).catch(() => {});
    api.friends.pendingCount().then(({ count }) => setPendingCount(count)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!privateKey) {
      const timer = setInterval(async () => {
        const k = await getStoredPrivateKey();
        if (k) {
          setPrivateKey(k);
          privateKeyRef.current = k;
          clearInterval(timer);
        }
      }, 500);
      return () => clearInterval(timer);
    }
  }, [privateKey]);

  useEffect(() => {
    if (privateKey && chats.length > 0) {
      const needsDecryption = chats.some(
        (c) =>
          c.lastMessage &&
          (c.lastMessage.contentType === "text" || c.lastMessage.contentType === "call-log") &&
          !c.lastMessage.content
      );
      if (needsDecryption) {
        decryptChatList(chats, privateKey).then((decrypted) => {
          setChats(decrypted);
        });
      }
    }
  }, [privateKey, chats]);

  useEffect(() => {
    // Seed initial online set from the authenticated event (fires on connect/reconnect)
    const onAuthenticated = (data: unknown) => {
      const { onlineFriends } = data as { onlineFriends?: string[] };
      if (Array.isArray(onlineFriends) && onlineFriends.length > 0) {
        setOnlineUsers(new Set(onlineFriends));
      }
    };
    socketService.on("authenticated", onAuthenticated);
    // Also request current online users immediately (covers already-connected sessions)
    socketService.emit("request-online-friends");
    const onOnlineFriends = (data: unknown) => {
      const { onlineFriends } = data as { onlineFriends?: string[] };
      if (Array.isArray(onlineFriends)) setOnlineUsers(new Set(onlineFriends));
    };
    socketService.on("online-friends-response", onOnlineFriends);

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
    const onNewMsg = async (data: unknown) => {
      const msg = data as import("@/types").Message;
      
      let content = "";
      if (msg.contentType === "text" && msg.ciphertext && privateKeyRef.current) {
        try {
          content = await decryptText(msg.ciphertext, msg.encryptedKey || "", privateKeyRef.current);
        } catch {
          content = "[decryption failed]";
        }
      } else if (msg.contentType === "call-log" && msg.ciphertext) {
        try {
          const log = JSON.parse(msg.ciphertext);
          const isVideo = log?.callType === "video";
          const missed  = log?.outcome === "missed" || log?.outcome === "declined";
          content = missed ? `Missed ${isVideo ? "video" : "voice"} call` : `${isVideo ? "Video" : "Voice"} call`;
        } catch {}
      }

      setChats((prev) => {
        const otherParticipantId = String(msg.sender) === String(user?._id) ? String(msg.receiver) : String(msg.sender);
        const exists = prev.some((c) => c._id === otherParticipantId);
        
        const lastMsgData = {
          sentAt: msg.sentAt,
          contentType: msg.contentType,
          ciphertext: msg.ciphertext || "",
          sender: String(msg.sender),
          encryptedKey: msg.encryptedKey || "",
          content: content || undefined,
        };

        if (exists) {
          const updated = prev.map((c) =>
            c._id === otherParticipantId
              ? { 
                  ...c, 
                  lastMessage: lastMsgData, 
                  unreadCount: String(msg.sender) === String(user?._id) ? c.unreadCount : (c.unreadCount || 0) + 1 
                }
              : c
          );
          const targetIndex = updated.findIndex((c) => c._id === otherParticipantId);
          if (targetIndex > 0) {
            const target = updated[targetIndex];
            const filtered = updated.filter((c) => c._id !== otherParticipantId);
            return [target, ...filtered];
          }
          return updated;
        }

        // First message from this sender — add them to the top of the list
        if (msg.senderInfo) {
          const newEntry: ChatListItem = {
            _id: otherParticipantId,
            fullName: msg.senderInfo.fullName,
            username: msg.senderInfo.username,
            profilePic: msg.senderInfo.profilePic,
            lastMessage: lastMsgData,
            unreadCount: String(msg.sender) === String(user?._id) ? 0 : 1,
          };
          return [newEntry, ...prev];
        }
        return prev;
      });
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

    const onMsgRead = (data: unknown) => {
      const { senderId, readerId } = data as { senderId?: string; readerId?: string };
      if (senderId && readerId === user?._id) {
        setChats((prev) => prev.map((c) => c._id === senderId ? { ...c, unreadCount: 0 } : c));
      }
    };

    const onFriendRequestReceived = () => setPendingCount((c) => c + 1);
    const onFriendRequestAccepted = () => setPendingCount((c) => Math.max(0, c - 1));
    const onFriendRequestRejected = () => setPendingCount((c) => Math.max(0, c - 1));
    const onPendingCountUpdated = (data: unknown) => {
      const payload = data as { count: number };
      if (typeof payload.count === "number") setPendingCount(payload.count);
    };
    const onFriendRemoved = (data: unknown) => {
      const { userId: removerId, friendId } = data as { userId: string; friendId: string };
      // Remove whoever is NOT the current user from the chat list
      const removedId = user && removerId === user._id ? friendId : removerId;
      setChats((prev) => prev.filter((c) => c._id !== removedId));
    };

    socketService.on("user-status-changed", onStatus);
    socketService.on("message-read", onMsgRead);
    socketService.on("group-added", onGroupAdded);
    socketService.on("group-updated", onGroupUpdated);
    socketService.on("group-deleted", onGroupDeleted);
    socketService.on("group-removed", onGroupRemoved);
    socketService.on("new-message", onNewMsg);
    socketService.on("message-sent", onNewMsg);
    socketService.on("new-group-message", onNewGroupMsg);
    socketService.on("friend-request-received", onFriendRequestReceived);
    socketService.on("friend-request-accepted", onFriendRequestAccepted);
    socketService.on("friend-request-accepted-realtime", onFriendRequestAccepted);
    socketService.on("friend-request-rejected", onFriendRequestRejected);
    socketService.on("pending-requests-count-updated", onPendingCountUpdated);
    socketService.on("friend-removed", onFriendRemoved);

    return () => {
      socketService.off("authenticated", onAuthenticated);
      socketService.off("online-friends-response", onOnlineFriends);
      socketService.off("user-status-changed", onStatus);
      socketService.off("message-read", onMsgRead);
      socketService.off("group-added", onGroupAdded);
      socketService.off("group-updated", onGroupUpdated);
      socketService.off("group-deleted", onGroupDeleted);
      socketService.off("group-removed", onGroupRemoved);
      socketService.off("new-message", onNewMsg);
      socketService.off("message-sent", onNewMsg);
      socketService.off("new-group-message", onNewGroupMsg);
      socketService.off("friend-request-received", onFriendRequestReceived);
      socketService.off("friend-request-accepted", onFriendRequestAccepted);
      socketService.off("friend-request-accepted-realtime", onFriendRequestAccepted);
      socketService.off("friend-request-rejected", onFriendRequestRejected);
      socketService.off("pending-requests-count-updated", onPendingCountUpdated);
      socketService.off("friend-removed", onFriendRemoved);
    };
  }, [user]);

  const filteredChats = (chats ?? []).filter((c) =>
    !search || c.fullName.toLowerCase().includes(search.toLowerCase()) || c.username?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = (groups ?? []).filter((g) =>
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
    <aside className="sidebar-root flex h-full w-[260px] lg:w-[300px] flex-col">

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
              const displayUnread = active ? 0 : (chat.unreadCount || 0);
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
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1 min-w-0 pr-1">
                          {chat.lastMessage ? (
                            <>
                              {chat.lastMessage.sender === user?._id && "You: "}
                              {chat.lastMessage.contentType && chat.lastMessage.contentType !== "text" && chat.lastMessage.contentType !== "call-log" ? (
                                <span>📎 {chat.lastMessage.contentType}</span>
                              ) : (
                                chat.lastMessage.content || "Message"
                              )}
                            </>
                          ) : (
                            "No messages yet"
                          )}
                        </p>
                        {displayUnread > 0 && (
                          <span className="btn-gradient text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold shrink-0 ml-1">
                            {displayUnread}
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
