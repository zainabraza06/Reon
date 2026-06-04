"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Compass, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";

const tabs = [
  { href: "/chat",            icon: MessageSquare, label: "Chats"    },
  { href: "/friends",         icon: Users,         label: "Friends"  },
  { href: "/recommendations", icon: Compass,       label: "Discover" },
  { href: "/settings",        icon: Settings,      label: "Settings" },
] as const;

export default function MobileNav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.friends.pendingCount().then(({ count }) => setPendingCount(count)).catch(() => {});

    const onRequest  = () => setPendingCount((c) => c + 1);
    const onAccepted = () => setPendingCount((c) => Math.max(0, c - 1));
    const onRejected = () => setPendingCount((c) => Math.max(0, c - 1));
    const onCountUpdated = (data: unknown) => {
      const payload = data as { count: number };
      if (typeof payload.count === "number") setPendingCount(payload.count);
    };

    socketService.on("friend-request-received", onRequest);
    socketService.on("friend-request-accepted", onAccepted);
    socketService.on("friend-request-accepted-realtime", onAccepted);
    socketService.on("friend-request-rejected", onRejected);
    socketService.on("pending-requests-count-updated", onCountUpdated);
    return () => {
      socketService.off("friend-request-received", onRequest);
      socketService.off("friend-request-accepted", onAccepted);
      socketService.off("friend-request-accepted-realtime", onAccepted);
      socketService.off("friend-request-rejected", onRejected);
      socketService.off("pending-requests-count-updated", onCountUpdated);
    };
  }, []);

  return (
    <nav className="mobile-nav-root md:hidden fixed bottom-0 left-0 right-0 z-40 safe-area-bottom">
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
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative transition-colors"
            >
              {/* Active pill indicator */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full btn-gradient" />
              )}

              <div className={`relative p-1.5 rounded-xl transition-all ${isActive ? "bg-violet-100 dark:bg-violet-500/15" : ""}`}>
                <Icon
                  size={21}
                  className={isActive ? "text-violet-600 dark:text-violet-400" : "text-gray-400 dark:text-gray-500"}
                />
                {label === "Friends" && pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-3.5 h-3.5 flex items-center justify-center px-0.5">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>

              <span className={`text-[10px] font-semibold transition-colors ${
                isActive ? "text-violet-600 dark:text-violet-400" : "text-gray-400 dark:text-gray-500"
              }`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
