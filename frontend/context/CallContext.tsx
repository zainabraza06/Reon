"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface IncomingCallData {
  callId: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  type: "audio" | "video";
}

export type CallState = 'idle' | 'initiating' | 'dialing' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';

export interface ActiveCallData {
  callId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: "audio" | "video";
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  startTime: number;
  callState?: CallState;
}

export type CallViewMode = 'full' | 'mini';

export interface CallContextType {
  // Incoming calls
  incomingCall: IncomingCallData | null;
  showIncomingCall: (data: IncomingCallData) => void;
  dismissIncomingCall: () => void;
  
  // Active calls
  activeCall: ActiveCallData | null;
  startCall: (data: ActiveCallData) => void;
  updateCallStreams: (local?: MediaStream, remote?: MediaStream) => void;
  updateCallState: (state: CallState) => void;
  endCall: () => void;
  
  // Call view mode
  callViewMode: CallViewMode;
  setCallViewMode: (mode: CallViewMode) => void;
  
  // Call state
  isCallActive: boolean;
  setIsCallActive: (active: boolean) => void;
  
  // Call controls
  isMicEnabled: boolean;
  setIsMicEnabled: (enabled: boolean) => void;
  isCameraEnabled: boolean;
  setIsCameraEnabled: (enabled: boolean) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallData | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callViewMode, setCallViewMode] = useState<CallViewMode>('full');
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);

  const showIncomingCall = useCallback((data: IncomingCallData) => {
    setIncomingCall(data);
  }, []);

  const dismissIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const startCall = useCallback((data: ActiveCallData) => {
    setActiveCall(data);
    setIsCallActive(true);
  }, []);

  const updateCallStreams = useCallback((local?: MediaStream, remote?: MediaStream) => {
    setActiveCall((prev) => {
      if (!prev) return null;
      
      // Compare stream IDs instead of object references to avoid infinite loops
      const localStreamId = local?.id;
      const remoteStreamId = remote?.id;
      const prevLocalStreamId = prev.localStream?.id;
      const prevRemoteStreamId = prev.remoteStream?.id;
      
      // Check for redundant updates - don't update if streams haven't changed
      if (localStreamId === prevLocalStreamId && remoteStreamId === prevRemoteStreamId) {
        return prev;
      }
      
      return {
        ...prev,
        localStream: local ?? prev.localStream,
        remoteStream: remote ?? prev.remoteStream,
      };
    });
  }, []);

  const updateCallState = useCallback((state: CallState) => {
    setActiveCall((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        callState: state,
      };
    });
  }, []);

  const endCall = useCallback(() => {
    setActiveCall(null);
    setIsCallActive(false);
    setCallViewMode('full');
    setIsMicEnabled(true);
    setIsCameraEnabled(true);
  }, []);

  const value: CallContextType = {
    incomingCall,
    showIncomingCall,
    dismissIncomingCall,
    activeCall,
    startCall,
    updateCallStreams,
    updateCallState,
    endCall,
    callViewMode,
    setCallViewMode,
    isCallActive,
    setIsCallActive,
    isMicEnabled,
    setIsMicEnabled,
    isCameraEnabled,
    setIsCameraEnabled,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within CallProvider");
  }
  return context;
};
