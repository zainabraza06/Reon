"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { generateKeyPair, hasKeyPair, getStoredPublicKey, clearKeys } from "@/lib/crypto";
import type { User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setupKeys = async (userId: string) => {
    try {
      if (await hasKeyPair()) return;
      const { publicKey } = await generateKeyPair();
      await api.keys.upload(publicKey);
    } catch (err) {
      console.error("Key setup error:", err);
    }
  };

  const refreshUser = async () => {
    try {
      const { user: u } = await api.auth.me();
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { user: u } = await api.auth.me();
        setUser(u);
        socketService.connect(u._id);
        await setupKeys(u._id);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login({ email, password }) as { user: User };
    setUser(res.user);
    socketService.connect(res.user._id);
    await setupKeys(res.user._id);
  };

  const logout = async () => {
    await api.auth.logout();
    socketService.disconnect();
    await clearKeys();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
