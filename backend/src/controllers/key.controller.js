// controllers/publicKeyController.js
import { randomUUID } from "crypto";
import PublicKey from "../models/PublicKey.js";
import { emitToUser } from "../lib/socket.js";

// ── In-memory link-session store (per process; fine for single-server) ────────
// sessionId → { userId, ecdhPublicKey_A, ecdhPublicKey_B?,
//               encryptedPrivateKey?, iv?, expiresAt }
const linkSessions = new Map();

// Upload user public key
export const uploadPublicKey = async (req, res) => {
  try {
    const { userId, publicKey } = req.body;
    console.log(publicKey);
    console.log("UserId:" , userId);

    if (!userId || !publicKey) {
      return res.status(400).json({ message: "userId and publicKey are required" });
    }

    await PublicKey.findOneAndUpdate(
      { userId },
      { publicKey },
      { upsert: true, new: true }
    );

    res.sendStatus(204);
  } catch (error) {
    console.error("Upload public key error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ── Device-linking session endpoints ─────────────────────────────────────────

// POST /keys/link-session/create  — Device A calls this first
export const createLinkSession = (req, res) => {
  const { ecdhPublicKey } = req.body;
  if (!ecdhPublicKey) return res.status(400).json({ message: "ecdhPublicKey required" });

  const sessionId = randomUUID().replace(/-/g, "").slice(0, 16); // 16-char hex
  const userId = req.user._id.toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min TTL

  linkSessions.set(sessionId, { userId, ecdhPublicKey_A: ecdhPublicKey, expiresAt });
  setTimeout(() => linkSessions.delete(sessionId), 5 * 60 * 1000);

  res.json({ sessionId });
};

// PUT /keys/link-session/:sessionId/claim  — Device B calls this after scanning QR
export const claimLinkSession = (req, res) => {
  const session = linkSessions.get(req.params.sessionId);
  if (!session || Date.now() > session.expiresAt)
    return res.status(404).json({ message: "Session not found or expired" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ message: "Unauthorized" });

  session.ecdhPublicKey_B = req.body.ecdhPublicKey;

  // Tell Device A that Device B is ready and share Device B's ECDH public key
  emitToUser(session.userId, "device-link-claimed", {
    sessionId: req.params.sessionId,
    ecdhPublicKey_B: req.body.ecdhPublicKey,
  });

  res.json({ ecdhPublicKey_A: session.ecdhPublicKey_A });
};

// PUT /keys/link-session/:sessionId/transfer  — Device A uploads encrypted RSA private key
export const transferLinkKey = (req, res) => {
  const session = linkSessions.get(req.params.sessionId);
  if (!session || Date.now() > session.expiresAt)
    return res.status(404).json({ message: "Session not found or expired" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ message: "Unauthorized" });

  session.encryptedPrivateKey = req.body.encryptedPrivateKey;
  session.iv = req.body.iv;

  // Tell Device B the key is ready
  emitToUser(session.userId, "device-link-ready", { sessionId: req.params.sessionId });

  res.json({ ok: true });
};

// GET /keys/link-session/:sessionId  — Device B polls for the encrypted key
export const getLinkSession = (req, res) => {
  const session = linkSessions.get(req.params.sessionId);
  if (!session || Date.now() > session.expiresAt)
    return res.status(404).json({ message: "Session not found or expired" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ message: "Unauthorized" });

  res.json({
    status: session.encryptedPrivateKey ? "ready" : "pending",
    encryptedPrivateKey: session.encryptedPrivateKey ?? null,
    iv: session.iv ?? null,
  });
};

// ── Public key endpoints ──────────────────────────────────────────────────────

// Get recipient public key
export const getPublicKey = async (req, res) => {
  try {
    const { userId } = req.params;

    const keyRecord = await PublicKey.findOne({ userId });
    if (!keyRecord) return res.status(404).json({ message: "Public key not found" });

    res.json({ publicKey: keyRecord.publicKey });
  } catch (error) {
    console.error("Get public key error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
