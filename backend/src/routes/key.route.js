// routes/publicKey.routes.js
import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  uploadPublicKey,
  getPublicKey,
  createLinkSession,
  claimLinkSession,
  transferLinkKey,
  getLinkSession,
} from "../controllers/key.controller.js";

const router = express.Router();

// Upload user's public RSA key
router.post("/uploadPublicKey", uploadPublicKey);

// Get recipient's public RSA key
router.get("/publicKey/:userId", getPublicKey);

// Device-linking session (all require auth)
router.post("/link-session/create",              protectRoute, createLinkSession);
router.put("/link-session/:sessionId/claim",     protectRoute, claimLinkSession);
router.put("/link-session/:sessionId/transfer",  protectRoute, transferLinkKey);
router.get("/link-session/:sessionId",           protectRoute, getLinkSession);

export default router;
