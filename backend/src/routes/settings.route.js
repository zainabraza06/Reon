

import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middlewares/auth.middleware.js";
import { profileUpload } from "../middlewares/profileUpload.js";
import {updateProfile, changePassword} from "../controllers/settings.controller.js";
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



export default router;