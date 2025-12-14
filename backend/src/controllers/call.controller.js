import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  getSession,
  assertParticipant,
  updateStatus,
  endSession,
  incrementIceRestart
} from "../utils/callStore.js";
import { validateKeyEnvelope } from "../utils/callKeyExchange.js";

const EVENT_LIST = [
  "call:initiate",
  "call:ringing",
  "call:offer",
  "call:answer",
  "call:candidate",
  "call:ice-restart",
  "call:reject",
  "call:busy",
  "call:missed",
  "call:hangup",
  "call:key-exchange"
];

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
      return next();
    } catch (err) {
      return next(new Error("auth_failed"));
    }
  });

  const emitToPeer = (callId, fromUserId, event, payload) => {
    const session = getSession(callId);
    if (!session) return;
    const target =
      session.fromUserId === fromUserId.toString()
        ? session.toUserId
        : session.fromUserId;
    nsp.to(target).emit(event, payload);
  };

  nsp.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    const ensureAuthorized = (callId) => {
      const session = getSession(callId);
      if (!session) return { ok: false, status: "not_found" };
      if (!assertParticipant(callId, userId)) return { ok: false, status: "forbidden" };
      return { ok: true, session };
    };

    socket.on("call:initiate", (data = {}) => {
      const { callId, toUserId, type } = data;
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
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "ringing");
      emitToPeer(callId, userId, "call:ringing", { callId });
    });

    socket.on("call:offer", ({ callId, sdp }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "connecting");
      emitToPeer(callId, userId, "call:offer", { callId, sdp });
    });

    socket.on("call:answer", ({ callId, sdp }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "connected");
      emitToPeer(callId, userId, "call:answer", { callId, sdp });
    });

    socket.on("call:candidate", ({ callId, candidate }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok || !candidate) return;
      emitToPeer(callId, userId, "call:candidate", { callId, candidate });
    });

    socket.on("call:ice-restart", ({ callId, offer }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      incrementIceRestart(callId);
      emitToPeer(callId, userId, "call:ice-restart", { callId, offer });
    });

    socket.on("call:key-exchange", (payload) => {
      if (!payload) return;
      if (!validateKeyEnvelope(payload)) return;
      const auth = ensureAuthorized(payload.callId);
      if (!auth.ok) return;
      // Do not log or inspect the encryptedKeyBlob
      emitToPeer(payload.callId, userId, "call:key-exchange", payload);
    });

    socket.on("call:reject", ({ callId, reason = "rejected" }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "rejected");
      emitToPeer(callId, userId, "call:reject", { callId, reason });
      endSession(callId, "rejected");
    });

    socket.on("call:busy", ({ callId, reason = "busy" }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "busy");
      emitToPeer(callId, userId, "call:busy", { callId, reason });
      endSession(callId, "busy");
    });

    socket.on("call:missed", ({ callId }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "missed");
      emitToPeer(callId, userId, "call:missed", { callId });
      endSession(callId, "missed");
    });

    socket.on("call:hangup", ({ callId, reason = "hangup" }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "ended");
      emitToPeer(callId, userId, "call:hangup", { callId, reason });
      endSession(callId, reason);
    });

    socket.on("disconnect", () => {
      // Let peer handle reconnect; no action required here.
    });
  });

  // For debugging purposes only: list supported events
  nsp.on("connect_error", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Call namespace connection error:", err.message);
    }
  });

  return nsp;
};

