import { Server } from "socket.io";
import Message from "../models/Message.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import * as messageController from "../controllers/message.controller.js";
import * as friendController from "../controllers/friend.controller.js";

let io;
const onlineUsers = new Map(); // userId → socketId (primary socket)
const userSockets = new Map(); // userId → Set(socketIds) for multiple devices
const typingUsers = new Map(); // Map of userId → { typingTo: userId, timestamp }
const heartbeatMap = new Map(); // userId → lastHeartbeat timestamp
const disconnectedDueToHeartbeat = new Set(); // Track users disconnected due to heartbeat timeout

const HEARTBEAT_TIMEOUT = 15000; // 15 seconds (WhatsApp-like)
const HEARTBEAT_CHECK_INTERVAL = 5000; // Check every 5 seconds

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

// Function to update all "sent" messages to "delivered" when user comes online
const updateSentMessagesToDelivered = async (receiverId) => {
  try {
    console.log(`📨 Updating sent messages to delivered for user ${receiverId}`);
    
    // Find all messages sent to this user that are still in "sent" status
    const sentMessages = await Message.find({
      receiver: receiverId,
      status: "sent"
    })
    .populate('sender', '_id username')
    .sort({ createdAt: 1 }); // Sort by creation date
    
    if (sentMessages.length === 0) {
      console.log(`📭 No pending sent messages for user ${receiverId}`);
      return { updatedCount: 0, messagesBySender: {} };
    }
    
    // Update all messages to "delivered" status
    const messageIds = sentMessages.map(msg => msg._id);
    const updateResult = await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $set: {
          status: "delivered",
          deliveredAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} messages to delivered for user ${receiverId}`);
    
    // Group messages by sender to send batch notifications
    const messagesBySender = {};
    const senderMessageMap = {}; // Map for individual message notifications
    
    sentMessages.forEach(message => {
      const senderId = message.sender._id.toString();
      
      // Group for batch notifications
      if (!messagesBySender[senderId]) {
        messagesBySender[senderId] = [];
      }
      messagesBySender[senderId].push({
        messageId: message._id,
        content: message.content,
        sentAt: message.createdAt,
        deliveredAt: new Date()
      });
      
      // Map for individual message notifications
      if (!senderMessageMap[senderId]) {
        senderMessageMap[senderId] = [];
      }
      senderMessageMap[senderId].push(message._id);
    });
    
    // Send notifications to each sender
    for (const [senderId, messages] of Object.entries(messagesBySender)) {
      // Send batch delivery confirmation
      emitToUser(senderId, "messages-delivered-batch", {
        receiverId,
        messages: messages,
        count: messages.length,
        deliveredAt: new Date().toISOString(),
        type: "batch"
      });
      
      console.log(`📬 Notified sender ${senderId} about ${messages.length} delivered messages`);
      
      // Also send individual notifications for each message
      // (optional, if frontend needs individual updates)
      messages.forEach(message => {
        emitToUser(senderId, "message-delivered", {
          messageId: message.messageId,
          receiverId
        });
      });
    }
    
    return {
      updatedCount: updateResult.modifiedCount,
      messagesBySender,
      senderMessageMap
    };
    
  } catch (error) {
    console.error(`❌ Error updating sent messages for user ${receiverId}:`, error);
    return { updatedCount: 0, messagesBySender: {}, error: error.message };
  }
};

// Function to mark user as offline (when ALL sockets disconnect OR heartbeat timeout)
const markUserAsOffline = (userId, socketId, reason = 'disconnect') => {
  if (!userId) return;
  
  console.log(`🔌 [markUserAsOffline] User ${userId}, Reason: ${reason}, Socket: ${socketId || 'none'}`);
  
  // Clean up heartbeat
  heartbeatMap.delete(userId);
  
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
        console.log(`⚠️ User ${userId} added to disconnectedDueToHeartbeat set`);
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
  
  // Remove from disconnected due to heartbeat set if present
  if (disconnectedDueToHeartbeat.has(userId)) {
    disconnectedDueToHeartbeat.delete(userId);
    console.log(`🔄 User ${userId} removed from disconnectedDueToHeartbeat set`);
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
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ User ${userId} is online (${isReconnection ? 'reconnected' : 'first socket connection'})`);
    
    // 🔥 CRITICAL: Update all sent messages to delivered when user comes online
    const deliveryResult = await updateSentMessagesToDelivered(userId);
    
    // Notify the newly online user about the delivery updates
    if (deliveryResult.updatedCount > 0) {
      emitToUser(userId, "messages-updated-status", {
        status: "delivered",
        count: deliveryResult.updatedCount,
        timestamp: new Date().toISOString(),
        message: `${deliveryResult.updatedCount} messages marked as delivered`
      });
    }
    
  } else {
    // User already has other sockets, just add this one
    console.log(`📱 User ${userId} connected ${isReconnection ? 'reconnected device' : 'additional device'}, total sockets: ${userSockets.get(userId).size + 1}`);
  }
  
  // Add socket to user's socket set
  userSockets.get(userId).add(socketId);
  
  // Record initial heartbeat
  heartbeatMap.set(userId, Date.now());
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
    await markUserAsOnline(userId, socket.id, true);
    
    // Get online friends
    const onlineFriends = await getOnlineFriends(userId);
    
    // Notify the reconnected user
    socket.emit("reconnected", {
      userId,
      socketId: socket.id,
      onlineFriends,
      reconnectedAt: new Date().toISOString()
    });
    
    // Notify friends that user is back online
    onlineFriends.forEach(friendId => {
      emitToUser(friendId, "user-status-changed", {
        userId,
        isOnline: true,
        reason: "reconnected",
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
      await markUserAsOnline(userId, socket.id, wasDisconnectedDueToTimeout);
      
      // Get online friends
      const onlineFriends = await getOnlineFriends(userId);
      
      // Notify user of successful authentication with online friends
      socket.emit("authenticated", { 
        userId, 
        socketId: socket.id,
        onlineFriends,
        wasReconnection: wasDisconnectedDueToTimeout,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ User ${userId} authenticated on socket ${socket.id}, Online friends: ${onlineFriends.length}, Reconnection: ${wasDisconnectedDueToTimeout}`);
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
      }
      
      console.log(`💓 Heartbeat from user ${userId} on socket ${socket.id}`);
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

    // ---- TYPING INDICATORS ----
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
            status: "delivered",
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
        
        const result = await updateSentMessagesToDelivered(userId);
        
        socket.emit("messages-updated-response", {
          success: true,
          updatedCount: result.updatedCount,
          timestamp: new Date().toISOString(),
          message: `Updated ${result.updatedCount} messages to delivered`
        });
        
      } catch (error) {
        console.error("Error updating undelivered messages:", error);
        socket.emit("messages-updated-response", {
          success: false,
          message: "Error updating messages"
        });
      }
    });

    // ---- MESSAGE READ RECEIPT ----
    socket.on("mark-message-read", async (data) => {
      try {
        const { messageId, senderId, readerId = socket.userId } = data;
        
        if (!messageId || !senderId) return;
        
        // Update heartbeat on message activity
        if (socket.userId) {
          heartbeatMap.set(socket.userId, Date.now());
        }
        
        // Update message status in database
        const updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            status: "read",
            readAt: new Date()
          },
          { new: true }
        );
        
        if (updatedMessage) {
          // Notify sender that message was read
          emitToUser(senderId, "message-read", {
            messageId: updatedMessage._id,
            readerId,
            readAt: updatedMessage.readAt,
            status: "read"
          });
          
          // Notify reader (for UI updates)
          emitToUser(readerId, "message-read", {
            messageId: updatedMessage._id,
            senderId,
            readAt: updatedMessage.readAt,
            status: "read"
          });
          
          console.log(`👁️ Message ${messageId} read by ${readerId}`);
        }
        
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    // ---- BATCH MESSAGE READ ----
    socket.on("mark-conversation-read", async (data) => {
      try {
        const { senderId, receiverId = socket.userId } = data;
        
        if (!senderId || !receiverId) return;
        
        // Update heartbeat on message activity
        if (socket.userId) {
          heartbeatMap.set(socket.userId, Date.now());
        }
        
        // Find all messages that are still in sent/delivered status
        const undeliveredMessages = await Message.find({
          sender: senderId,
          receiver: receiverId,
          status: { $in: ["sent", "delivered"] }
        });
        
        if (undeliveredMessages.length === 0) {
          console.log(`📭 No undelivered messages from ${senderId} to ${receiverId}`);
          return;
        }
        
        // Update them all to read
        const messageIds = undeliveredMessages.map(msg => msg._id);
        const result = await Message.updateMany(
          { _id: { $in: messageIds } },
          {
            status: "read",
            readAt: new Date()
          }
        );
        
        if (result.modifiedCount > 0) {
          // Send batch read receipt
          emitToUser(senderId, "messages-read-batch", {
            receiverId,
            messageIds: messageIds,
            count: result.modifiedCount,
            readAt: new Date().toISOString(),
            type: "batch"
          });
          
          // Also send individual notifications (optional)
          undeliveredMessages.forEach(message => {
            emitToUser(senderId, "message-read", {
              messageId: message._id,
              readerId: receiverId,
              readAt: new Date(),
              status: "read"
            });
          });
          
          console.log(`📚 ${result.modifiedCount} messages from ${senderId} marked as read by ${receiverId}`);
        }
        
      } catch (error) {
        console.error("Error marking conversation as read:", error);
      }
    });

    // ---- FRIEND REQUESTS ----
    socket.on("send-friend-request", async (data) => {
      try {
        const req = createSocketRequest(socket, { 
          ...data, 
          id: data.receiverId 
        });
        const res = createSocketResponse(socket, (response) => {
          if (response.status === 201) {
            const { receiverId, senderId } = data;
            
            // Notify receiver
            emitToUser(receiverId, "new-friend-request", {
              requestId: response.data.data._id,
              senderId,
              receiverId,
              sentAt: new Date().toISOString()
            });
            
            // Notify sender
            emitToUser(senderId, "friend-request-sent", {
              requestId: response.data.data._id,
              receiverId,
              sentAt: new Date().toISOString()
            });
          }
        });

        await friendController.sendFriendRequest(req, res);
      } catch (error) {
        console.error('Error in send-friend-request:', error);
      }
    });

    socket.on("accept-friend-request", async (data) => {
      try {
        const req = createSocketRequest(socket, { 
          ...data, 
          id: data.requestId 
        });
        const res = createSocketResponse(socket, (response) => {
          if (response.status === 200) {
            const { requestId, acceptorId, senderId } = data;
            
            // Notify both users
            const payload = {
              requestId,
              users: [acceptorId, senderId],
              acceptedAt: new Date().toISOString()
            };
            
            emitToUser(acceptorId, "friend-request-accepted", payload);
            emitToUser(senderId, "friend-request-accepted", payload);
          }
        });

        await friendController.acceptFriendRequest(req, res);
      } catch (error) {
        console.error('Error in accept-friend-request:', error);
      }
    });

    socket.on("reject-friend-request", async (data) => {
      try {
        const req = createSocketRequest(socket, { 
          ...data, 
          id: data.requestId 
        });
        const res = createSocketResponse(socket, (response) => {
          if (response.status === 200) {
            const { requestId, rejectorId, senderId } = data;
            
            // Notify sender
            emitToUser(senderId, "friend-request-rejected", {
              requestId,
              rejectorId,
              rejectedAt: new Date().toISOString()
            });
          }
        });

        await friendController.rejectFriendRequest(req, res);
      } catch (error) {
        console.error('Error in reject-friend-request:', error);
      }
    });

    // ---- ONLINE STATUS QUERIES ----
    socket.on("check-online-status", (data) => {
      const { userIds } = data;
      const statuses = {};
      
      userIds.forEach(userId => {
        const isOnline = isUserOnline(userId);
        statuses[userId] = {
          isOnline,
          wasDisconnectedDueToTimeout: disconnectedDueToHeartbeat.has(userId),
          lastHeartbeat: heartbeatMap.get(userId) || null,
          socketCount: userSockets.get(userId)?.size || 0
        };
      });
      
      socket.emit("online-status-response", { 
        statuses,
        timestamp: new Date().toISOString()
      });
    });

    socket.on("get-typing-status", (data) => {
      const { senderId } = data;
      const typingData = typingUsers.get(senderId);
      
      socket.emit("typing-status-response", {
        senderId,
        isTyping: !!typingData,
        typingTo: typingData?.typingTo,
        timestamp: new Date().toISOString()
      });
    });

    // ---- MANUAL RECONNECTION ----
    socket.on("manual-reconnect", async (data) => {
      const userId = socket.userId || data.userId;
      if (!userId) return;
      
      console.log(`🔄 Manual reconnection requested by user ${userId}`);
      
      if (disconnectedDueToHeartbeat.has(userId)) {
        await handleUserReconnection(userId, socket);
      } else {
        socket.emit("reconnect-response", {
          success: false,
          message: "Not disconnected due to heartbeat timeout",
          timestamp: new Date().toISOString()
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
        
        // Count pending sent messages
        const pendingCount = await Message.countDocuments({
          receiver: userId,
          status: "sent"
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
  
  console.log(`🔍 [emitToUser] Emitting "${event}" to user ${userIdStr}`);
  
  if (userSockets.has(userIdStr)) {
    const sockets = userSockets.get(userIdStr);
    console.log(`📡 User ${userIdStr} has ${sockets.size} active socket(s)`);
    
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
  const typingData = typingUsers.get(userId);
  
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