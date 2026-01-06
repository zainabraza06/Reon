"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";


import {
  generateRSAKeys,
  ensureRSAKeys,
  getKeyPair
} from "@/lib/crypto";
import { useNotification } from '@/context/NotificationContext';
import { isAxiosError } from 'axios';

import { User, AuthContextType } from "@/types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotification();

  // Helper: validate local keypair vs server
  const validateKeyOwnership = async (userId: string) => {
    try {
      const local = await getKeyPair(userId);
      if (local) {
        // local pair exists — import/ensure keys for usage
        await ensureRSAKeys(userId);
        return true;
      }

      // local not present — check if server already has a public key for this user
      try {
        await api.get(`/keys/${userId}`);
        // server has a public key but local private key missing -> block login on this device
        addNotification({
          type: 'error',
          title: 'Device not registered',
          message: 'This account was registered on a different device. Please login from the original device.',
          duration: 8000
        });

        // Clear any partial auth state
        localStorage.removeItem('user');
        setUser(null);
        return false;
      } catch (err: unknown) {
        // If server returns 404, there is no public key yet — allow this device to generate keys
        if (isAxiosError(err) && err.response?.status === 404) {
          await generateRSAKeys(userId);
          return true;
        }
        // other errors: rethrow
        throw err;
      }
    } catch (err) {
      console.error('Key validation failed', err);
      return false;
    }
  };

  // -------------------------------------------------
  // 🔐 Check session using httpOnly cookies
  // -------------------------------------------------
  const checkAuth = async (): Promise<User | null> => {
    try {
      const res = await api.get("/auth/me");
      const userData: User = res.data.user;

      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));

      // 🔐 Validate key ownership: either import local keys, or generate if first device,
      // or block login if keys exist on server but not locally.
      const ok = await validateKeyOwnership(userData._id);
      if (!ok) return null;

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

          // Validate local/server key ownership and ensure keys are ready
          const ok = await validateKeyOwnership(parsed._id);
          if (!ok) {
            setLoading(false);
            return;
          }

          // Validate session with backend
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

      // 🔐 Validate key ownership on login as well
      const ok = await validateKeyOwnership(userData._id);
      if (!ok) {
        // blocked: throw to caller so login UI can react
        throw new Error('Device not registered');
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
    window.location.href = `https://reon-4g0b.onrender.com/auth/google`;
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
