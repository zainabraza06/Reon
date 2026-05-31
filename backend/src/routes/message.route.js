import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middlewares/auth.middleware.js";

import multer from 'multer';


// Controllers
import {
  sendMessage,
  getMessages,

  getUserForSideBar,
  searchUsers,downloadEncryptedFile,  markMessageAsRead, serveMediaFile,
  markChatAsRead
} from "../controllers/message.controller.js";


const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,   // 100MB file limit
    fieldSize: 50 * 1024 * 1024,  // 50MB text field limit 
    fields: 20                    // number of text fields
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


// Update your route to use multer middleware
router.post('/send', 
  upload.array('files', 10), // Handle up to 10 files in 'media' field
  sendMessage
);

router.get('/media/:id', serveMediaFile);
router.get('/download/:id', downloadEncryptedFile);
router.get('/files/:id', downloadEncryptedFile); // legacy alias

// Mark message as delivered/seen
router.post('/read/:messageId',  markMessageAsRead);
router.get("/sidebar/list", getUserForSideBar);
router.get("/search", searchUsers);
router.get("/:receiverId", getMessages);
router.put("/chat/read/:userId", markChatAsRead);

export default router;
