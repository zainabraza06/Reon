import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  getRecommendedFriends,
  getMyFriends,
  sendFriendRequest,
  getReceivedRequests,
  getSentRequests,
  acceptFriendRequest,
  withdrawFriendRequest,
  getPendingFriendRequestsCount,
  rejectFriendRequest,
  removeFriend
} from "../controllers/friend.controller.js";

const router = express.Router();
router.use(protectRoute);

// Rate limiter for friend actions (bypassed in test environment)
const friendLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 1 * 60 * 1000,
      max: 15,
      message: "Too many friend requests/actions from this IP, please try again later",
    });

// FRIEND RECOMMENDATIONS & FRIENDS 
router.get("/recommendation", getRecommendedFriends);
router.get("/friends", getMyFriends);
router.patch("/friends/:id", removeFriend);

// FRIEND REQUEST ACTIONS 
router.post("/friend-request/:id", friendLimiter, sendFriendRequest);
router.post("/friend-request/:id/accept", friendLimiter, acceptFriendRequest);
router.post("/friend-request/:id/withdraw", friendLimiter, withdrawFriendRequest);

//  FRIEND REQUEST LISTS 
router.get("/friend-requests/received", getReceivedRequests);
router.get("/friend-requests/sent", getSentRequests);
router.get("/friend-request/pending-count",getPendingFriendRequestsCount);
router.delete('/friend-request/:id', rejectFriendRequest);

export default router;
