import mongoose from "mongoose";

// ✅ UPDATED mediaSchema with all fields from your backend
const mediaSchema = new mongoose.Schema({
  // URL fields
  url: { type: String, required: true }, // Display URL: /api/messages/media/{id}
  downloadUrl: { type: String }, // Optional download URL
  
  // File metadata
  type: { 
    type: String, 
    enum: ["image", "video", "audio", "document", "blob"], 
    required: true 
  },
  fileName: { type: String },
  originalName: { type: String },
  fileSize: { type: Number },
  fileId: { type: String }, // GridFS file ID
  
  // Encryption data
  encryptedKey: { type: String }, // For receiver
  senderEncryptedKey: { type: String }, // For sender
  encryptionIV: { type: String }, // ✅ CRITICAL: For AES-GCM decryption
  isEncrypted: { type: Boolean, default: true }
}, { _id: false });

// ✅ UPDATED messageSchema (merged both versions)
const messageSchema = new mongoose.Schema({
  // User references
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  receiver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  // Text encryption
  ciphertext: { type: String },
  type: { 
    type: String, 
    enum: ["prekey", "ratcheted"], 
    default: "ratcheted" 
  },
  contentType: { 
    type: String, 
    enum: ["text", "image", "audio", "video", "document", "call-log"], 
    default: "text" 
  },
  encryptedKey: { type: String }, // For receiver's text decryption
  senderEncryptedKey: { type: String }, // For sender's text decryption
  
  // Media
  media: [mediaSchema],
  
  // Timestamps and status
  sentAt: { type: Date, default: Date.now },
  delivered: { type: Boolean, default: false },
  deliveredAt: { type: Date },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  
  // Additional fields from your backend response
  status: { 
    type: String, 
    enum: ["sent", "delivered", "read"], 
    default: "sent" 
  },
  isVoiceMessage: { type: Boolean, default: false }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Create indexes for faster queries
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ sentAt: -1 });
messageSchema.index({ delivered: 1 });
messageSchema.index({ read: 1 });
messageSchema.index({ status: 1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;