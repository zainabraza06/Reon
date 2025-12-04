import express, { application } from "express";
import multer from "multer";
import { 
  createGroup,
  getMyGroups,
  getGroupDetails,
  sendGroupMessage,
  getGroupMessages,
  addGroupMembers,
  removeMember,
  leaveGroup,
  makeMemberAdmin,
  deleteGroup,
  updateGroupInfo
} from "../controllers/group.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js"; // Example auth middleware

const router = express.Router();
const upload = multer(); // For handling multipart/form-data (files)

router.use(protectRoute);

// ---- GROUP ROUTES ----

// Create a new group
router.post("/",  upload.single("profilePic"), createGroup);

// Get all groups of logged-in user
router.get("/",  getMyGroups);

// Get details of a single group
router.get("/:groupId",getGroupDetails);

// Send a message in a group (supports multiple files)
router.post("/message",  upload.array("media"), sendGroupMessage);

// Get group messages with pagination
router.get("/:groupId/messages",  getGroupMessages);

// Add members to a group
router.put("/:groupId/members",  addGroupMembers);

// Remove a member from a group
router.put("/:groupId/remove-member",  removeMember);

// Leave a group
router.put("/:groupId/leave", leaveGroup);

// Transfer admin role to a member
router.put("/:groupId/make-admin",  makeMemberAdmin);

// Delete a group
router.delete("/:groupId",  deleteGroup);

// Update group info (name or profile picture)
router.put("/:groupId", upload.single("profilePic"), updateGroupInfo);

export default router;
