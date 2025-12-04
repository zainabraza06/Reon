// models/PublicKey.js
import mongoose from "mongoose";

const publicKeySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    unique: true
  },
  publicKey: {
    type: Object, // JsonWebKey
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("PublicKey", publicKeySchema);
