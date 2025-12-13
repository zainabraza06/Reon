import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  // Participants
  caller: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  receiver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Chat reference
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chat' 
  },
  
  // Call details
  roomName: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  
  callType: { 
    type: String, 
    enum: ['audio', 'video'], 
    default: 'video',
    required: true 
  },
  
  // Call lifecycle
  status: { 
    type: String, 
    enum: [
      'calling',      // Call initiated
      'ringing',      // Receiver notified
      'ongoing',      // Call active
      'ended',        // Completed
      'missed',       // No answer
      'rejected',     // Declined
      'failed',       // Tech failure
      'busy'          // Receiver busy
    ],
    default: 'calling'
  },
  
  // Timestamps
  startTime: Date,
  endTime: Date,
  
  // Duration in seconds
  duration: { 
    type: Number, 
    default: 0 
  },
  
  // Media states
  hasRecording: { 
    type: Boolean, 
    default: false 
  },
  recordingUrl: String,
  
  // Device info
  callerDevice: String,
  receiverDevice: String,
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update timestamp
callSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });
callSchema.index({ status: 1 });


const Call = mongoose.model('Call', callSchema);
export default Call;