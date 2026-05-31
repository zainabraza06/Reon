import express from "express";
import multer from "multer";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  createGroup, getMyGroups, getGroupById, updateGroup,
  addMembers, removeMember, promoteAdmin, deleteGroup,
  sendGroupMessage, getGroupMessages, markGroupMessagesRead,
  serveGroupMedia, downloadGroupFile,
} from "../controllers/groupChat.controller.js";

const router = express.Router();
router.use(protectRoute);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, fieldSize: 50 * 1024 * 1024, fields: 20 },
});

// Group CRUD
router.post("/", createGroup);
router.get("/", getMyGroups);
router.get("/:groupId", getGroupById);
router.put("/:groupId", updateGroup);
router.delete("/:groupId", deleteGroup);

// Member management
router.post("/:groupId/members", addMembers);
router.delete("/:groupId/members/:memberId", removeMember);
router.patch("/:groupId/admins/:memberId", promoteAdmin);

// Messaging
router.post("/:groupId/messages", upload.array("files", 10), sendGroupMessage);
router.get("/:groupId/messages", getGroupMessages);
router.put("/:groupId/read", markGroupMessagesRead);

// File serving (no auth required so <img> tags work)
router.get("/media/:id", serveGroupMedia);
router.get("/download/:id", downloadGroupFile);

export default router;
