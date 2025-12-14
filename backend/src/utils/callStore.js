// Lightweight in-memory call session store.
// In production, move this to a durable store (Redis/DB) with eviction.
const CALL_TTL_MS = 20 * 60 * 1000; // 20 minutes

const callSessions = new Map(); // callId -> session

const cleanup = () => {
  const now = Date.now();
  for (const [callId, session] of callSessions.entries()) {
    if (session.expiresAt <= now) {
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
  return session;
};

export const getSession = (callId) => callSessions.get(callId);

export const updateStatus = (callId, status) => {
  const session = callSessions.get(callId);
  if (!session) return null;
  session.status = status;
  session.updatedAt = Date.now();
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
  return session;
};

export const assertParticipant = (callId, userId) => {
  const session = callSessions.get(callId);
  if (!session) return false;
  const uid = userId.toString();
  return session.fromUserId === uid || session.toUserId === uid;
};

export const endSession = (callId, reason = "ended") => {
  const session = callSessions.get(callId);
  if (!session) return null;
  session.status = reason;
  session.updatedAt = Date.now();
  callSessions.delete(callId);
  return session;
};

