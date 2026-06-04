"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!user.isOnboarded) {
      router.replace("/onboarding");
    } else {
      router.replace("/chat");
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-full items-center justify-center bg-[#f8f7ff] dark:bg-[#08081a]">
      <div className="w-8 h-8 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
    </div>
  );
}
