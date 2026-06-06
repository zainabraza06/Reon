"use client";
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import type { Message } from "@/types";

export type NotifType =
  | "friend_request"
  | "friend_accepted"
  | "group_added"
  | "group_removed"
  | "new_message"
  | "new_group_message";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  avatar?: string;
  link?: string;
  timestamp: string;
  read: boolean;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const push = useCallback((n: Omit<AppNotification, "id" | "read">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications((prev) => [{ ...n, id, read: false }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!user) return;

    const onFriendReq = (data: unknown) => {
      const { sender } = data as {
        sender: { _id: string; fullName: string; profilePic?: string };
      };
      if (!sender) return;
      push({
        type: "friend_request",
        title: "Friend Request",
        body: `${sender.fullName} sent you a friend request`,
        avatar: sender.profilePic,
        link: "/friends",
        timestamp: new Date().toISOString(),
      });
    };

    const onFriendAccepted = (data: unknown) => {
      const d = data as {
        senderId: string;
        receiverId: string;
        sender?: { fullName: string; profilePic?: string };
        receiver?: { fullName: string; profilePic?: string };
      };
      // Only notify the original requester (sender) that their request was accepted
      if (d.senderId !== user._id) return;
      push({
        type: "friend_accepted",
        title: "Friend Request Accepted",
        body: `${d.receiver?.fullName ?? "Someone"} accepted your friend request`,
        avatar: d.receiver?.profilePic,
        link: "/friends",
        timestamp: new Date().toISOString(),
      });
    };

    const onGroupAdded = (data: unknown) => {
      const { group } = data as {
        group: { _id: string; name: string; avatar?: string };
      };
      push({
        type: "group_added",
        title: "Added to Group",
        body: `You were added to "${group.name}"`,
        avatar: group.avatar,
        link: `/group/${group._id}`,
        timestamp: new Date().toISOString(),
      });
    };

    const onGroupRemoved = (data: unknown) => {
      const { groupName } = data as { groupId: string; groupName?: string };
      push({
        type: "group_removed",
        title: "Removed from Group",
        body: groupName ? `You were removed from "${groupName}"` : "You were removed from a group",
        link: "/chat",
        timestamp: new Date().toISOString(),
      });
    };

    const onNewDM = (data: unknown) => {
      const msg = data as Message;
      const isMine = String(msg.sender) === String(user._id);
      if (isMine) return;
      const chatId = String(msg.sender);
      if (pathnameRef.current === `/chat/${chatId}`) return;
      const senderName = msg.senderInfo?.fullName ?? "Someone";
      push({
        type: "new_message",
        title: senderName,
        body: "Sent you a message",
        avatar: msg.senderInfo?.profilePic,
        link: `/chat/${chatId}`,
        timestamp: new Date().toISOString(),
      });
    };

    const onNewGroupMsg = (data: unknown) => {
      const { message, groupId, groupName } = data as {
        message: { sender?: { _id?: string; fullName?: string; profilePic?: string }; contentType?: string };
        groupId: string;
        groupName?: string;
      };
      // Skip system messages and messages the user sent
      if (message.contentType === "system") return;
      if (String(message.sender?._id) === String(user._id)) return;
      if (pathnameRef.current === `/group/${groupId}`) return;
      const senderName = message.sender?.fullName ?? "Someone";
      push({
        type: "new_group_message",
        title: groupName ?? "Group message",
        body: `${senderName}: sent a message`,
        avatar: message.sender?.profilePic,
        link: `/group/${groupId}`,
        timestamp: new Date().toISOString(),
      });
    };

    socketService.on("friend-request-received", onFriendReq);
    socketService.on("friend-request-accepted-realtime", onFriendAccepted);
    socketService.on("group-added", onGroupAdded);
    socketService.on("group-removed", onGroupRemoved);
    socketService.on("new-message", onNewDM);
    socketService.on("new-group-message", onNewGroupMsg);

    return () => {
      socketService.off("friend-request-received", onFriendReq);
      socketService.off("friend-request-accepted-realtime", onFriendAccepted);
      socketService.off("group-added", onGroupAdded);
      socketService.off("group-removed", onGroupRemoved);
      socketService.off("new-message", onNewDM);
      socketService.off("new-group-message", onNewGroupMsg);
    };
  }, [user, push]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead    = useCallback((id: string) => setNotifications((p) => p.map((n) => n.id === id ? { ...n, read: true } : n)), []);
  const markAllRead = useCallback(() => setNotifications((p) => p.map((n) => ({ ...n, read: true }))), []);
  const remove      = useCallback((id: string) => setNotifications((p) => p.filter((n) => n.id !== id)), []);
  const clearAll    = useCallback(() => setNotifications([]), []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, remove, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
