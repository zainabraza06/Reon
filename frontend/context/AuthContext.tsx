"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { generateKeyPair, hasKeyPair, getStoredPublicKey, clearKeys } from "@/lib/crypto";
import type { User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  needsDeviceLinking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                         = useState<User | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [needsDeviceLinking, setNeedsLinking]   = useState(false);

  // Returns true when the server has an existing key for this user but this
  // browser has none — the user must transfer their private key via QR instead
  // of generating a brand-new pair (which would destroy access to old messages).
  const setupKeys = async (userId: string): Promise<boolean> => {
    try {
      const localExists = await hasKeyPair();
      const serverKey   = await api.keys.get(userId).catch(() => null);

      if (localExists && serverKey?.publicKey) {
        // Verify local public key matches server — mismatch means senders encrypt with
        // a key this device can't decrypt. Re-upload local key to fix it.
        const localPublicKey = await getStoredPublicKey();
        if (localPublicKey && localPublicKey.n !== serverKey.publicKey.n) {
          await api.keys.upload(localPublicKey, userId);
        }
        return false;
      }

      if (localExists && !serverKey?.publicKey) {
        // Keys exist locally but the server copy is missing — re-upload
        const localPublicKey = await getStoredPublicKey();
        if (localPublicKey) await api.keys.upload(localPublicKey, userId);
        return false;
      }

      if (!localExists && serverKey?.publicKey) {
        // Server has a key but this device doesn't.
        // DO NOT generate new keys — that would overwrite the public key and make
        // all previously encrypted messages unreadable.
        return true; // signal: needs device linking
      }

      // No local key AND no server key → first time ever → generate fresh pair
      const { publicKey } = await generateKeyPair();
      await api.keys.upload(publicKey, userId);
      return false;
    } catch (err) {
      console.error("Key setup error:", err);
      return false;
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
        const linking = await setupKeys(u._id);
        setNeedsLinking(linking);
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
    const linking = await setupKeys(res.user._id);
    setNeedsLinking(linking);
  };

  const logout = async () => {
    await api.auth.logout();
    socketService.disconnect();
    await clearKeys();
    setUser(null);
    setNeedsLinking(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, needsDeviceLinking, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
