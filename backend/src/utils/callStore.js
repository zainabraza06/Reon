import crypto from "crypto";

// Simple in-memory call store (replace with Redis/database for production)
const callSessions = new Map(); // callId → session data
const userCalls = new Map(); // userId → Set(callIds)

// Call session management
export const createSession = ({ callId, fromUserId, toUserId, type = "audio", icePolicy = "all" }) => {
  const session = {
    callId,
    fromUserId: fromUserId.toString(),
    toUserId: toUserId.toString(),
    type,
    icePolicy,
    status: "created",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
  };
  
  callSessions.set(callId, session);
  
  // Track user's active calls
  [fromUserId, toUserId].forEach(userId => {
    const strId = userId.toString();
    if (!userCalls.has(strId)) {
      userCalls.set(strId, new Set());
    }
    userCalls.get(strId).add(callId);
  });
  
  console.log(`📞 Call ${callId} created: ${fromUserId} → ${toUserId} (${type})`);
  return session;
};

export const getSession = (callId) => {
  return callSessions.get(callId);
};

export const updateStatus = (callId, status) => {
  const session = callSessions.get(callId);
  if (session) {
    session.status = status;
    session.updatedAt = Date.now();
    console.log(`📞 Call ${callId} status: ${status}`);
    return true;
  }
  return false;
};

export const assertParticipant = (callId, userId) => {
  const session = callSessions.get(callId);
  if (!session) return false;
  
  const strUserId = userId.toString();
  return session.fromUserId === strUserId || session.toUserId === strUserId;
};

export const touchSession = (callId) => {
  const session = callSessions.get(callId);
  if (session) {
    session.updatedAt = Date.now();
  }
};

export const endSession = (callId, reason = "ended") => {
  const session = callSessions.get(callId);
  if (session) {
    // Remove from user tracking
    [session.fromUserId, session.toUserId].forEach(userId => {
      const userCallSet = userCalls.get(userId);
      if (userCallSet) {
        userCallSet.delete(callId);
        if (userCallSet.size === 0) {
          userCalls.delete(userId);
        }
      }
    });
    
    // Remove session
    callSessions.delete(callId);
    console.log(`🗑️ Call ${callId} ended: ${reason}`);
    return true;
  }
  return false;
};

export const getUserActiveCalls = (userId) => {
  const userCallSet = userCalls.get(userId.toString());
  return userCallSet ? Array.from(userCallSet).map(callId => getSession(callId)).filter(Boolean) : [];
};

export const isUserInCall = (userId) => {
  const strUserId = userId.toString();
  
  for (const session of callSessions.values()) {
    if ((session.fromUserId === strUserId || session.toUserId === strUserId) && 
        session.status === "connected") {
      return session.callId;
    }
  }
  return null;
};

// Clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [callId, session] of callSessions.entries()) {
    if (now > session.expiresAt) {
      endSession(callId, "expired");
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Cleanup function for graceful shutdown
export const cleanupAllCalls = () => {
  for (const [callId] of callSessions.entries()) {
    endSession(callId, "server-shutdown");
  }
  console.log("🧹 All call sessions cleaned up");
};