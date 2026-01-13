"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // If not authenticated, redirect to login
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // If already onboarded, redirect to chat or recommendations
      if (user.isOnboarded) {
        if (user.chats?.length) {
          router.replace("/chat");
        } else if (user.friends?.length) {
          router.replace("/friends");
        } else {
          router.replace("/recommendations");
        }
      }
    }
  }, [user, loading, router]);

  // Still loading auth
  if (loading) {
    return (
      <FullScreenMessage>Checking authentication...</FullScreenMessage>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <FullScreenMessage>Redirecting to login...</FullScreenMessage>
    );
  }

  // Already onboarded - redirect in effect above, show loading
  if (user.isOnboarded) {
    return (
      <FullScreenMessage>Redirecting...</FullScreenMessage>
    );
  }

  // User exists and NOT onboarded - allow access to onboarding
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
