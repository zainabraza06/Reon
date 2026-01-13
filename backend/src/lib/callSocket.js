import jwt from "jsonwebtoken";
import User from "../models/User.js";
  import { getUserActiveCalls } from "../utils/callStore.js";
import { 
  getSession, 
  updateStatus, 
  assertParticipant, 
  endSession 
} from "../utils/callStore.js";
import { validateKeyEnvelope } from "../utils/callKeyExchange.js";

// Token extraction helper
const getToken = (socket) => {
  const authToken = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (authToken) return authToken;
  
  const header = socket.handshake.headers?.authorization;
  if (header?.startsWith("Bearer ")) return header.split(" ")[1];
  
  const cookie = socket.handshake.headers?.cookie;
  if (cookie) {
    const tokenCookie = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="));
    if (tokenCookie) return tokenCookie.split("token=")[1];
  }
  
  return null;
};

// Utility function for logging
const logCallEvent = (event, data, userId) => {
  console.log(`📞 [${event}] from ${userId}:`, {
    callId: data.callId,
    reason: data.reason || data.trackType || 'N/A',
    timestamp: new Date().toISOString()
  });
};

const emitToPeer = (nsp, callId, fromUserId, event, payload) => {
  const session = getSession(callId);
  if (!session) {
    console.log(`❌ Cannot emit ${event}: session ${callId} not found`);
    return;
  }
  
  const target = session.fromUserId === fromUserId.toString()
    ? session.toUserId
    : session.fromUserId;
  
  console.log(`📤 Emitting ${event} to ${target} for call ${callId}`);
  nsp.to(target).emit(event, payload);
};

export const initCallNamespace = (io) => {
  const nsp = io.of("/calls");

  nsp.use(async (socket, next) => {
    try {
      const token = getToken(socket);
      if (!token) return next(new Error("auth_required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("_id fullName");
      if (!user) return next(new Error("user_not_found"));

      socket.user = user;
      socket.join(user._id.toString());
      console.log(`✅ User ${user._id} connected to calls namespace`);
      return next();
    } catch (err) {
      console.error("Auth error in calls namespace:", err.message);
      return next(new Error("auth_failed"));
    }
  });

  nsp.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    console.log(`👤 User ${userId} connected to calls socket`);

    const ensureAuthorized = (callId) => {
      const session = getSession(callId);
      if (!session) {
        console.log(`❌ Session ${callId} not found for user ${userId}`);
        return { ok: false, status: "not_found" };
      }
      
      if (!assertParticipant(callId, userId)) {
        console.log(`❌ User ${userId} not authorized for call ${callId}`);
        return { ok: false, status: "forbidden" };
      }
      
      return { ok: true, session };
    };

    // --- WEBRTC SIGNALING EVENTS ---

    socket.on("call:offer", ({ callId, offer, type = "audio" }) => {
      logCallEvent('call:offer', { callId, type }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      console.log(`📞 [OFFER-IN] Received from ${userId}, offer length: ${offer ? offer.length : 0}, type: ${type}`);
      
      updateStatus(callId, "connecting");
      
      const payload = {
        callId, 
        offer,
        fromUserId: userId,
        type,
        timestamp: Date.now()
      };
      
      console.log(`📤 [OFFER-OUT] Forwarding to peer, offer length: ${offer ? offer.length : 0}`);
      emitToPeer(nsp, callId, userId, "call:offer", payload);
    });

    socket.on("call:answer", ({ callId, answer }) => {
      logCallEvent('call:answer', { callId }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      console.log(`📞 [ANSWER-IN] Received from ${userId}, answer length: ${answer ? answer.length : 0}`);
      
      updateStatus(callId, "connected");
      
      const payload = { 
        callId, 
        answer,
        fromUserId: userId,
        timestamp: Date.now()
      };
      
      console.log(`📤 [ANSWER-OUT] Forwarding to peer, answer length: ${answer ? answer.length : 0}`);
      emitToPeer(nsp, callId, userId, "call:answer", payload);
    });

    socket.on("call:candidate", ({ callId, candidate }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok || !candidate) return;
      
      emitToPeer(nsp, callId, userId, "call:candidate", { 
        callId, 
        candidate,
        timestamp: Date.now()
      });
    });

    socket.on("call:ice-restart", ({ callId, offer }) => {
      logCallEvent('call:ice-restart', { callId }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      emitToPeer(nsp, callId, userId, "call:ice-restart", { 
        callId, 
        offer,
        timestamp: Date.now()
      });
    });

    socket.on("call:key-exchange", (payload) => {
      if (!payload || !validateKeyEnvelope(payload)) {
        console.error(`❌ Invalid key exchange payload from ${userId}`);
        return;
      }
      
      const auth = ensureAuthorized(payload.callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId: payload.callId, reason: auth.status });
        return;
      }
      
      logCallEvent('call:key-exchange', payload, userId);
      emitToPeer(nsp, payload.callId, userId, "call:key-exchange", payload);
    });

    // --- CALL CONTROL EVENTS ---

    socket.on("call:reject", ({ callId, reason = "user-rejected" }) => {
      logCallEvent('call:reject', { callId, reason }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      updateStatus(callId, "rejected");
      emitToPeer(nsp, callId, userId, "call:reject", { 
        callId, 
        reason,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        endSession(callId, "rejected");
      }, 100);
    });

    socket.on("call:busy", ({ callId, reason = "busy" }) => {
      logCallEvent('call:busy', { callId, reason }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      updateStatus(callId, "busy");
      emitToPeer(nsp, callId, userId, "call:busy", { 
        callId, 
        reason,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        endSession(callId, "busy");
      }, 100);
    });

    socket.on("call:hangup", ({ callId, reason = "hangup" }) => {
      logCallEvent('call:hangup', { callId, reason }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      updateStatus(callId, "ended");
      emitToPeer(nsp, callId, userId, "call:hangup", { 
        callId, 
        reason,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        endSession(callId, reason);
      }, 100);
    });

    // --- MEDIA CONTROL EVENTS ---

    socket.on("call:track:update", ({ callId, trackType, enabled }) => {
      logCallEvent('call:track:update', { callId, trackType, enabled }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      emitToPeer(nsp, callId, userId, "call:track:update", { 
        callId, 
        trackType, 
        enabled,
        timestamp: Date.now()
      });
    });

    socket.on("call:screenshare:update", ({ callId, isSharing }) => {
      logCallEvent('call:screenshare:update', { callId, isSharing }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      emitToPeer(nsp, callId, userId, "call:screenshare:update", { 
        callId, 
        isSharing,
        timestamp: Date.now()
      });
    });

    // Connection health check
    socket.on("call:ping", ({ callId }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      socket.emit("call:pong", { 
        callId,
        timestamp: Date.now()
      });
    });

    // --- DISCONNECT HANDLER ---

    socket.on("disconnect", () => {
      console.log(`👤 User ${userId} disconnected from calls socket`);
      
      // Find any active call this user is in and notify the other participant

const userCalls = getUserActiveCalls(userId);
      
      userCalls.forEach(session => {
        if (session && session.status === "connected") {
          const otherUserId = session.fromUserId === userId 
            ? session.toUserId 
            : session.fromUserId;
          
          nsp.to(otherUserId).emit("call:hangup", {
            callId: session.callId,
            reason: "peer-disconnected",
            timestamp: Date.now()
          });
          
          endSession(session.callId, "peer-disconnected");
        }
      });
    });
  });

  nsp.on("connect_error", (err) => {
    console.error("Call namespace connection error:", err.message);
  });

  return nsp;
};