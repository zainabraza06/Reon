"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // Allow a brief window for cookie-based auth to finalize
      const timer = setTimeout(() => {
        if (!user) {
          router.replace("/");
        }
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  // Initial auth still loading (context checking itself)
  if (loading) {
    return (
      <FullScreenMessage>Checking authentication...</FullScreenMessage>
    );
  }

  // Auth check is done, but no user — waiting for cookie-based flow
  if (!user) {
    return (
      <FullScreenMessage>Completing authentication...</FullScreenMessage>
    );
  }

  return <>{children}</>;
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh"
    }}>
      <p>{children}</p>
    </div>
  );
}
