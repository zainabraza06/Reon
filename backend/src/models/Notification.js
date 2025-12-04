// src/models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // receiver
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who triggered
  type: { type: String, enum: ["friend_request", "friend_accept", "message"], required: true },
  message: { type: String, required: true },
  link: { type: String }, // optional URL to redirect user
  read: { type: Boolean, default: false },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
