"use client";
import { createContext, useContext, useEffect, ReactNode } from "react";
import { socketService } from "@/lib/socket";
import { useAuth } from "./AuthContext";

interface SocketCtx {
  emit: (event: string, data?: unknown) => void;
  on: (event: string, fn: (data: unknown) => void) => void;
  off: (event: string, fn: (data: unknown) => void) => void;
}

const SocketContext = createContext<SocketCtx>({} as SocketCtx);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (user) socketService.connect(user._id);
  }, [user]);

  return (
    <SocketContext.Provider value={{ emit: socketService.emit.bind(socketService), on: socketService.on.bind(socketService), off: socketService.off.bind(socketService) }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
