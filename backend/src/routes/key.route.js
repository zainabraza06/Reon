// routes/publicKey.routes.js
import express from "express";
import { uploadPublicKey, getPublicKey } from "../controllers/key.controller.js";

const router = express.Router();

// Upload user's public RSA key
router.post("/uploadPublicKey", uploadPublicKey);

// Get recipient's public RSA key
router.get("/publicKey/:userId", getPublicKey);

export default router;
