"use client";
import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useCall } from "@/hooks/useCall";
import CallModal from "@/components/call/CallModal";

interface CallCtx {
  startCall: (toUserId: string, peerName: string, type: "audio" | "video") => Promise<void>;
}

const CallContext = createContext<CallCtx>({ startCall: async () => {} });

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { state, startCall, answerCall, rejectCall, hangUp, toggleMute, toggleCamera } =
    useCall(user?._id ?? null);

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}
      <CallModal
        call={state}
        onAnswer={answerCall}
        onReject={rejectCall}
        onHangUp={hangUp}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    </CallContext.Provider>
  );
}

export const useCallContext = () => useContext(CallContext);
