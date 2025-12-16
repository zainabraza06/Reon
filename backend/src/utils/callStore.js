// Lightweight in-memory call session store.
// In production, move this to a durable store (Redis/DB) with eviction.
const CALL_TTL_MS = 20 * 60 * 1000; // 20 minutes

const callSessions = new Map(); // callId -> session

const cleanup = () => {
  const now = Date.now();
  for (const [callId, session] of callSessions.entries()) {
    if (session.expiresAt <= now) {
      console.log(`🧹 Cleaning up expired call session: ${callId}`);
      callSessions.delete(callId);
    }
  }
};

setInterval(cleanup, 60 * 1000).unref();

export const createSession = ({
  callId,
  fromUserId,
  toUserId,
  type = "audio",
  icePolicy = "all"
}) => {
  const now = Date.now();
  const session = {
    callId,
    fromUserId: fromUserId.toString(),
    toUserId: toUserId.toString(),
    type,
    status: "initiated",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + CALL_TTL_MS,
    icePolicy,
    iceRestartCount: 0
  };
  callSessions.set(callId, session);
  console.log(`✅ Created session: ${callId}, from: ${fromUserId}, to: ${toUserId}`);
  return session;
};

export const getSession = (callId) => callSessions.get(callId);

export const updateStatus = (callId, status) => {
  const session = callSessions.get(callId);
  if (!session) {
    console.log(`❌ Cannot update status: session ${callId} not found`);
    return null;
  }
  console.log(`📞 Call ${callId} status: ${session.status} -> ${status}`);
  session.status = status;
  session.updatedAt = Date.now();
  session.expiresAt = Date.now() + CALL_TTL_MS;
  return session;
};

export const touchSession = (callId) => {
  const session = callSessions.get(callId);
  if (!session) return null;
  session.updatedAt = Date.now();
  session.expiresAt = Date.now() + CALL_TTL_MS;
  return session;
};

export const incrementIceRestart = (callId) => {
  const session = callSessions.get(callId);
  if (!session) return null;
  session.iceRestartCount = (session.iceRestartCount || 0) + 1;
  session.updatedAt = Date.now();
  session.expiresAt = Date.now() + CALL_TTL_MS;
  return session;
};

export const assertParticipant = (callId, userId) => {
  const session = callSessions.get(callId);
  if (!session) {
    console.log(`❌ Assert participant failed: session ${callId} not found`);
    return false;
  }
  const uid = userId.toString();
  const isParticipant = session.fromUserId === uid || session.toUserId === uid;
  if (!isParticipant) {
    console.log(`❌ User ${uid} is not a participant of call ${callId}`);
  }
  return isParticipant;
};

export const endSession = (callId, reason = "ended") => {
  const session = callSessions.get(callId);
  if (!session) {
    console.log(`❌ Cannot end session: ${callId} not found`);
    return null;
  }
  console.log(`📞 Ending session ${callId}, reason: ${reason}`);
  session.status = reason;
  session.updatedAt = Date.now();
  callSessions.delete(callId);
  return session;
};

// NEW: Clean up sessions for disconnected user
export const cleanupUserSessions = (userId) => {
  const uid = userId.toString();
  let cleanedCount = 0;
  
  for (const [callId, session] of callSessions.entries()) {
    if ((session.fromUserId === uid || session.toUserId === uid) && 
        session.status !== 'ended' && 
        session.status !== 'rejected' &&
        session.status !== 'busy') {
      console.log(`🧹 Cleaning up call ${callId} for disconnected user ${uid}, status was: ${session.status}`);
      endSession(callId, 'user-disconnected');
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} call sessions for user ${uid}`);
  }
};

// Optional: Get all sessions for debugging
export const getAllSessions = () => {
  return Array.from(callSessions.values());
};