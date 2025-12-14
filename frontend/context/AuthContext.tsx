"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";


import {
  generateRSAKeys,
  ensureRSAKeys,
  getKeyPair
} from "@/lib/crypto";

import { User, AuthContextType } from "@/types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // -------------------------------------------------
  // 🔐 Check session using httpOnly cookies
  // -------------------------------------------------
  const checkAuth = async (): Promise<User | null> => {
    try {
      const res = await api.get("/auth/me");
      const userData: User = res.data.user;

      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));

      // 🔐 Ensure RSA keys are present
      await ensureRSAKeys(userData._id);

      return userData;
    } catch (err) {
      console.error("Auth check failed", err);
      setUser(null);
      localStorage.removeItem("user");
      return null;
    }
  };

  // -------------------------------------------------
  // 🔄 Initialize auth on mount
  // -------------------------------------------------
  useEffect(() => {
    const init = async () => {
      try {
        const stored = localStorage.getItem("user");

        if (stored) {
          const parsed = JSON.parse(stored) as User;
          setUser(parsed);

          // Ensure keys exist
          await ensureRSAKeys(parsed._id);

          // Validate with backend
          await checkAuth();
        } else {
          await checkAuth();
        }
      } catch (err) {
        console.warn("Initialization error", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // -------------------------------------------------
  // 🔐 LOGIN
  // -------------------------------------------------
  const login = async (email: string, password: string) => {
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      const userData: User = res.data.user;

      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));

      // 🔐 Ensure or generate RSA keys
      const existing = await getKeyPair(userData._id);
      if (!existing) {
        await generateRSAKeys(userData._id);
      } else {
        await ensureRSAKeys(userData._id);
      }

      // Routing logic
      if (!userData.isOnboarded) router.push("/auth/onboard");
      else if (userData.chats?.length) router.push("/chat");
      else if (userData.friends?.length) router.push("/friends");
      else router.push("/recommendations");

    } catch (err) {
      console.error("Login failed", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------
  // 🔐 GOOGLE OAUTH
  // -------------------------------------------------
  const loginWithGoogle = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
  };

  // -------------------------------------------------
  // 🔓 LOGOUT
  // -------------------------------------------------
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout error", err);
    }

    localStorage.removeItem("user");
    setUser(null);
    router.push("/auth/login");
  };

  // -------------------------------------------------
  // 🔄 Refresh user
  // -------------------------------------------------
  const refreshUser = async () => {
    try {
      return await checkAuth();
    } catch (err) {
      console.error("Failed to refresh user");
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        loginWithGoogle,
        refreshUser,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
