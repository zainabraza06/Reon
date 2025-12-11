// models/Message.js
import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  url: String,
  type: { type: String, enum: ["image", "video", "audio", "document"] },
  encryptedKey: String,
  senderEncryptedKey: String // ⭐ NEW: For sender's own decryption
});

// In models/Message.js, update the schema:
const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ciphertext: { type: String },
  type: { type: String, enum: ["prekey", "ratcheted"], default: "ratcheted" },
  contentType: { type: String, enum: ["text", "image", "audio", "video", "document"], default: "text" },
  encryptedKey: { type: String },
  senderEncryptedKey: { type: String },
  media: [mediaSchema],
  sentAt: { type: Date, default: Date.now },
  delivered: { type: Boolean, default: false },
  deliveredAt: { type: Date }, // Track when delivered
  read: { type: Boolean, default: false },
  readAt: { type: Date } // Track when read
});
export default mongoose.model("Message", messageSchema);