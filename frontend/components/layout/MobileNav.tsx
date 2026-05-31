"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Compass, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";

const tabs = [
  { href: "/chat",            icon: MessageSquare, label: "Chats" },
  { href: "/friends",         icon: Users,         label: "Friends" },
  { href: "/recommendations", icon: Compass,       label: "Discover" },
  { href: "/settings",        icon: Settings,      label: "Settings" },
] as const;

export default function MobileNav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.friends.pendingCount().then(({ count }) => setPendingCount(count)).catch(() => {});

    const onRequest = () => setPendingCount((c) => c + 1);
    const onAccepted = () => setPendingCount((c) => Math.max(0, c - 1));
    const onRejected = () => setPendingCount((c) => Math.max(0, c - 1));
    socketService.on("friend-request-received", onRequest);
    socketService.on("friend-request-accepted", onAccepted);
    socketService.on("friend-request-rejected", onRejected);
    return () => {
      socketService.off("friend-request-received", onRequest);
      socketService.off("friend-request-accepted", onAccepted);
      socketService.off("friend-request-rejected", onRejected);
    };
  }, []);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/chat"
              ? pathname === "/chat" || pathname.startsWith("/chat/") || pathname.startsWith("/group/")
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative transition-colors ${
                isActive
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              <div className="relative">
                <Icon size={22} />
                {label === "Friends" && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
