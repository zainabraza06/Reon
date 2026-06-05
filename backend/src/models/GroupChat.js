import mongoose from "mongoose";

const groupMediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  downloadUrl: { type: String },
  type: { type: String, enum: ["image", "video", "audio", "document", "blob"], required: true },
  fileName: { type: String },
  originalName: { type: String },
  fileSize: { type: Number },
  fileId: { type: String },
  // Each member gets their own encrypted copy of the AES key
  memberKeys: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    encryptedKey: { type: String }
  }],
  encryptionIV: { type: String },
  isEncrypted: { type: Boolean, default: true }
}, { _id: false });

const groupMessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "GroupChat", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ciphertext: { type: String },
  contentType: { type: String, enum: ["text", "image", "audio", "video", "document"], default: "text" },
  // AES key encrypted once per member (sender key distribution)
  memberKeys: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    encryptedKey: { type: String }
  }],
  media: [groupMediaSchema],
  sentAt: { type: Date, default: Date.now },
  readBy:     [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }],
  deliveredTo:[{ userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }],
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

groupMessageSchema.index({ groupId: 1, sentAt: -1 });

const groupChatSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: "", maxlength: 500 },
  avatar: { type: String, default: "" },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],
  lastMessage: {
    content: { type: String, default: "" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sentAt: { type: Date }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

groupChatSchema.index({ "members.user": 1 });

export const GroupChat = mongoose.model("GroupChat", groupChatSchema);
export const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);
