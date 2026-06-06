import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  getNotifications,
  createNotification,
  markRead,
  markAllRead,
  deleteNotification,
  clearNotifications,
} from "../controllers/notification.controller.js";

const router = express.Router();
router.use(protectRoute);

router.get("/",            getNotifications);
router.post("/",           createNotification);
router.patch("/read-all",  markAllRead);
router.patch("/:id/read",  markRead);
router.delete("/",         clearNotifications);
router.delete("/:id",      deleteNotification);

export default router;
