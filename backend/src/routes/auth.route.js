// src/routes/auth.route.js
import express from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { protectRoute } from "../middlewares/auth.middleware.js";
import { profileUpload } from "../middlewares/profileUpload.js";


import {
  signup,
  login,
  logout,
  verifyEmail,
  forgotPassword,
  resetForgotPassword,
  googleCallback,
  googleMobileAuth,
  onboard,
  getMe, UserDetails
} from "../controllers/auth.controller.js";

import {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  onboardValidator,
} from "../middlewares/validators.js";

import "../utils/passport.js";

const router = express.Router();

// Rate limiter for brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many attempts. Try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 📝 SIGNUP
router.post("/signup", authLimiter, validateSignup,  signup);

// 🔐 LOGIN
router.post("/login", authLimiter, validateLogin, login);

// 🚪 LOGOUT
router.post("/logout", logout);



// ✅ VERIFY EMAIL
router.get("/verify-email", verifyEmail);

// 🔄 FORGOT PASSWORD
router.post("/forgot-password", validateForgotPassword,  forgotPassword);

router.get("/details/:userId", UserDetails);

// 🔁 RESET PASSWORD
router.post("/forgot-password/reset", validateResetPassword,  resetForgotPassword);

// 🧭 ONBOARDING (protected)
router.post(
  "/onboard",
  protectRoute,
  profileUpload.single("profilePic"),
  onboardValidator,
  onboard
);

// 🌐 GOOGLE OAUTH
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: false }),
  googleCallback
);


// 📱 GOOGLE SIGN-IN (mobile — accepts Google ID token from google_sign_in Flutter pkg)
router.post("/google-mobile", googleMobileAuth);

router.get("/me" , protectRoute,getMe);
export default router;
