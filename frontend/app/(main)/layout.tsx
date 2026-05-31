"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/chat/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import CreateGroupModal from "@/components/chat/CreateGroupModal";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [sidebarKey, setSidebarKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!user.isOnboarded) router.replace("/onboarding");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar
          key={sidebarKey}
          onNewGroup={() => setShowCreateGroup(true)}
        />
      </div>

      {/* Main content — full height, extra bottom padding on mobile for nav bar */}
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
