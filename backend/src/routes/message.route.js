import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middlewares/auth.middleware.js";



// Controllers
import {
  sendMessage,
  getMessages,
  ackMessage,
  getUserForSideBar,
  searchUsers
} from "../controllers/message.controller.js";

// Multer for media uploads
import upload from "../middlewares/chatUpload.js";

const router = express.Router();

// Protect all routes
router.use(protectRoute);

// Rate limit (optional)
const Limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many requests, slow down a little 🐌"
});

/* ------------------ MESSAGING ROUTES ------------------ */

// Send a message (supports text + media)
router.post(
  "/send",
  upload.array("media"), // handle files
  sendMessage
);


// Mark message as delivered/seen
router.patch("/ack/:id", ackMessage);

// Sidebar chat list
router.get("/sidebar/list", getUserForSideBar);

/* ------------------ USER SEARCH ------------------ */

router.get("/search", searchUsers);



// Get messages between two users
router.get("/:receiverId", getMessages);

export default router;
