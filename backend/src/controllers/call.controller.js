import Call from '../models/Call.js';
import livekitService from '../lib/livekitService.js';

/**
 * Call Controller
 */
export const initiateCall = async (req, res) => {
  try {
    const { receiverId, callType } = req.body;
    const callerId = req.userId;
    
    if (!receiverId) {
      return res.status(400).json({
        success: false,
        error: 'Receiver ID is required'
      });
    }

    if (!callType || !['audio', 'video'].includes(callType)) {
      return res.status(400).json({
        success: false,
        error: 'Valid call type (audio/video) is required'
      });
    }

    // Generate room name
    const roomName = livekitService.generateRoomName(callerId, receiverId, callType);
    
    // Create call record
    const call = new Call({
      caller: callerId,
      receiver: receiverId,
      roomName,
      callType,
      status: 'calling'
    });
    
    await call.save();

    res.status(201).json({
      success: true,
      data: {
        call: {
          _id: call._id,
          roomName: call.roomName,
          callType: call.callType,
          status: call.status,
          createdAt: call.createdAt
        }
      },
      message: 'Call initiated successfully'
    });
  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate call'
    });
  }
};

export const getCallToken = async (req, res) => {
  try {
    const { roomName } = req.body;
    const userId = req.userId;
    const userName = req.user?.username || 'User';
    
    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: 'Room name is required'
      });
    }

    const token = livekitService.generateToken(
      roomName,
      userId.toString(),
      userName
    );

    res.status(200).json({
      success: true,
      data: {
        token,
        roomName,
        wsUrl: process.env.LIVEKIT_HOST
      }
    });
  } catch (error) {
    console.error('Error generating call token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate call token'
    });
  }
};

export const acceptCall = async (req, res) => {
  try {
    const { callId } = req.body;
    
    if (!callId) {
      return res.status(400).json({
        success: false,
        error: 'Call ID is required'
      });
    }

    const call = await Call.findByIdAndUpdate(
      callId,
      { 
        status: 'ongoing',
        startTime: new Date()
      },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        call: {
          _id: call._id,
          roomName: call.roomName,
          status: call.status,
          startTime: call.startTime
        }
      },
      message: 'Call accepted successfully'
    });
  } catch (error) {
    console.error('Error accepting call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept call'
    });
  }
};

export const endCall = async (req, res) => {
  try {
    const { callId } = req.body;
    
    if (!callId) {
      return res.status(400).json({
        success: false,
        error: 'Call ID is required'
      });
    }

    const call = await Call.findById(callId);
    
    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    const endTime = new Date();
    const duration = call.startTime 
      ? Math.floor((endTime - call.startTime) / 1000) 
      : 0;
    
    call.status = 'ended';
    call.endTime = endTime;
    call.duration = duration;
    await call.save();
    
    // Optionally end the LiveKit room
    await livekitService.endRoom(call.roomName);

    res.status(200).json({
      success: true,
      data: {
        call: {
          _id: call._id,
          status: call.status,
          duration: call.duration,
          endTime: call.endTime
        }
      },
      message: 'Call ended successfully'
    });
  } catch (error) {
    console.error('Error ending call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end call'
    });
  }
};

export const rejectCall = async (req, res) => {
  try {
    const { callId } = req.body;
    
    if (!callId) {
      return res.status(400).json({
        success: false,
        error: 'Call ID is required'
      });
    }

    const call = await Call.findByIdAndUpdate(
      callId, 
      { status: 'rejected' },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Call rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject call'
    });
  }
};

export const getCallHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 50, page = 1 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const calls = await Call.find({
      $or: [{ caller: userId }, { receiver: userId }]
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('caller', 'username fullName profilePic')
    .populate('receiver', 'username fullName profilePic');
    
    const total = await Call.countDocuments({
      $or: [{ caller: userId }, { receiver: userId }]
    });

    res.status(200).json({
      success: true,
      data: {
        calls: calls.map(call => ({
          _id: call._id,
          roomName: call.roomName,
          callType: call.callType,
          status: call.status,
          duration: call.duration,
          startTime: call.startTime,
          endTime: call.endTime,
          createdAt: call.createdAt,
          caller: {
            _id: call.caller._id,
            username: call.caller.username,
            fullName: call.caller.fullName,
            profilePic: call.caller.profilePic
          },
          receiver: {
            _id: call.receiver._id,
            username: call.receiver.username,
            fullName: call.receiver.fullName,
            profilePic: call.receiver.profilePic
          }
        })),
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching call history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch call history'
    });
  }
};

// Export as default as well
const callController = {
  initiateCall,
  getCallToken,
  acceptCall,
  endCall,
  rejectCall,
  getCallHistory
};

export default callController;