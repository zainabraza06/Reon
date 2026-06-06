import crypto from "crypto";
import User from "../models/User.js";
import { isUserOnline, getIO } from "../lib/socket.js";
import { 
  createSession, 
  getSession, 
  updateStatus, 
  assertParticipant, 
  touchSession,
  isUserInCall
} from "../utils/callStore.js";
import { buildIceServers, testIceServers } from "../utils/turn.js";

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

    // Check if user is already in a call
    if (isUserInCall(fromUserId)) {
      return res.status(400).json({ 
        message: "You are already in a call. End the current call first." 
      });
    }

    // Basic existence check for callee
    const target = await User.findById(toUserId).select("_id fullName");
    if (!target) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    const caller = await User.findById(fromUserId).select("_id fullName username");
    if (!caller) {
      return res.status(404).json({ message: "Caller not found" });
    }

    // ── Generate Metered room name and URL ───────────────────────────────────
    const meteredDomain = process.env.METERED_DOMAIN;
    if (!meteredDomain) {
      return res.status(503).json({
        message: "Calling is not configured on this server. Set METERED_DOMAIN in the backend .env."
      });
    }

    const roomName = crypto.randomUUID();
    const roomURL = `${meteredDomain}/${roomName}`;

    const callId = crypto.randomUUID();
    const session = createSession({ callId, fromUserId, toUserId, type, icePolicy: "all", roomName, roomURL });

    // Check if callee is online
    const calleeIsOnline = isUserOnline(toUserId.toString());

    console.log(`📞 Call session created: ${callId}, from: ${fromUserId}, to: ${toUserId}, type: ${type}, roomName: ${roomName}, roomURL: ${roomURL}`);

    // Notify the callee via socket
    try {
      const io = getIO();
      const callNamespace = io.of("/calls");
      callNamespace.to(toUserId.toString()).emit("call:initiate", {
        callId,
        fromUserId: fromUserId.toString(),
        fromUserName: caller.fullName || caller.username || "Unknown",
        type,
        roomName,
        roomURL,
        timestamp: Date.now()
      });
      console.log(`📤 [CALL-INITIATE] Sent to ${toUserId.toString()}: callId=${callId}, roomName=${roomName}, roomURL=${roomURL}`);
    } catch (socketErr) {
      console.error(`❌ Failed to emit call:initiate to callee:`, socketErr.message);
    }

    return res.status(201).json({
      callId,
      type: session.type,
      roomName,
      roomURL,
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
      roomName: session.roomName,
      roomURL: session.roomURL,
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

// GET /api/calls/test/ice-servers
export const testIceServersEndpoint = async (req, res) => {
  try {
    const result = await testIceServers();
    return res.status(200).json({
      success: true,
      ...result,
      note: result.hasTurnServers ? 
        "TURN servers configured" : 
        "Using STUN only. Add TURN credentials for better NAT traversal."
    });
  } catch (error) {
    console.error("Error testing ICE servers:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch ICE servers" 
    });
  }
};

// Optional: mark status updates via signaling can reuse this helper
export const markCallStatus = (callId, status) => updateStatus(callId, status);