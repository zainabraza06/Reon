import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:   {
    type: String,
    enum: ["friend_request", "friend_accepted", "group_added", "group_removed", "new_message", "new_group_message"],
    required: true,
  },
  title:  { type: String, required: true },
  body:   { type: String, required: true },
  avatar: { type: String },
  link:   { type: String },
  read:   { type: Boolean, default: false },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
