"use client";
import { Bell, X, UserPlus, UserCheck, Users, UserMinus, MessageSquare, MessagesSquare, Check } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { useNotifications, type AppNotification, type NotifType } from "@/context/NotificationContext";

const iconMap: Record<NotifType, React.ReactNode> = {
  friend_request:    <UserPlus     size={16} className="text-violet-500" />,
  friend_accepted:   <UserCheck    size={16} className="text-teal-500" />,
  group_added:       <Users        size={16} className="text-violet-500" />,
  group_removed:     <UserMinus    size={16} className="text-rose-400" />,
  new_message:       <MessageSquare  size={16} className="text-violet-500" />,
  new_group_message: <MessagesSquare size={16} className="text-violet-500" />,
};

function formatTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)   return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function NotifRow({ n }: { n: AppNotification }) {
  const { markRead, remove } = useNotifications();

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-white/4 ${!n.read ? "bg-violet-50/50 dark:bg-violet-500/5" : ""}`}>
      <div className="relative shrink-0 mt-0.5">
        {n.avatar
          ? <Avatar src={n.avatar} name={n.title} size={42} />
          : <div className="w-11 h-11 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              {iconMap[n.type]}
            </div>
        }
        {!n.read && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-500 border-2 border-white dark:border-[#08081a]" />
        )}
      </div>

      <div className="flex-1 min-w-0" onClick={() => markRead(n.id)}>
        {n.link ? (
          <Link href={n.link} className="block">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{n.body}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatTime(n.timestamp)}</p>
          </Link>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{n.body}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatTime(n.timestamp)}</p>
          </>
        )}
      </div>

      <button type="button" onClick={() => remove(n.id)} className="shrink-0 p-1.5 rounded-xl text-gray-300 dark:text-gray-600 hover:text-gray-500 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#08081a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-violet-500" />
          <span className="text-base font-bold text-gray-900 dark:text-white">Notifications</span>
          {unreadCount > 0 && (
            <span className="btn-gradient text-white text-[10px] font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 px-2.5 py-1.5 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors font-medium"
            >
              <Check size={12} /> Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2.5 py-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
              <Bell size={28} className="text-gray-300 dark:text-gray-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">All caught up!</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No notifications yet</p>
            </div>
          </div>
        ) : (
          notifications.map((n) => <NotifRow key={n.id} n={n} />)
        )}
      </div>
    </div>
  );
}
