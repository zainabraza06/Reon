"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import OnboardingPage from "@/components/auth/settings/OnBoardPage";

export default function OnBoardingPageWrapper() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // If not authenticated, redirect to login
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // If already onboarded, redirect to main app
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
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh"
      }}>
        <p>Checking authentication...</p>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh"
      }}>
        <p>Redirecting to login...</p>
      </div>
    );
  }

  // Already onboarded - redirect in effect above, show loading
  if (user.isOnboarded) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh"
      }}>
        <p>Redirecting...</p>
      </div>
    );
  }

  // User exists and NOT onboarded - show onboarding page
  return <OnboardingPage />;
}