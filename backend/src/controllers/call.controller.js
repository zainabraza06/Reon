import crypto from "crypto";
import User from "../models/User.js";
import { isUserOnline } from "./lib/socket.js";
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