import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getUserActiveCalls } from "../utils/callStore.js";
import {
  getSession,
  updateStatus,
  assertParticipant,
  endSession,
} from "../utils/callStore.js";

const getToken = (socket) => {
  const authToken = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (authToken) return authToken;
  const header = socket.handshake.headers?.authorization;
  if (header?.startsWith("Bearer ")) return header.split(" ")[1];
  const cookie = socket.handshake.headers?.cookie;
  if (cookie) {
    const tokenCookie = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("token="));
    if (tokenCookie) return tokenCookie.split("token=")[1];
  }
  return null;
};

const emitToPeer = (nsp, callId, fromUserId, event, payload) => {
  const session = getSession(callId);
  if (!session) return;
  const target = session.fromUserId === fromUserId.toString() ? session.toUserId : session.fromUserId;
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
      return next();
    } catch (err) {
      console.error("Auth error in calls namespace:", err.message);
      return next(new Error("auth_failed"));
    }
  });

  nsp.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    const ensureAuthorized = (callId) => {
      const session = getSession(callId);
      if (!session) return { ok: false };
      if (!assertParticipant(callId, userId)) return { ok: false };
      return { ok: true, session };
    };

    // ── Ring / accept / reject / hangup ─────────────────────────────────────
    // (Metered handles the actual WebRTC media — we only do signaling here)

    socket.on("call:reject", ({ callId, reason = "user-rejected" }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "rejected");
      emitToPeer(nsp, callId, userId, "call:reject", { callId, reason, timestamp: Date.now() });
      setTimeout(() => endSession(callId, "rejected"), 100);
      console.log(`📞 [REJECT] callId=${callId} by ${userId}`);
    });

    socket.on("call:busy", ({ callId, reason = "busy" }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "busy");
      emitToPeer(nsp, callId, userId, "call:busy", { callId, reason, timestamp: Date.now() });
      setTimeout(() => endSession(callId, "busy"), 100);
    });

    socket.on("call:hangup", ({ callId, reason = "hangup" }) => {
      const auth = ensureAuthorized(callId);
      if (!auth.ok) return;
      updateStatus(callId, "ended");
      emitToPeer(nsp, callId, userId, "call:hangup", { callId, reason, timestamp: Date.now() });
      setTimeout(() => endSession(callId, reason), 100);
      console.log(`📞 [HANGUP] callId=${callId} by ${userId}`);
    });

    // ── Disconnect ───────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      const userCalls = getUserActiveCalls(userId);
      userCalls.forEach((session) => {
        if (session && session.status === "connected") {
          const otherUserId = session.fromUserId === userId ? session.toUserId : session.fromUserId;
          nsp.to(otherUserId).emit("call:hangup", {
            callId: session.callId,
            reason: "peer-disconnected",
            timestamp: Date.now(),
          });
          endSession(session.callId, "peer-disconnected");
        }
      });
    });
  });

  return nsp;
};
