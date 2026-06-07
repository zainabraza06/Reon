

import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middlewares/auth.middleware.js";
import { profileUpload } from "../middlewares/profileUpload.js";
import {updateProfile, changePassword, updatePrivacy} from "../controllers/settings.controller.js";
import { updateProfileValidator, changePasswordValidator } from "../middlewares/validators.js";


const router =express.Router();
// Limit to 5 requests per minute per IP
const SettingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: "Too many profile update requests from this IP, please try again later"
});

router.put(
  "/profile",
  protectRoute,
  SettingLimiter, // <-- add rate limiter here
  profileUpload.single("profilePic"),
  updateProfileValidator,
  updateProfile
);


router.put(
  "/change-password",
  protectRoute,
  SettingLimiter,
  changePasswordValidator,
  changePassword
);



router.patch("/privacy", protectRoute, updatePrivacy);

router.put("/fcm-token", protectRoute, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ message: "fcmToken required" });
    const User = (await import("../models/User.js")).default;
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    res.json({ message: "FCM token saved" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;