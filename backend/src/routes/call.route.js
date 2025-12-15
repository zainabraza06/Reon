import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  createCallSession,
  getCallSession,
  getTurnCredentialsForCall
} from "../controllers/call.controller.js";

const router = express.Router();

router.use(protectRoute);

// Create a new call session (caller initiates)
router.post("/", createCallSession);

// Fetch call session metadata (participants can poll)
router.get("/:callId", getCallSession);

// Optional: fetch TURN credentials for a call
router.get("/:callId/turn", getTurnCredentialsForCall);

export default router;

