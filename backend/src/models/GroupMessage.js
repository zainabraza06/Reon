import mongoose from 'mongoose';

const groupMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  ciphertext: { type: String, required: true },
  type: { type: String, enum: ['prekey', 'ratcheted'], default: 'ratcheted' },
  media: [
    {
      url: String,
      type: { type: String, enum: ['image', 'video', 'audio', 'document'] },
      encryptedKeys: {} // { userId: encryptedAESKey }
    }
  ],
  sentAt: { type: Date, default: Date.now }
});

export default mongoose.model('GroupMessage', groupMessageSchema);
