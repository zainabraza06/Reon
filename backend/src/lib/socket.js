import { Server } from "socket.io";
import Message from "../models/Message.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Call from "../models/Call.js"; // Add Call model import
import * as messageController from "../controllers/message.controller.js";
import * as friendController from "../controllers/friend.controller.js";

let io;
const onlineUsers = new Map(); // userId → socketId (primary socket)
const userSockets = new Map(); // userId → Set(socketIds) for multiple devices
const typingUsers = new Map(); // Map of userId → { typingTo: userId, timestamp }
const heartbeatMap = new Map(); // userId → lastHeartbeat timestamp
const disconnectedDueToHeartbeat = new Set(); // Track users disconnected due to heartbeat timeout
const activeCalls = new Map(); // roomName → { participants: [userId1, userId2], callType, startTime }
const callRooms = new Map(); // userId → roomName (for quick lookup)

const HEARTBEAT_TIMEOUT = 15000; // 15 seconds (WhatsApp-like)
const HEARTBEAT_CHECK_INTERVAL = 5000; // Check every 5 seconds

// Track which messages have been processed for delivery during this session
const processedMessageDeliveries = new Map(); // userId → Set(messageIds)

// -------------------- TYPING INDICATORS --------------------
// Store typing status: userId → { typingTo: receiverId, timestamp: Date.now() }
const typingStatus = new Map(); // userId → typing data
const typingTimeouts = new Map(); // userId → timeout for auto-clear

// -------------------- CALL HANDLING FUNCTIONS --------------------
// Initialize a call room
const initCallRoom = (roomName, callerId, receiverId, callType) => {
  activeCalls.set(roomName, {
    participants: [callerId, receiverId],
    callerId,
    receiverId,
    callType,
    startTime: new Date(),
    status: 'ringing'
  });
  
  callRooms.set(callerId, roomName);
  callRooms.set(receiverId, roomName);
  
  console.log(`📞 Call room initialized: ${roomName}, Type: ${callType}`);
  return roomName;
};

// End a call room
const endCallRoom = (roomName) => {
  const call = activeCalls.get(roomName);
  if (call) {
    // Remove from callRooms
    callRooms.delete(call.callerId);
    callRooms.delete(call.receiverId);
    
    activeCalls.delete(roomName);
    console.log(`📞 Call room ended: ${roomName}`);
  }
};

// Check if user is in a call
const isUserInCall = (userId) => {
  return callRooms.has(userId);
};

// Get call info for user
const getUserCallInfo = (userId) => {
  const roomName = callRooms.get(userId);
  if (roomName) {
    return activeCalls.get(roomName);
  }
  return null;
};

// Clear typing status after timeout
const clearTypingStatus = (userId) => {
  if (typingStatus.has(userId)) {
    const typingData = typingStatus.get(userId);
    
    // Clear timeout
    if (typingTimeouts.has(userId)) {
      clearTimeout(typingTimeouts.get(userId));
      typingTimeouts.delete(userId);
    }
    
    // Remove typing status
    typingStatus.delete(userId);
    
    // Notify the receiver that typing stopped
    if (typingData.typingTo) {
      emitToUser(typingData.typingTo, "user-typing", {
        senderId: userId,
        receiverId: typingData.typingTo,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`⌨️ Auto-cleared typing status for user ${userId}`);
  }
};

// Handle typing start
const handleTypingStart = (senderId, receiverId, socketId) => {
  console.log(`⌨️ User ${senderId} started typing to ${receiverId}`);
  
  // Clear any existing timeout
  if (typingTimeouts.has(senderId)) {
    clearTimeout(typingTimeouts.get(senderId));
  }
  
  // Set typing status
  typingStatus.set(senderId, {
    typingTo: receiverId,
    socketId,
    timestamp: Date.now()
  });
  
  // Set auto-clear timeout (3 seconds of inactivity)
  const timeoutId = setTimeout(() => {
    clearTypingStatus(senderId);
  }, 3000);
  
  typingTimeouts.set(senderId, timeoutId);
  
  // Notify receiver
  emitToUser(receiverId, "user-typing", {
    senderId,
    receiverId,
    isTyping: true,
    timestamp: new Date().toISOString()
  });
};

// Handle typing stop
const handleTypingStop = (senderId, receiverId) => {
  console.log(`⌨️ User ${senderId} stopped typing to ${receiverId}`);
  
  // Clear typing status
  clearTypingStatus(senderId);
  
  // Notify receiver
  emitToUser(receiverId, "user-typing", {
    senderId,
    receiverId,
    isTyping: false,
    timestamp: new Date().toISOString()
  });
};

// Check if user is currently typing
export const isUserTyping = (userId) => {
  return typingStatus.has(userId);
};

// Get who a user is typing to
export const getUserTypingStatus = (userId) => {
  return typingStatus.get(userId);
};

// Clean up typing status on disconnect
const cleanupUserTyping = (userId) => {
  clearTypingStatus(userId);
};

// -------------------- EXISTING HELPER FUNCTIONS --------------------
// Helper function to simulate HTTP request/response pattern
const createSocketRequest = (socket, data) => {
  const user = socket.user || { _id: data?.sender || data?.userId };
  return {
    user: { _id: user._id },
    body: data,
    params: data,
    query: data
  };
};

const createSocketResponse = (socket, callback) => {
  return {
    status: (code) => ({
      json: (data) => {
        if (callback) callback({ status: code, data });
        return this;
      }
    }),
    json: (data) => {
      if (callback) callback({ status: 200, data });
    }
  };
};

// Function to mark messages as delivered and notify senders
const deliverPendingMessages = async (receiverId, socket = null) => {
  try {
    console.log(`📨 Processing pending messages for user ${receiverId}`);
    
    // Initialize processed messages set for this user if not exists
    if (!processedMessageDeliveries.has(receiverId)) {
      processedMessageDeliveries.set(receiverId, new Set());
    }
    
    // Find all messages sent to this user that are NOT delivered yet
    const pendingMessages = await Message.find({
      receiver: receiverId,
      delivered: false, // Changed from status field
      sentAt: { $ne: null }
    })
    .populate('sender', '_id username')
    .sort({ createdAt: 1 });
    
    if (pendingMessages.length === 0) {
      console.log(`📭 No pending messages for user ${receiverId}`);
      return { deliveredCount: 0, messagesBySender: {} };
    }
    
    // Filter out messages that have already been processed
    const userProcessedMessages = processedMessageDeliveries.get(receiverId);
    const newPendingMessages = pendingMessages.filter(
      msg => !userProcessedMessages.has(msg._id.toString())
    );
    
    if (newPendingMessages.length === 0) {
      console.log(`📭 All ${pendingMessages.length} messages already processed for user ${receiverId}`);
      return { deliveredCount: 0, messagesBySender: {} };
    }
    
    console.log(`📨 Found ${newPendingMessages.length} new pending messages out of ${pendingMessages.length} total`);
    
    // Group messages by sender
    const messagesBySender = {};
    const messageIdsToUpdate = [];
    
    newPendingMessages.forEach(message => {
      const senderId = message.sender._id.toString();
      
      if (!messagesBySender[senderId]) {
        messagesBySender[senderId] = [];
      }
      
      messagesBySender[senderId].push({
        messageId: message._id,
        content: message.content,
        sentAt: message.createdAt,
        deliveredAt: new Date()
      });
      
      messageIdsToUpdate.push(message._id);
      // Mark as processed
      userProcessedMessages.add(message._id.toString());
    });
    
    // Update all messages to "delivered" status
    const updateResult = await Message.updateMany(
      { _id: { $in: messageIdsToUpdate } },
      {
        $set: {
          delivered: true, // Changed from status field
          deliveredAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} messages to delivered for user ${receiverId}`);
    
    // Notify each sender about their delivered messages
    for (const [senderId, messages] of Object.entries(messagesBySender)) {
      // Send batch delivery notification
      emitToUser(senderId, "messages-delivered-batch", {
        receiverId,
        messages: messages,
        count: messages.length,
        deliveredAt: new Date().toISOString()
      });
      
      // Also send individual notifications for real-time updates
      messages.forEach(message => {
        emitToUser(senderId, "message-delivered", {
          messageId: message.messageId,
          receiverId,
          deliveredAt: message.deliveredAt.toISOString()
        });
      });
      
      console.log(`📬 Notified sender ${senderId} about ${messages.length} delivered messages`);
    }
    
    // Notify the receiver (if socket provided)
    if (socket) {
      socket.emit("pending-messages-processed", {
        count: updateResult.modifiedCount,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      deliveredCount: updateResult.modifiedCount,
      messagesBySender
    };
    
  } catch (error) {
    console.error(`❌ Error delivering pending messages for user ${receiverId}:`, error);
    return { deliveredCount: 0, messagesBySender: {}, error: error.message };
  }
};

// Function to mark user as offline (when ALL sockets disconnect OR heartbeat timeout)
const markUserAsOffline = (userId, socketId, reason = 'disconnect') => {
  if (!userId) return;
  
  console.log(`🔌 [markUserAsOffline] User ${userId}, Reason: ${reason}, Socket: ${socketId || 'none'}`);
  
  // Clean up heartbeat
  heartbeatMap.delete(userId);
  
  // Clean up typing status
  cleanupUserTyping(userId);
  
  // Remove from userSockets
  if (userSockets.has(userId)) {
    if (socketId) {
      userSockets.get(userId).delete(socketId);
    }
    
    // User is only offline if ALL their sockets are disconnected
    if (userSockets.get(userId).size === 0 || reason === 'heartbeat_timeout') {
      userSockets.delete(userId);
      onlineUsers.delete(userId);
      
      // Track if disconnected due to heartbeat
      if (reason === 'heartbeat_timeout') {
        disconnectedDueToHeartbeat.add(userId);
        console.log(`⚠️ User ${userId} marked as disconnected due to heartbeat timeout`);
      }
      
      // Broadcast offline status
      io.emit("user-status-changed", { 
        userId, 
        isOnline: false,
        reason,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ User ${userId} is offline (${reason})`);
    } else {
      console.log(`📱 User ${userId} still has ${userSockets.get(userId).size} active socket(s)`);
    }
  } else if (reason === 'heartbeat_timeout') {
    // User was in heartbeatMap but not in userSockets (edge case)
    onlineUsers.delete(userId);
    disconnectedDueToHeartbeat.add(userId);
    
    io.emit("user-status-changed", { 
      userId, 
      isOnline: false,
      reason,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ User ${userId} marked offline (heartbeat timeout)`);
  }
  
  // Remove from typing tracking
  typingUsers.delete(userId);
};

// Function to mark user as online (when first socket connects OR reconnection)
const markUserAsOnline = async (userId, socketId, isReconnection = false) => {
  console.log(`🔗 [markUserAsOnline] User ${userId}, Socket ${socketId}, Reconnection: ${isReconnection}`);
  
  // Check if this is a reconnection after heartbeat timeout
  const wasDisconnectedDueToTimeout = disconnectedDueToHeartbeat.has(userId);
  
  // Remove from disconnected due to heartbeat set if present
  if (wasDisconnectedDueToTimeout) {
    disconnectedDueToHeartbeat.delete(userId);
    console.log(`🔄 User ${userId} reconnecting after heartbeat timeout`);
  }
  
  // Clean up any previous heartbeat
  heartbeatMap.delete(userId);
  
  // Track user sockets for multiple devices
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
    // This is the first socket for this user, mark as online
    onlineUsers.set(userId, socketId);
    
    // Broadcast to all users that this user is online
    io.emit("user-status-changed", { 
      userId, 
      isOnline: true,
      isReconnection,
      wasDisconnectedDueToTimeout,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ User ${userId} is online (${isReconnection ? 'reconnected' : 'first socket connection'})`);
  } else {
    // User already has other sockets, just add this one
    console.log(`📱 User ${userId} connected ${isReconnection ? 'reconnected device' : 'additional device'}, total sockets: ${userSockets.get(userId).size + 1}`);
  }
  
  // Add socket to user's socket set
  userSockets.get(userId).add(socketId);
  
  // Record initial heartbeat
  heartbeatMap.set(userId, Date.now());
  
  return wasDisconnectedDueToTimeout;
};

// Heartbeat watcher function
const startHeartbeatWatcher = () => {
  setInterval(() => {
    const now = Date.now();
    
    for (const [userId, lastBeat] of heartbeatMap.entries()) {
      if (now - lastBeat > HEARTBEAT_TIMEOUT) {
        console.log(`⚠️ HEARTBEAT TIMEOUT for user: ${userId}, last beat: ${new Date(lastBeat).toISOString()}`);
        
        // Find the primary socket ID for this user
        const socketId = onlineUsers.get(userId);
        
        // Mark user as offline due to heartbeat timeout
        markUserAsOffline(userId, socketId, 'heartbeat_timeout');
        
        // Clean up heartbeat entry
        heartbeatMap.delete(userId);
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL);
};

// Function to handle user reconnection after heartbeat timeout
const handleUserReconnection = async (userId, socket) => {
  try {
    console.log(`🔄 Handling reconnection for user ${userId}`);
    
    // Mark user as online again
    const wasDisconnectedDueToTimeout = await markUserAsOnline(userId, socket.id, true);
    
    // Get online friends
    const onlineFriends = await getOnlineFriends(userId);
    
    // Deliver pending messages ONLY ONCE
    const deliveryResult = await deliverPendingMessages(userId, socket);
    
    // Notify the reconnected user
    socket.emit("reconnected", {
      userId,
      socketId: socket.id,
      wasDisconnectedDueToTimeout,
      onlineFriends,
      deliveredMessagesCount: deliveryResult.deliveredCount,
      reconnectedAt: new Date().toISOString()
    });
    
    // Notify friends that user is back online
    onlineFriends.forEach(friendId => {
      emitToUser(friendId, "user-status-changed", {
        userId,
        isOnline: true,
        reason: "reconnected",
        wasDisconnectedDueToTimeout,
        timestamp: new Date().toISOString()
      });
    });
    
    console.log(`✅ User ${userId} reconnected and notified ${onlineFriends.length} friends`);
  } catch (error) {
    console.error(`❌ Error handling reconnection for user ${userId}:`, error);
  }
};

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000 // 25 seconds
  });

  // Start heartbeat watcher
  startHeartbeatWatcher();

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Clear processed messages when user disconnects completely
    socket.on("disconnect", () => {
      const userId = socket.userId;
      if (userId) {
        // Only clear if user is completely offline
        if (!userSockets.has(userId) || userSockets.get(userId).size === 0) {
          processedMessageDeliveries.delete(userId);
          console.log(`🧹 Cleared processed messages tracking for user ${userId}`);
        }
      }
    });

    // ---- AUTHENTICATION & JOIN USER ROOM ----
    socket.on("authenticate", async (userId) => {
      if (!userId) {
        socket.emit("authentication-error", { message: "User ID required" });
        return;
      }

      socket.userId = userId;
      socket.join(userId);
      
      // Check if user was previously disconnected due to heartbeat timeout
      const wasDisconnectedDueToTimeout = disconnectedDueToHeartbeat.has(userId);
      
      // Mark user as online
      const isReconnection = await markUserAsOnline(userId, socket.id, wasDisconnectedDueToTimeout);
      
      // Get online friends
      const onlineFriends = await getOnlineFriends(userId);
      
      // Deliver pending messages if this is the first socket connection
      if (isReconnection || userSockets.get(userId).size === 1) {
        const deliveryResult = await deliverPendingMessages(userId, socket);
        
        console.log(`📦 Delivered ${deliveryResult.deliveredCount} pending messages for user ${userId}`);
      }
      
      // Notify user of successful authentication with online friends
      socket.emit("authenticated", { 
        userId, 
        socketId: socket.id,
        onlineFriends,
        wasDisconnectedDueToTimeout,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ User ${userId} authenticated on socket ${socket.id}, Online friends: ${onlineFriends.length}, Was disconnected due to timeout: ${wasDisconnectedDueToTimeout}`);
    });

    // ---- HEARTBEAT ----
    socket.on("heartbeat", async () => {
      const userId = socket.userId;
      if (!userId) return;
      
      const previousHeartbeat = heartbeatMap.get(userId);
      const now = Date.now();
      const wasOfflineDueToTimeout = disconnectedDueToHeartbeat.has(userId);
      
      // Update heartbeat
      heartbeatMap.set(userId, now);
      
      // If user was marked offline due to timeout, handle reconnection
      if (wasOfflineDueToTimeout) {
        console.log(`💓 Heartbeat from user ${userId} after timeout - handling reconnection`);
        await handleUserReconnection(userId, socket);
      } else {
        console.log(`💓 Heartbeat from user ${userId} on socket ${socket.id}`);
      }
    });

    // ---- CALL HANDLING EVENTS ----
    // Initiate a call
    socket.on("call:initiate", async (data) => {
      try {
        const { callId, roomName, receiverId, callType } = data;
        const callerId = socket.userId;
        
        if (!callerId || !receiverId || !roomName) {
          socket.emit("call:error", { 
            message: "Missing required call data" 
          });
          return;
        }

        // Check if receiver is online
        if (!isUserOnline(receiverId)) {
          socket.emit("call:error", {
            message: "User is offline",
            receiverId
          });
          return;
        }

        // Check if either user is already in a call
        if (isUserInCall(callerId) || isUserInCall(receiverId)) {
          socket.emit("call:error", {
            message: "User is already in a call"
          });
          return;
        }

        // Initialize call room
        initCallRoom(roomName, callerId, receiverId, callType);

        // Notify receiver
        emitToUser(receiverId, "call:incoming", {
          callId,
          roomName,
          callerId,
          callType,
          timestamp: new Date().toISOString()
        });

        // Confirm to caller
        socket.emit("call:initiated", {
          callId,
          roomName,
          receiverId,
          callType,
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call initiated: ${callerId} -> ${receiverId}, Room: ${roomName}`);

      } catch (error) {
        console.error("Error initiating call:", error);
        socket.emit("call:error", {
          message: "Failed to initiate call",
          error: error.message
        });
      }
    });

    // Accept a call
    socket.on("call:accept", async (data) => {
      try {
        const { callId, roomName } = data;
        const receiverId = socket.userId;
        
        if (!receiverId || !roomName) {
          socket.emit("call:error", {
            message: "Missing required data"
          });
          return;
        }

        const call = activeCalls.get(roomName);
        if (!call) {
          socket.emit("call:error", {
            message: "Call not found or expired"
          });
          return;
        }

        // Update call status
        call.status = 'ongoing';
        activeCalls.set(roomName, call);

        // Notify caller that call was accepted
        emitToUser(call.callerId, "call:accepted", {
          callId,
          roomName,
          receiverId,
          timestamp: new Date().toISOString()
        });

        // Confirm to receiver
        socket.emit("call:accepted", {
          callId,
          roomName,
          callerId: call.callerId,
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call accepted: ${receiverId} accepted call from ${call.callerId}`);

      } catch (error) {
        console.error("Error accepting call:", error);
        socket.emit("call:error", {
          message: "Failed to accept call",
          error: error.message
        });
      }
    });

    // Reject a call
    socket.on("call:reject", async (data) => {
      try {
        const { callId, roomName } = data;
        const receiverId = socket.userId;
        
        if (!receiverId || !roomName) {
          socket.emit("call:error", {
            message: "Missing required data"
          });
          return;
        }

        const call = activeCalls.get(roomName);
        if (!call) {
          socket.emit("call:error", {
            message: "Call not found"
          });
          return;
        }

        // End the call room
        endCallRoom(roomName);

        // Notify caller
        emitToUser(call.callerId, "call:rejected", {
          callId,
          roomName,
          receiverId,
          reason: "User rejected call",
          timestamp: new Date().toISOString()
        });

        // Confirm to receiver
        socket.emit("call:rejected", {
          callId,
          roomName,
          callerId: call.callerId,
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call rejected: ${receiverId} rejected call from ${call.callerId}`);

      } catch (error) {
        console.error("Error rejecting call:", error);
        socket.emit("call:error", {
          message: "Failed to reject call",
          error: error.message
        });
      }
    });

    // End a call
    socket.on("call:end", async (data) => {
      try {
        const { callId, roomName } = data;
        const userId = socket.userId;
        
        if (!userId || !roomName) {
          socket.emit("call:error", {
            message: "Missing required data"
          });
          return;
        }

        const call = activeCalls.get(roomName);
        if (!call) {
          socket.emit("call:error", {
            message: "Call not found"
          });
          return;
        }

        // Determine other participant
        const otherParticipant = call.participants.find(p => p !== userId);

        // End the call room
        endCallRoom(roomName);

        // Notify other participant
        if (otherParticipant) {
          emitToUser(otherParticipant, "call:ended", {
            callId,
            roomName,
            endedBy: userId,
            reason: "Call ended by other participant",
            timestamp: new Date().toISOString()
          });
        }

        // Confirm to caller
        socket.emit("call:ended", {
          callId,
          roomName,
          endedBy: userId,
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call ended: ${userId} ended call in room ${roomName}`);

      } catch (error) {
        console.error("Error ending call:", error);
        socket.emit("call:error", {
          message: "Failed to end call",
          error: error.message
        });
      }
    });

    // Call missed (no answer)
    socket.on("call:missed", async (data) => {
      try {
        const { callId, roomName } = data;
        const receiverId = socket.userId;
        
        if (!receiverId || !roomName) {
          return;
        }

        const call = activeCalls.get(roomName);
        if (!call) return;

        // End the call room
        endCallRoom(roomName);

        // Notify caller
        emitToUser(call.callerId, "call:missed", {
          callId,
          roomName,
          receiverId,
          reason: "No answer",
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call missed: ${receiverId} didn't answer call from ${call.callerId}`);

      } catch (error) {
        console.error("Error handling missed call:", error);
      }
    });

    // Toggle audio (mute/unmute)
    socket.on("call:toggle-audio", (data) => {
      const { roomName, isMuted } = data;
      const userId = socket.userId;
      
      if (!userId || !roomName) return;

      const call = activeCalls.get(roomName);
      if (!call) return;

      // Notify other participant
      const otherParticipant = call.participants.find(p => p !== userId);
      if (otherParticipant) {
        emitToUser(otherParticipant, "call:audio-toggled", {
          userId,
          isMuted,
          roomName,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`📞 Audio toggled: ${userId} ${isMuted ? 'muted' : 'unmuted'}`);
    });

    // Toggle video (camera on/off)
    socket.on("call:toggle-video", (data) => {
      const { roomName, isVideoOff } = data;
      const userId = socket.userId;
      
      if (!userId || !roomName) return;

      const call = activeCalls.get(roomName);
      if (!call) return;

      // Notify other participant
      const otherParticipant = call.participants.find(p => p !== userId);
      if (otherParticipant) {
        emitToUser(otherParticipant, "call:video-toggled", {
          userId,
          isVideoOff,
          roomName,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`📞 Video toggled: ${userId} ${isVideoOff ? 'camera off' : 'camera on'}`);
    });

    // ICE Candidate exchange
    socket.on("call:ice-candidate", (data) => {
      const { roomName, candidate, targetUserId } = data;
      const userId = socket.userId;
      
      if (!userId || !roomName || !targetUserId) return;

      // Forward ICE candidate to target user
      emitToUser(targetUserId, "call:ice-candidate", {
        candidate,
        roomName,
        senderId: userId,
        timestamp: new Date().toISOString()
      });
    });

    // SDP Offer/Answer exchange
    socket.on("call:sdp-offer", (data) => {
      const { roomName, offer, targetUserId } = data;
      const userId = socket.userId;
      
      if (!userId || !roomName || !targetUserId) return;

      emitToUser(targetUserId, "call:sdp-offer", {
        offer,
        roomName,
        senderId: userId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on("call:sdp-answer", (data) => {
      const { roomName, answer, targetUserId } = data;
      const userId = socket.userId;
      
      if (!userId || !roomName || !targetUserId) return;

      emitToUser(targetUserId, "call:sdp-answer", {
        answer,
        roomName,
        senderId: userId,
        timestamp: new Date().toISOString()
      });
    });

    // ---- TYPING INDICATORS ----
    socket.on("start-typing", (data) => {
      const { senderId, receiverId, isTyping, timestamp } = data;
      
      if (!senderId || !receiverId || typeof isTyping !== 'boolean') {
        console.error('❌ [Server] Invalid typing data received:', data);
        return;
      }
      
      // Verify sender matches authenticated user
      if (senderId !== socket.userId) {
        console.error(`❌ [Server] User ${socket.userId} tried to send typing as ${senderId}`);
        socket.emit("error", { message: "Authentication mismatch" });
        return;
      }
      
      // Update heartbeat when typing (activity)
      heartbeatMap.set(senderId, Date.now());
      
      if (isTyping) {
        // User started typing
        handleTypingStart(senderId, receiverId, socket.id);
      } else {
        // User stopped typing
        handleTypingStop(senderId, receiverId);
      }
    });
    
    socket.on("stop-typing", (data) => {
      const { senderId, receiverId, isTyping, timestamp } = data;
      
      if (!senderId || !receiverId) {
        console.error('❌ [Server] Invalid stop-typing data received:', data);
        return;
      }
      
      // Verify sender matches authenticated user
      if (senderId !== socket.userId) {
        console.error(`❌ [Server] User ${socket.userId} tried to stop typing as ${senderId}`);
        socket.emit("error", { message: "Authentication mismatch" });
        return;
      }
      
      // Update heartbeat when stopping typing (activity)
      heartbeatMap.set(senderId, Date.now());
      
      // User stopped typing
      handleTypingStop(senderId, receiverId);
    });

    // ---- REQUEST ONLINE FRIENDS ----
    socket.on("request-online-friends", async () => {
      const userId = socket.userId;
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }
      
      try {
        const onlineFriends = await getOnlineFriends(userId);
        socket.emit("online-friends-response", {
          success: true,
          onlineFriends,
          timestamp: new Date().toISOString()
        });
        
        console.log(`📊 Sent ${onlineFriends.length} online friends to user ${userId}`);
      } catch (error) {
        console.error("Error getting online friends:", error);
        socket.emit("online-friends-response", {
          success: false,
          message: "Error fetching online friends"
        });
      }
    });

    // ---- REQUEST ONLINE USERS ----
    socket.on("request-online-users", () => {
      const online = Array.from(userSockets.keys());
      socket.emit("online-users-response", {
        onlineUsers: online,
        count: online.length,
        timestamp: new Date().toISOString()
      });
    });

    // ---- TYPING INDICATORS (Legacy support - can remove if not used) ----
    socket.on("typing-start", async (data) => {
      const { receiverId, senderId = socket.userId } = data;
      
      if (!receiverId || !senderId) return;
      
      // Update heartbeat when typing (activity)
      if (socket.userId) {
        heartbeatMap.set(socket.userId, Date.now());
      }
      
      // Store typing status
      typingUsers.set(senderId, {
        typingTo: receiverId,
        timestamp: Date.now(),
        socketId: socket.id
      });
      
      // Notify receiver
      emitToUser(receiverId, "user-typing", {
        senderId,
        receiverId,
        isTyping: true,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✍️ User ${senderId} typing to ${receiverId}`);
    });

    socket.on("typing-stop", async (data) => {
      const { receiverId, senderId = socket.userId } = data;
      
      if (!receiverId || !senderId) return;
      
      // Update heartbeat when stopping typing (activity)
      if (socket.userId) {
        heartbeatMap.set(socket.userId, Date.now());
      }
      
      // Remove typing status
      typingUsers.delete(senderId);
      
      // Notify receiver
      emitToUser(receiverId, "user-typing", {
        senderId,
        receiverId,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✍️ User ${senderId} stopped typing to ${receiverId}`);
    });

    // ---- NEW MESSAGE HANDLER ----
    socket.on("new-message", async (data) => {
      try {
        const req = createSocketRequest(socket, data);
        const res = createSocketResponse(socket, async (response) => {
          if (response.status === 201) {
            const { receiverId, senderId } = data;
            const message = response.data.data;
            
            // Clear typing status when message is sent
            cleanupUserTyping(senderId);
            
            // Check if receiver is online
            const isReceiverOnline = isUserOnline(receiverId);
            
            if (isReceiverOnline) {
              // If receiver is online, mark as delivered immediately
              await Message.findByIdAndUpdate(message._id, {
                delivered: true, // Changed from status field
                deliveredAt: new Date()
              });
              
              // Emit to receiver
              emitToUser(receiverId, "new-message", {
                ...message,
                delivered: true
              });
              
              // Emit delivery confirmation to sender
              emitToUser(senderId, "message-delivered", {
                messageId: message._id,
                receiverId,
                deliveredAt: new Date().toISOString()
              });
              
              console.log(`📨 Message ${message._id} sent and delivered immediately to online user ${receiverId}`);
            } else {
              // If receiver is offline, mark as sent only (delivered: false)
              emitToUser(receiverId, "new-message", {
                ...message,
                delivered: false // Still not delivered
              });
              
              console.log(`📨 Message ${message._id} sent to offline user ${receiverId} (will be delivered when online)`);
            }
          }
        });

        await messageController.createMessage(req, res);
      } catch (error) {
        console.error('Error in new-message:', error);
      }
    });

    // ---- MESSAGE DELIVERY CONFIRMATION ----
    socket.on("confirm-message-delivery", async (data) => {
      try {
        const { messageId, receiverId, senderId } = data;
        
        if (!messageId) return;
        
        // Update heartbeat on message activity
        if (socket.userId) {
          heartbeatMap.set(socket.userId, Date.now());
        }
        
        // Update message status in database
        const updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            delivered: true, // Changed from status field
            deliveredAt: new Date()
          },
          { new: true }
        );
        
        if (updatedMessage) {
          console.log(`📨 Message ${messageId} delivered to ${receiverId}`);
        }
        
      } catch (error) {
        console.error("Error confirming message delivery:", error);
      }
    });

    // ---- MANUAL MESSAGE DELIVERY UPDATE ----
    socket.on("update-undelivered-messages", async () => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        
        console.log(`🔄 Manual request to update undelivered messages for user ${userId}`);
        
        const result = await deliverPendingMessages(userId, socket);
        
        socket.emit("messages-updated-response", {
          success: true,
          deliveredCount: result.deliveredCount,
          timestamp: new Date().toISOString(),
          message: `Delivered ${result.deliveredCount} pending messages`
        });
        
      } catch (error) {
        console.error("Error updating undelivered messages:", error);
        socket.emit("messages-updated-response", {
          success: false,
          message: "Error updating messages"
        });
      }
    });

    // ---- CHECK PENDING MESSAGES ----
    socket.on("check-pending-messages", async () => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        
        // Count pending undelivered messages
        const pendingCount = await Message.countDocuments({
          receiver: userId,
          delivered: false, // Changed from status field
          sentAt: { $ne: null }
        });
        
        socket.emit("pending-messages-response", {
          pendingCount,
          hasPending: pendingCount > 0,
          timestamp: new Date().toISOString()
        });
        
        console.log(`📊 User ${userId} has ${pendingCount} pending messages`);
        
      } catch (error) {
        console.error("Error checking pending messages:", error);
        socket.emit("pending-messages-response", {
          pendingCount: 0,
          hasPending: false,
          error: "Failed to check pending messages"
        });
      }
    });

    // ---- DISCONNECT HANDLER ----
    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
      
      const userId = socket.userId;
      if (userId) {
        // Clean up typing status
        cleanupUserTyping(userId);
        
        // End any active calls for this user
        const userCallInfo = getUserCallInfo(userId);
        if (userCallInfo) {
          const { roomName } = userCallInfo;
          endCallRoom(roomName);
          
          // Notify other participant
          const otherParticipant = userCallInfo.participants.find(p => p !== userId);
          if (otherParticipant) {
            emitToUser(otherParticipant, "call:ended", {
              roomName,
              endedBy: userId,
              reason: "User disconnected",
              timestamp: new Date().toISOString()
            });
          }
          
          console.log(`📞 Call ended due to disconnect: ${userId} disconnected from room ${roomName}`);
        }
        
        markUserAsOffline(userId, socket.id, 'disconnect');
      }
      
      // Clean up typing indicators for this socket only
      for (const [typingUserId, typingData] of typingUsers.entries()) {
        if (typingData.socketId === socket.id) {
          typingUsers.delete(typingUserId);
          
          // Notify the other user that typing stopped
          if (typingData.typingTo) {
            emitToUser(typingData.typingTo, "user-typing", {
              senderId: typingUserId,
              isTyping: false,
              timestamp: new Date().toISOString()
            });
          }
          break;
        }
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  });
};

// Helper function to get online friends (all friends that are online)
const getOnlineFriends = async (userId) => {
  try {
    const user = await User.findById(userId).populate('friends', '_id');
    if (!user) return [];
    
    return user.friends
      .filter(friend => isUserOnline(friend._id.toString()))
      .map(friend => friend._id.toString());
  } catch (error) {
    console.error("Error getting online friends:", error);
    return [];
  }
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

// Emit to User supporting multiple devices
export const emitToUser = (userId, event, data) => {
  if (!io) {
    console.error('❌ Socket.io not initialized for emitToUser');
    return;
  }
  
  const userIdStr = userId.toString();
  
  if (userSockets.has(userIdStr)) {
    const sockets = userSockets.get(userIdStr);
    sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  } else {
    // Fallback to room (for backward compatibility)
    io.to(userIdStr).emit(event, data);
  }
};

// Get call status for user
export const getUserCallStatus = (userId) => {
  const callInfo = getUserCallInfo(userId);
  return {
    isInCall: !!callInfo,
    callInfo: callInfo || null
  };
};

export const getOnlineUsers = () => Array.from(userSockets.keys());
export const isUserOnline = (userId) => onlineUsers.has(userId);
export const getUserSockets = (userId) => userSockets.get(userId) || new Set();

export const getUserStatus = (userId) => {
  const isOnline = isUserOnline(userId);
  const typingData = typingStatus.get(userId);
  const callInfo = getUserCallInfo(userId);
  
  return {
    isOnline,
    isTyping: !!typingData,
    typingTo: typingData?.typingTo,
    isInCall: !!callInfo,
    callType: callInfo?.callType,
    lastHeartbeat: heartbeatMap.get(userId) || null,
    socketCount: userSockets.get(userId)?.size || 0,
    wasDisconnectedDueToTimeout: disconnectedDueToHeartbeat.has(userId)
  };
};

// Get heartbeat status (for debugging)
export const getHeartbeatStatus = (userId) => {
  const lastBeat = heartbeatMap.get(userId);
  const now = Date.now();
  
  return {
    lastHeartbeat: lastBeat || null,
    isAlive: lastBeat ? (now - lastBeat < HEARTBEAT_TIMEOUT) : false,
    timeSinceLastBeat: lastBeat ? now - lastBeat : null,
    heartbeatTimeout: HEARTBEAT_TIMEOUT,
    wasDisconnectedDueToTimeout: disconnectedDueToHeartbeat.has(userId)
  };
};