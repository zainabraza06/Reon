import { Server } from "socket.io";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { GroupChat, GroupMessage } from "../models/GroupChat.js";
import * as messageController from "../controllers/message.controller.js";

let io;
const onlineUsers = new Map(); // userId → socketId (primary socket)
const userSockets = new Map(); // userId → Set(socketIds) for multiple devices
const heartbeatMap = new Map(); // userId → lastHeartbeat timestamp
const disconnectedDueToHeartbeat = new Set(); // Track users disconnected due to heartbeat timeout

// Track which messages have been processed for delivery during this session
const processedMessageDeliveries = new Map(); // userId → Set(messageIds)

// TYPING INDICATORS 
// Store typing status: userId → { typingTo: receiverId, timestamp: Date.now() }
const typingStatus = new Map(); // userId → typing data

const HEARTBEAT_TIMEOUT = 45000; // 45 seconds
const HEARTBEAT_CHECK_INTERVAL = 5000; // Check every 5 seconds

// Clear typing status
const clearTypingStatus = (userId) => {
  if (typingStatus.has(userId)) {
    const typingData = typingStatus.get(userId);
    
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
  }
};

// Handle typing start
const handleTypingStart = (senderId, receiverId, socketId) => {
  // Set typing status
  typingStatus.set(senderId, {
    typingTo: receiverId,
    socketId,
    timestamp: Date.now()
  });
  
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
    // Initialize processed messages set for this user if not exists
    if (!processedMessageDeliveries.has(receiverId)) {
      processedMessageDeliveries.set(receiverId, new Set());
    }
    
    // Find all messages sent to this user that are NOT delivered yet
    const pendingMessages = await Message.find({
      receiver: receiverId,
      delivered: false,
      sentAt: { $ne: null }
    })
    .populate('sender', '_id username')
    .sort({ createdAt: 1 });
    
    if (pendingMessages.length === 0) {
      return { deliveredCount: 0, messagesBySender: {} };
    }
    
    // Filter out messages that have already been processed
    const userProcessedMessages = processedMessageDeliveries.get(receiverId);
    const newPendingMessages = pendingMessages.filter(
      msg => !userProcessedMessages.has(msg._id.toString())
    );
    
    if (newPendingMessages.length === 0) {
      return { deliveredCount: 0, messagesBySender: {} };
    }
    
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
          delivered: true,
          deliveredAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
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
      }
      
      // Broadcast offline status
      io.emit("user-status-changed", { 
        userId, 
        isOnline: false,
        reason,
        timestamp: new Date().toISOString()
      });
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
  }
};

// Function to mark user as online (when first socket connects OR reconnection)
const markUserAsOnline = async (userId, socketId, isReconnection = false) => {
  // Check if this is a reconnection after heartbeat timeout
  const wasDisconnectedDueToTimeout = disconnectedDueToHeartbeat.has(userId);
  
  // Remove from disconnected due to heartbeat set if present
  if (wasDisconnectedDueToTimeout) {
    disconnectedDueToHeartbeat.delete(userId);
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
    // Clear processed messages when user disconnects completely
    socket.on("disconnect", () => {
      const userId = socket.userId;
      if (userId) {
        // Only clear if user is completely offline
        if (!userSockets.has(userId) || userSockets.get(userId).size === 0) {
          processedMessageDeliveries.delete(userId);
        }
      }
    });

    // AUTHENTICATION & JOIN USER ROOM
    socket.on("authenticate", async (userId) => {
      if (!userId) {
        socket.emit("authentication-error", { message: "User ID required" });
        return;
      }

      try {
        socket.userId = userId;
        socket.join(userId);

        const wasDisconnectedDueToTimeout = disconnectedDueToHeartbeat.has(userId);
        const isReconnection = await markUserAsOnline(userId, socket.id, wasDisconnectedDueToTimeout);
        const onlineFriends = await getOnlineFriends(userId);

        if (isReconnection || userSockets.get(userId).size === 1) {
          await deliverPendingMessages(userId, socket);
        }

        socket.emit("authenticated", {
          userId,
          socketId: socket.id,
          onlineFriends,
          wasDisconnectedDueToTimeout,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error(`❌ Authentication error for user ${userId}:`, err);
        socket.emit("authentication-error", { message: "Authentication failed" });
      }
    });

    // HEARTBEAT
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
        await handleUserReconnection(userId, socket);
      } 
    });

    // TYPING INDICATORS
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
      
      // User started typing
      handleTypingStart(senderId, receiverId, socket.id);
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

    // REQUEST ONLINE FRIENDS
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
      } catch (error) {
        console.error("Error getting online friends:", error);
        socket.emit("online-friends-response", {
          success: false,
          message: "Error fetching online friends"
        });
      }
    });

    // REQUEST ONLINE USERS 
    socket.on("request-online-users", () => {
      const online = Array.from(userSockets.keys());
      socket.emit("online-users-response", {
        onlineUsers: online,
        count: online.length,
        timestamp: new Date().toISOString()
      });
    });

    // TYPING INDICATORS (Legacy support - can remove if not used)
    socket.on("typing-start", async (data) => {
      const { receiverId, senderId = socket.userId } = data;
      
      if (!receiverId || !senderId) return;
      
      // Update heartbeat when typing (activity)
      if (socket.userId) {
        heartbeatMap.set(socket.userId, Date.now());
      }
      
      // Store typing status
      const typingUsers = new Map(); // Local variable for legacy support
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
    });

    socket.on("typing-stop", async (data) => {
      const { receiverId, senderId = socket.userId } = data;
      
      if (!receiverId || !senderId) return;
      
      // Update heartbeat when stopping typing (activity)
      if (socket.userId) {
        heartbeatMap.set(socket.userId, Date.now());
      }
      
      // Remove typing status
      const typingUsers = new Map(); // Local variable for legacy support
      typingUsers.delete(senderId);
      
      // Notify receiver
      emitToUser(receiverId, "user-typing", {
        senderId,
        receiverId,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
    });

    // NEW MESSAGE HANDLER
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
                delivered: true,
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
            } else {
              // If receiver is offline, mark as sent only (delivered: false)
              emitToUser(receiverId, "new-message", {
                ...message,
                delivered: false // Still not delivered
              });
            }
          }
        });

        await messageController.createMessage(req, res);
      } catch (error) {
        console.error('Error in new-message:', error);
      }
    });

    // READ RECEIPT — receiver tells us they read a message; forward to original sender
    socket.on("message-read", async ({ messageId, senderId }) => {
      if (!socket.userId || !senderId || !messageId) return;
      // Tell the sender their message was read
      emitToUser(senderId, "message-read", { messageId, readBy: socket.userId });
      // Persist read status
      try {
        await Message.findByIdAndUpdate(messageId, { read: true, readAt: new Date() });
      } catch {}
    });

    // MESSAGE DELIVERY CONFIRMATION
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
            delivered: true,
            deliveredAt: new Date()
          },
          { new: true }
        );
      } catch (error) {
        console.error("Error confirming message delivery:", error);
      }
    });

    // MANUAL MESSAGE DELIVERY UPDATE
    socket.on("update-undelivered-messages", async () => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        
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

    // CHECK PENDING MESSAGES
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
          delivered: false,
          sentAt: { $ne: null }
        });
        
        socket.emit("pending-messages-response", {
          pendingCount,
          hasPending: pendingCount > 0,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error checking pending messages:", error);
        socket.emit("pending-messages-response", {
          pendingCount: 0,
          hasPending: false,
          error: "Failed to check pending messages"
        });
      }
    });

    // GROUP DELIVERY RECEIPT — receiver tells us they got a group message
    socket.on("group-message-delivered", async ({ messageId, groupId }) => {
      const userId = socket.userId;
      if (!userId || !messageId) return;
      try {
        const msg = await GroupMessage.findOneAndUpdate(
          { _id: messageId, "deliveredTo.userId": { $ne: userId } },
          { $push: { deliveredTo: { userId, at: new Date() } } },
          { new: true }
        );
        if (!msg) return; // already delivered or not found
        const group = await GroupChat.findOne({ _id: groupId || msg.groupId }).select("members").lean();
        const memberCount = group ? group.members.length - 1 : 0;
        const deliveredCount = msg.deliveredTo.filter(
          (d) => d.userId.toString() !== msg.sender.toString()
        ).length;
        emitToUser(msg.sender.toString(), "group-message-delivered", {
          messageId: msg._id.toString(),
          groupId: (groupId || msg.groupId).toString(),
          deliveredCount,
          memberCount,
        });
      } catch {}
    });

    // GROUP CHAT: typing indicator
    socket.on("group-typing-start", ({ groupId }) => {
      const userId = socket.userId;
      if (!userId || !groupId) return;
      // Broadcast to group room (all members except sender)
      socket.to(`group:${groupId}`).emit("group-user-typing", { groupId, userId, isTyping: true });
    });

    socket.on("group-typing-stop", ({ groupId }) => {
      const userId = socket.userId;
      if (!userId || !groupId) return;
      socket.to(`group:${groupId}`).emit("group-user-typing", { groupId, userId, isTyping: false });
    });

    // GROUP CHAT: join room when user is authenticated
    socket.on("join-groups", async () => {
      const userId = socket.userId;
      if (!userId) return;
      try {
        const groups = await GroupChat.find({ "members.user": userId, isActive: true }).select("_id");
        for (const g of groups) {
          socket.join(`group:${g._id.toString()}`);
        }
      } catch (err) {
        console.error("join-groups error:", err);
      }
    });

    // DISCONNECT HANDLER
    socket.on("disconnect", () => {
      const userId = socket.userId;
      if (userId) {
        // Clean up typing status
        cleanupUserTyping(userId);
        
        markUserAsOffline(userId, socket.id, 'disconnect');
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

export const getOnlineUsers = () => Array.from(userSockets.keys());
export const isUserOnline = (userId) => onlineUsers.has(userId);
export const getUserSockets = (userId) => userSockets.get(userId) || new Set();

export const getUserStatus = (userId) => {
  const isOnline = isUserOnline(userId);
  const typingData = typingStatus.get(userId);
  
  return {
    isOnline,
    isTyping: !!typingData,
    typingTo: typingData?.typingTo,
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