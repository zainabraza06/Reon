"use client";
import { useState, useRef, useEffect } from "react";
import { Bell, X, UserPlus, UserCheck, Users, UserMinus, MessageSquare, MessagesSquare, Check } from "lucide-react";
import Link from "next/link";
import { useNotifications, type AppNotification, type NotifType } from "@/context/NotificationContext";
import Avatar from "@/components/ui/Avatar";

const iconMap: Record<NotifType, React.ReactNode> = {
  friend_request:    <UserPlus     size={14} className="text-violet-500" />,
  friend_accepted:   <UserCheck    size={14} className="text-teal-500" />,
  group_added:       <Users        size={14} className="text-violet-500" />,
  group_removed:     <UserMinus    size={14} className="text-rose-400" />,
  new_message:       <MessageSquare  size={14} className="text-violet-500" />,
  new_group_message: <MessagesSquare size={14} className="text-violet-500" />,
};

function formatTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)  return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function NotifItem({ n, onClose }: { n: AppNotification; onClose: () => void }) {
  const { markRead, remove } = useNotifications();

  const handleClick = () => { markRead(n.id); onClose(); };

  return (
    <div className={`relative flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/4 transition-colors ${!n.read ? "bg-violet-50/50 dark:bg-violet-500/5" : ""}`}>
      {/* Avatar or icon */}
      <div className="relative shrink-0 mt-0.5">
        {n.avatar
          ? <Avatar src={n.avatar} name={n.title} size={36} />
          : <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              {iconMap[n.type]}
            </div>
        }
        {!n.read && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-white dark:border-[#0f0f28]" />
        )}
      </div>

      {/* Text */}
      {n.link ? (
        <Link href={n.link} className="flex-1 min-w-0" onClick={handleClick}>
          <p className="text-xs font-semibold text-gray-900 dark:text-white leading-snug">{n.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.body}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatTime(n.timestamp)}</p>
        </Link>
      ) : (
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-white leading-snug">{n.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.body}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatTime(n.timestamp)}</p>
        </div>
      )}

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => remove(n.id)}
        className="shrink-0 p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 rounded-xl transition-colors ${
          open
            ? "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/15"
            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
        }`}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 btn-gradient text-white text-[9px] rounded-full min-w-[15px] h-[15px] flex items-center justify-center font-bold px-0.5">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-2 w-80 max-h-[480px] flex flex-col bg-white dark:bg-[#0f0f28] border border-gray-100 dark:border-white/8 rounded-2xl shadow-2xl overflow-hidden z-50"
          style={{ minWidth: "17rem" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/8 shrink-0">
            <span className="text-sm font-bold text-gray-900 dark:text-white">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  title="Mark all read"
                  className="flex items-center gap-1 text-[11px] text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 px-2 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                >
                  <Check size={11} /> All read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  title="Clear all"
                  className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                  <Bell size={22} className="text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-white/4">
                {notifications.map((n) => (
                  <NotifItem key={n.id} n={n} onClose={() => setOpen(false)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
