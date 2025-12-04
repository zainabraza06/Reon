import { Server } from "socket.io";
import Message from "../models/Message.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";

let io;
const onlineUsers = new Map(); // userId → socketId (Keep for "Online Status" presence features)
const userSockets = new Map(); // userId → Set(socketIds) for multiple devices support

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // ---- JOIN USER ROOM (CRITICAL FOR REAL-TIME UPDATES) ----
    socket.on("join-user-room", (userId) => {
      if (userId) {
        socket.join(userId);
        
        // Track user sockets for multiple devices
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        
        console.log(`Socket ${socket.id} joined room: ${userId}`);
      }
    });

    // ---- USER ONLINE ----
    socket.on("user-online", (data) => {
      const userId = data.userId || data;
      onlineUsers.set(userId, socket.id);
      
      // Ensure they are in their room as a backup
      socket.join(userId);
      
      // Broadcast to all users that this user is online
      socket.broadcast.emit("user-online", { userId });
      console.log(`User ${userId} is online`);
    });

    // ---- USER OFFLINE ----
    socket.on("user-offline", (data) => {
      const userId = data.userId || data;
      onlineUsers.delete(userId);
      
      // Remove from userSockets
      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socket.id);
        if (userSockets.get(userId).size === 0) {
          userSockets.delete(userId);
        }
      }
      
      // Broadcast to all users that this user is offline
      socket.broadcast.emit("user-offline", { 
        userId, 
        lastSeen: new Date().toISOString() 
      });
    });

    // ---- TYPING INDICATOR ----
    socket.on("typing", ({ to }) => {
      // Send to the specific user's room
      io.to(to).emit("typing", true);
    });

    socket.on("stop-typing", ({ to }) => {
      io.to(to).emit("typing", false);
    });

    // ---- ENHANCED: SEND MESSAGE IN REAL-TIME ----
    socket.on("send-message", async (data) => {
      const { sender, receiver, ciphertext, type, media } = data;

      try {
        const message = await Message.create({ sender, receiver, ciphertext, type, media });

        // Populate sender info for frontend
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username fullName profilePic email')
          .populate('receiver', 'username fullName profilePic email');

        // Enhanced: Emit to receiver's room (all their devices)
        emitToUser(receiver, "new-message", populatedMessage);
        
        // Enhanced: Mark as delivered immediately if receiver is online
        if (isUserOnline(receiver)) {
          await Message.findByIdAndUpdate(message._id, { delivered: true });
          populatedMessage.delivered = true;
          
          // Enhanced: Notify sender that message was delivered
          emitToUser(sender, "message-delivered", { 
            messageId: message._id,
            receiverId: receiver
          });
        }

        // Enhanced: Emit confirmation to sender (all their devices)
        emitToUser(sender, "message-sent", populatedMessage);
        
      } catch (error) {
        console.error("Error sending message:", error);
        emitToUser(sender, "message-error", { error: "Failed to send message" });
      }
    });

    // ---- ENHANCED: MESSAGE STATUS UPDATES ----
    socket.on("message-delivered", async (data) => {
      const { messageId, receiverId } = data;
      
      try {
        const message = await Message.findByIdAndUpdate(
          messageId,
          { delivered: true },
          { new: true }
        ).populate('sender', 'username fullName profilePic');

        if (message) {
          // Notify sender that message was delivered
          emitToUser(message.sender._id.toString(), "message-delivered", {
            messageId: message._id,
            receiverId
          });
        }
      } catch (error) {
        console.error("Error updating delivery status:", error);
      }
    });

    // ---- ENHANCED: TYPING INDICATORS WITH SENDER INFO ----
    socket.on("typing-start", (data) => {
      const { receiverId, senderId } = data;
      
      // Send typing indicator to receiver with sender info
      emitToUser(receiverId, 'typing-start', { 
        senderId,
        isTyping: true 
      });
    });

    socket.on("typing-stop", (data) => {
      const { receiverId, senderId } = data;
      
      // Send stop typing to receiver with sender info
      emitToUser(receiverId, 'typing-stop', { 
        senderId,
        isTyping: false 
      });
    });

  

    // Send friend request
    socket.on("send-friend-request-realtime", async (data) => {
      const { senderId, receiverId, requestId } = data;
      
      try {
        const sender = await User.findById(senderId).select('fullName username profilePic');
        
        if (!sender) return;

        // Emit to receiver via Room
        emitToUser(receiverId, 'friend-request-received', {
          requestId,
          sender: {
            _id: sender._id,
            fullName: sender.fullName,
            username: sender.username,
            profilePic: sender.profilePic
          },
          timestamp: new Date().toISOString()
        });

        // Emit to sender (confirmation)
        emitToUser(senderId, 'friend-request-sent-realtime', {
          senderId,
          receiverId,
          requestId,
          timestamp: new Date().toISOString()
        });

        const pendingCount = await FriendRequest.countDocuments({ receiver: receiverId, status: 'pending' });
        emitToUser(receiverId, 'pending-requests-count-updated', { count: pendingCount });
        
      } catch (error) {
        console.error('Error in send-friend-request-realtime:', error);
      }
    });

    // Accept friend request
    socket.on("accept-friend-request-realtime", async (data) => {
      const { requestId, senderId, receiverId } = data;
      
      try {
        const receiver = await User.findById(receiverId).select('fullName username profilePic');
        
        if (!receiver) return;

        const payload = {
          requestId,
          senderId,
          receiverId,
          receiver: {
            _id: receiver._id,
            fullName: receiver.fullName,
            username: receiver.username,
            profilePic: receiver.profilePic
          },
          timestamp: new Date().toISOString()
        };

        // Notify both parties
        emitToUser(senderId, 'friend-request-accepted-realtime', payload);
        emitToUser(receiverId, 'friend-request-accepted-realtime', payload);

        // Update lists
        emitToUser(senderId, 'friends-list-updated', { userId: senderId });
        emitToUser(receiverId, 'friends-list-updated', { userId: receiverId });

        // Update counts
        const senderPendingCount = await FriendRequest.countDocuments({ sender: senderId, status: 'pending' });
        const receiverPendingCount = await FriendRequest.countDocuments({ receiver: receiverId, status: 'pending' });
        
        emitToUser(senderId, 'pending-requests-count-updated', { count: senderPendingCount });
        emitToUser(receiverId, 'pending-requests-count-updated', { count: receiverPendingCount });
        
      } catch (error) {
        console.error('Error in accept-friend-request-realtime:', error);
      }
    });

    // Withdraw friend request
    socket.on("withdraw-friend-request", async (data) => {
      const { requestId, senderId, receiverId } = data;
      const payload = {
        requestId,
        senderId,
        receiverId,
        timestamp: new Date().toISOString()
      };
      
      emitToUser(receiverId, 'friend-request-withdrawn', payload);
      emitToUser(senderId, 'friend-request-withdrawn', payload);

      const pendingCount = await FriendRequest.countDocuments({ receiver: receiverId, status: 'pending' });
      emitToUser(receiverId, 'pending-requests-count-updated', { count: pendingCount });
    });

    // Reject friend request
    socket.on("reject-friend-request", async (data) => {
      const { requestId, senderId, receiverId } = data;
      
      const payload = {
        requestId,
        senderId, // The Original Sender
        receiverId, // The Rejector
        timestamp: new Date().toISOString()
      };
      
      // Notify sender (request rejected)
      emitToUser(senderId, 'friend-request-rejected', payload);
      
      // Notify receiver/rejector (confirm rejection)
      emitToUser(receiverId, 'friend-request-rejected', payload);

      const pendingCount = await FriendRequest.countDocuments({ receiver: receiverId, status: 'pending' });
      emitToUser(receiverId, 'pending-requests-count-updated', { count: pendingCount });
    });

    // Remove friend
    socket.on("remove-friend", async (data) => {
      const { userId, friendId } = data;
      
      const payload = {
        userId, // The Remover
        friendId, // The Removed
        timestamp: new Date().toISOString()
      };
      
      // Notify both
      emitToUser(userId, 'friend-removed', payload);
      emitToUser(friendId, 'friend-removed', payload);
    });

    // ---- MESSAGE SEEN / ACK ----
    socket.on("message-seen", async ({ messageId, from }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { read: true });
        const senderSocket = onlineUsers.get(from);
        if (senderSocket) io.to(senderSocket).emit("messages-seen", { messageId });
      } catch (error) {
        console.error("Error marking message as seen:", error);
      }
    });

    // ---- GROUP FUNCTIONALITY ----
    socket.on("join-group", (groupId) => {
      socket.join(groupId);
    });

    socket.on("leave-group", (groupId) => {
      socket.leave(groupId);
    });

    socket.on("group-typing", ({ groupId, sender }) => {
      socket.to(groupId).emit("group-typing", { groupId, sender });
    });

    socket.on("group-stop-typing", ({ groupId, sender }) => {
      socket.to(groupId).emit("group-stop-typing", { groupId, sender });
    });

    socket.on("send-group-message", async (data) => {
      const { groupId, sender, ciphertext, type, media } = data;

      try {
        const message = await Message.create({ 
          sender, 
          receiver: groupId,
          ciphertext, 
          type, 
          media,
          isGroup: true
        });

        io.to(groupId).emit("new-group-message", message);
        io.to(socket.id).emit("group-message-sent", message);
      } catch (error) {
        console.error("Error sending group message:", error);
        io.to(socket.id).emit("group-message-error", { error: "Failed to send group message" });
      }
    });

    socket.on("group-message-seen", async ({ messageId, groupId, userId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { 
          $addToSet: { readBy: userId } 
        });

        socket.to(groupId).emit("group-message-seen", { messageId, userId });
      } catch (error) {
        console.error("Error marking group message as seen:", error);
      }
    });

    // ---- NOTIFICATION EVENTS ----
    socket.on("mark-notification-read", async (data) => {
      const { notificationId, userId } = data;
      io.to(userId).emit("notification-read", { notificationId });
    });

    // ---- ENHANCED: DISCONNECT ----
    socket.on("disconnect", () => {
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          
          // Remove from userSockets
          if (userSockets.has(userId)) {
            userSockets.get(userId).delete(socket.id);
            if (userSockets.get(userId).size === 0) {
              userSockets.delete(userId);
            }
          }
          
          socket.broadcast.emit("user-offline", { 
            userId, 
            lastSeen: new Date().toISOString() 
          });
          break;
        }
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  });
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

// ENHANCED: Emit to User supporting multiple devices
export const emitToUser = (userId, event, data) => {
  if (!io) {
    console.error('Socket.io not initialized for emitToUser');
    return;
  }
  
  // Enhanced: Emit to all sockets of the user (multiple devices)
  if (userSockets.has(userId)) {
    userSockets.get(userId).forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  } else {
    // Fallback: use room system
    io.to(userId).emit(event, data);
  }
};

export const getOnlineUsers = () => onlineUsers;

export const isUserOnline = (userId) => {
  return onlineUsers.has(userId);
};

export const emitToGroup = (groupId, event, data) => {
  io.to(groupId).emit(event, data);
};

export const getGroupMembers = (groupId) => {
  return io.sockets.adapter.rooms.get(groupId) || new Set();
};

// NEW: Get user sockets for multiple devices
export const getUserSockets = (userId) => {
  return userSockets.get(userId) || new Set();
};