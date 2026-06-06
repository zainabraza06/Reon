"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/chat/SideBar";
import MobileNav from "@/components/layout/MobileNav";
import CreateGroupModal from "@/components/chat/CreateGroupModal";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, needsDeviceLinking } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [sidebarKey, setSidebarKey]           = useState(0);

  // Whether the user is actively going through the device-linking flow.
  // On these pages we suppress the sidebar so it doesn't try to decrypt chats
  // before keys are available.
  const isLinkingPage = pathname === "/link-device";

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.isOnboarded) { router.replace("/onboarding"); return; }
    // Server has an existing key but this browser has none → must transfer via QR.
    // Allow through if already on /link-device to avoid redirect loop.
    if (needsDeviceLinking && !isLinkingPage) {
      router.replace("/link-device");
    }
  }, [user, loading, needsDeviceLinking, isLinkingPage, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f7ff] dark:bg-[#08081a]">
        <div className="w-8 h-8 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Link-device page renders full-screen without sidebar or bottom nav
  if (isLinkingPage) {
    return (
      <div className="flex h-screen overflow-hidden bg-[#f8f7ff] dark:bg-[#08081a]">
        <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f7ff] dark:bg-[#08081a]">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar key={sidebarKey} onNewGroup={() => setShowCreateGroup(true)} />
      </div>

      {/* Main content — extra bottom padding on mobile for nav bar */}
      <main className="flex-1 flex flex-col overflow-hidden pb-14 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={() => setSidebarKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
