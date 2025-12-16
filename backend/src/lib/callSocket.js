import crypto from "crypto";
import User from "../models/User.js";
import {
  createSession,
  getSession,
  updateStatus,
  assertParticipant,
  touchSession,
  endSession
} from "../utils/callStore.js";
import { buildIceServers } from "../utils/turn.js";
import { isUserOnline } from "../lib/socket.js";

// POST /api/calls
export const createCallSession = async (req, res) => {
  try {
    const fromUserId = req.user._id;
    const { toUserId, type = "audio" } = req.body || {};

    if (!toUserId) {
      return res.status(400).json({ message: "toUserId is required" });
    }

    if (fromUserId.toString() === toUserId.toString()) {
      return res.status(400).json({ message: "Cannot call yourself" });
    }

    // Basic existence check for callee
    const target = await User.findById(toUserId).select("_id");
    if (!target) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    const callId = crypto.randomUUID();
    const session = createSession({
      callId,
      fromUserId,
      toUserId,
      type,
      icePolicy: "all"
    });

    const iceServers = await buildIceServers();
    
    // Check if callee is online
    const calleeIsOnline = isUserOnline(toUserId.toString());

    console.log(`📞 Call session created: ${callId}, from: ${fromUserId}, to: ${toUserId}, type: ${type}`);

    return res.status(201).json({
      callId,
      type: session.type,
      iceServers,
      iceTransportPolicy: session.icePolicy,
      status: session.status,
      expiresAt: session.expiresAt,
      calleeStatus: calleeIsOnline ? "online" : "offline"
    });
  } catch (err) {
    console.error("createCallSession error:", err);
    return res.status(500).json({ message: "Server error creating call" });
  }
};

// GET /api/calls/:callId
export const getCallSession = async (req, res) => {
  try {
    const { callId } = req.params;
    const session = getSession(callId);
    if (!session) return res.status(404).json({ message: "Call not found" });

    if (!assertParticipant(callId, req.user._id)) {
      return res.status(403).json({ message: "Not a participant of this call" });
    }

    touchSession(callId);

    const iceServers = await buildIceServers();
    return res.status(200).json({
      callId,
      type: session.type,
      status: session.status,
      iceServers,
      iceTransportPolicy: session.icePolicy,
      updatedAt: session.updatedAt
    });
  } catch (err) {
    console.error("getCallSession error:", err);
    return res.status(500).json({ message: "Server error fetching call" });
  }
};

// GET /api/calls/:callId/turn
export const getTurnCredentialsForCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const session = getSession(callId);
    if (!session) return res.status(404).json({ message: "Call not found" });

    if (!assertParticipant(callId, req.user._id)) {
      return res.status(403).json({ message: "Not a participant of this call" });
    }

    const iceServers = await buildIceServers(true);
    return res.status(200).json({ iceServers });
  } catch (err) {
    console.error("getTurnCredentialsForCall error:", err);
    return res.status(500).json({ message: "Server error fetching TURN creds" });
  }
};

// Optional: mark status updates via signaling can reuse this helper
export const markCallStatus = (callId, status) => updateStatus(callId, status);

import jwt from "jsonwebtoken";
import { validateKeyEnvelope } from "../utils/callKeyExchange.js";

// Utility function for logging
const logCallEvent = (event, data, userId) => {
  console.log(`📞 [${event}] from ${userId}:`, {
    callId: data.callId,
    reason: data.reason || data.trackType || 'N/A',
    timestamp: new Date().toISOString()
  });
};

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

  const emitToPeer = (callId, fromUserId, event, payload) => {
    const session = getSession(callId);
    if (!session) {
      console.log(`❌ Cannot emit ${event}: session ${callId} not found`);
      return;
    }
    
    const target =
      session.fromUserId === fromUserId.toString()
        ? session.toUserId
        : session.fromUserId;
    
    console.log(`📤 Emitting ${event} to ${target} for call ${callId}`);
    nsp.to(target).emit(event, payload);
  };

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

    socket.on("call:initiate", (data = {}) => {
      const { callId, toUserId, type } = data;
      logCallEvent('call:initiate', data, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        socket.emit("call:error", { callId, reason: auth.status });
        return;
      }
      
      updateStatus(callId, "ringing");
      emitToPeer(callId, userId, "call:initiate", {
        callId,
        fromUserId: userId,
        toUserId,
        type
      });
    });

    socket.on("call:ringing", ({ callId }) => {
      logCallEvent('call:ringing', { callId }, userId);
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      updateStatus(callId, "ringing");
      emitToPeer(callId, userId, "call:ringing", { callId });
    });

    socket.on("call:offer", ({ callId, sdp }) => {
      logCallEvent('call:offer', { callId }, userId);
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      updateStatus(callId, "connecting");
      emitToPeer(callId, userId, "call:offer", { callId, sdp });
    });

    socket.on("call:answer", ({ callId, sdp }) => {
      logCallEvent('call:answer', { callId }, userId);
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      updateStatus(callId, "connected");
      emitToPeer(callId, userId, "call:answer", { callId, sdp });
    });

    socket.on("call:candidate", ({ callId, candidate }) => {
      // Don't log candidates to reduce noise
      const auth = ensureAuthorized(callId);
      if (!auth.ok || !candidate) return;
      
      emitToPeer(callId, userId, "call:candidate", { callId, candidate });
    });

    socket.on("call:ice-restart", ({ callId, offer }) => {
      logCallEvent('call:ice-restart', { callId }, userId);
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      // Implement ice restart logic in callStore.js
      emitToPeer(callId, userId, "call:ice-restart", { callId, offer });
    });

    socket.on("call:key-exchange", (payload) => {
      if (!payload) return;
      if (!validateKeyEnvelope(payload)) return;
      
      const auth = ensureAuthorized(payload.callId);
      if (!auth.ok) return;
      
      emitToPeer(payload.callId, userId, "call:key-exchange", payload);
    });

    socket.on("call:reject", ({ callId, reason = "user-rejected" }) => {
      logCallEvent('call:reject', { callId, reason }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) {
        console.log(`❌ Reject unauthorized: ${auth.status} for call ${callId}`);
        return;
      }
      
      console.log(`✅ Call ${callId} rejected by ${userId} with reason: ${reason}`);
      
      // Update status first
      updateStatus(callId, "rejected");
      
      // Notify the other participant
      emitToPeer(callId, userId, "call:reject", { 
        callId, 
        reason,
        timestamp: Date.now()
      });
      
      // End the session after a short delay to ensure message is delivered
      setTimeout(() => {
        endSession(callId, "rejected");
      }, 100);
    });

    socket.on("call:busy", ({ callId, reason = "busy" }) => {
      logCallEvent('call:busy', { callId, reason }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      updateStatus(callId, "busy");
      emitToPeer(callId, userId, "call:busy", { 
        callId, 
        reason,
        timestamp: Date.now()
      });
      
      // End session after notifying
      setTimeout(() => {
        endSession(callId, "busy");
      }, 100);
    });

    socket.on("call:missed", ({ callId }) => {
      logCallEvent('call:missed', { callId }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      updateStatus(callId, "missed");
      emitToPeer(callId, userId, "call:missed", { callId });
      endSession(callId, "missed");
    });

    socket.on("call:hangup", ({ callId, reason = "hangup" }) => {
      logCallEvent('call:hangup', { callId, reason }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      updateStatus(callId, "ended");
      emitToPeer(callId, userId, "call:hangup", { 
        callId, 
        reason,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        endSession(callId, reason);
      }, 100);
    });

    // NEW: Handle track updates for camera/mic toggle
    socket.on("call:track:update", ({ callId, trackType, enabled }) => {
      logCallEvent('call:track:update', { callId, trackType, enabled }, userId);
      
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      
      // Forward the track update to the other participant
      emitToPeer(callId, userId, "call:track:update", { 
        callId, 
        trackType, 
        enabled,
        timestamp: Date.now()
      });
    });

    socket.on("disconnect", () => {
      console.log(`👤 User ${userId} disconnected from calls socket`);
      // Clean up any pending calls for this user
      // You might want to implement this based on your callStore implementation
    });
  });

  // For debugging purposes only: list supported events
  nsp.on("connect_error", (err) => {
    console.error("Call namespace connection error:", err.message);
  });

  return nsp;
};