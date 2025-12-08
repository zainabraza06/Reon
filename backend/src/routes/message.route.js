import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middlewares/auth.middleware.js";

import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';





// Controllers
import {
  sendMessage,
  getMessages,

  getUserForSideBar,
  searchUsers,downloadEncryptedFile, markMessageAsDelivered, markMessageAsRead, serveMediaFile
} from "../controllers/message.controller.js";


// Configure multer for memory storage (or disk if preferred)


const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,   // 100MB file limit
    fieldSize: 50 * 1024 * 1024,  // ✅ 50MB text field limit (IMPORTANT)
    fields: 20                    // optional: number of text fields
  }
});



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


// Update your route to use multer middleware
router.post('/send', 
  upload.array('media', 10), // Handle up to 10 files in 'media' field
  sendMessage
);

router.get('/media/:id', serveMediaFile);

// Download files
router.get('/files/:id', downloadEncryptedFile);

// Mark message as delivered/seen
router.post('/mark-read',  markMessageAsRead);
router.post('/mark-delivered', markMessageAsDelivered);

// Sidebar chat list
router.get("/sidebar/list", getUserForSideBar);

/* ------------------ USER SEARCH ------------------ */

router.get("/search", searchUsers);



// Get messages between two users
router.get("/:receiverId", getMessages);

export default router;
