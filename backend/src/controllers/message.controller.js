import mongoose from "mongoose";
import Message from "../models/Message.js";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import User from "../models/User.js";
import { getIO, getOnlineUsers, emitToUser, emitToGroup } from "../lib/socket.js";
import cloudinary from "../lib/cloudinary.js";

// message.controller.js

import { GridFSBucket } from 'mongodb';





// Save encrypted file to GridFS
// Update saveEncryptedFileToGridFS to include file type in metadata
// In saveEncryptedFileToGridFS function, extract and store extension:
const saveEncryptedFileToGridFS = async (fileBuffer, originalName, index, fileType = "document") => {
  return new Promise((resolve, reject) => {
    try {
      const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `encrypted_${Date.now()}_${index}_${safeName}`;
      
      // Extract file extension
      const extension = originalName.includes('.') 
        ? originalName.substring(originalName.lastIndexOf('.'))
        : getDefaultExtension(fileType);
      
      const bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'encryptedFiles'
      });
      
      const uploadStream = bucket.openUploadStream(fileName, {
        metadata: {
          originalName: originalName,
          type: fileType,
          extension: extension, // ⭐ Store extension
          isEncrypted: true,
          uploadedAt: new Date(),
          isTemp: false
        }
      });
      
      uploadStream.end(fileBuffer);
      
      uploadStream.on('finish', () => {
        console.log(`✅ Encrypted file saved to GridFS: ${uploadStream.id}`);
        resolve({ 
          url: `/api/messages/media/${uploadStream.id}`, // For display
          fileId: uploadStream.id.toString(),
          fileName: fileName
        });
      });
      
      uploadStream.on('error', reject);
      
    } catch (error) {
      reject(error);
    }
  });
};

// Helper function to get default extension
function getDefaultExtension(fileType) {
  switch (fileType) {
    case 'image': return '.jpg';
    case 'video': return '.mp4';
    case 'audio': return '.mp3';
    case 'document': return '.bin';
    default: return '.bin';
  }
}
// Serve media files for display (img/video tags)
export const serveMediaFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: "Invalid file ID" });
    }
    
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'encryptedFiles'
    });
    
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    if (files.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }
    
    const file = files[0];
    
    // ⭐ Set CORS headers for media display
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
    
    // Determine content type
    let contentType = 'application/octet-stream';
    switch (file.metadata?.type) {
      case 'image':
        contentType = 'image/jpeg';
        break;
      case 'video':
        contentType = 'video/mp4';
        break;
      case 'audio':
        contentType = 'audio/mpeg';
        break;
      default:
        contentType = 'application/octet-stream';
    }
    
    // ⭐ IMPORTANT: Use 'inline' for media display
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error) => {
      console.error('Error streaming media:', error);
      res.status(500).json({ message: 'Error streaming media' });
    });
    
  } catch (error) {
    console.error('Media serve error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Download encrypted files (for documents)
// Download encrypted files (for documents)
// Download encrypted files (for documents)
export const downloadEncryptedFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: "Invalid file ID" });
    }
    
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'encryptedFiles'
    });
    
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    if (files.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }
    
    const file = files[0];
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Encrypted');
    
    // Determine content type and extension
    let contentType = 'application/octet-stream';
    let extension = '';
    const originalName = file.metadata?.originalName || '';
    
    // Get extension from metadata or original filename
    if (file.metadata?.extension) {
      extension = file.metadata.extension;
    } else if (originalName.includes('.')) {
      extension = originalName.substring(originalName.lastIndexOf('.'));
    }
    
    // Set content type based on file type and extension
    switch (file.metadata?.type) {
      case 'image':
        if (extension.toLowerCase() === '.png') {
          contentType = 'image/png';
        } else if (extension.toLowerCase() === '.gif') {
          contentType = 'image/gif';
        } else if (extension.toLowerCase() === '.webp') {
          contentType = 'image/webp';
        } else if (extension.toLowerCase() === '.svg') {
          contentType = 'image/svg+xml';
        } else if (extension.toLowerCase() === '.bmp') {
          contentType = 'image/bmp';
        } else {
          contentType = 'image/jpeg'; // Default for images
        }
        break;
      case 'video':
        if (extension.toLowerCase() === '.webm') {
          contentType = 'video/webm';
        } else if (extension.toLowerCase() === '.avi') {
          contentType = 'video/x-msvideo';
        } else if (extension.toLowerCase() === '.mov') {
          contentType = 'video/quicktime';
        } else {
          contentType = 'video/mp4'; // Default for videos
        }
        break;
      case 'audio':
        if (extension.toLowerCase() === '.wav') {
          contentType = 'audio/wav';
        } else if (extension.toLowerCase() === '.ogg') {
          contentType = 'audio/ogg';
        } else if (extension.toLowerCase() === '.m4a') {
          contentType = 'audio/mp4';
        } else {
          contentType = 'audio/mpeg'; // Default for audio
        }
        break;
      case 'document':
        if (extension.toLowerCase() === '.pdf') {
          contentType = 'application/pdf';
        } else if (extension.toLowerCase() === '.doc') {
          contentType = 'application/msword';
        } else if (extension.toLowerCase() === '.docx') {
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else if (extension.toLowerCase() === '.txt') {
          contentType = 'text/plain';
        } else if (extension.toLowerCase() === '.zip') {
          contentType = 'application/zip';
        }
        break;
    }
    
    // Ensure filename has extension
    let fileName = originalName;
    if (!fileName.includes('.') && extension) {
      fileName += extension;
    } else if (!fileName.includes('.')) {
      // Add default extension based on type
      switch (file.metadata?.type) {
        case 'image': fileName += '.jpg'; break;
        case 'video': fileName += '.mp4'; break;
        case 'audio': fileName += '.mp3'; break;
        default: fileName += '.bin'; break;
      }
    }
    
    // Clean filename for safe download
    fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Encrypted', 'true');
    
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      res.status(500).json({ message: 'Error downloading file' });
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
export const sendMessage = async (req, res) => {
  try {
    console.log("📨 Received message request");
    console.log("📁 Files received:", req.files?.length || 0);

    // Parse message data
    let messageData = {};
    try {
      messageData = JSON.parse(req.body.data || '{}');
    } catch (parseError) {
      console.error("❌ Failed to parse message data:", parseError);
      return res.status(400).json({ message: "Invalid message data format" });
    }

    const { 
      sender, 
      receiver, 
      ciphertext, 
      type = "ratcheted",
      encryptedKey, 
      senderEncryptedKey,
      isGroup = false,
      contentType = "text"
    } = messageData;

    // Validate required fields
    const missingFields = [];
    if (!sender) missingFields.push("sender");
    if (!receiver) missingFields.push("receiver");
    if (!ciphertext) missingFields.push("ciphertext");
    if (!encryptedKey) missingFields.push("encryptedKey");
    if (!senderEncryptedKey) missingFields.push("senderEncryptedKey");
    
    if (missingFields.length > 0) {
      console.error("❌ Missing required fields:", missingFields);
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(sender) || !mongoose.Types.ObjectId.isValid(receiver)) {
      console.error("❌ Invalid ObjectId:", { sender, receiver });
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // ---- HANDLE ENCRYPTED MEDIA FILES ----
    const mediaArray = [];
    if (req.files && req.files.length > 0) {
      console.log(`📦 Processing ${req.files.length} encrypted files...`);
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        
        try {
          // Get metadata from form data
          const fileType = req.body[`mediaType${i}`] || "document";
          const mediaEncryptedKey = req.body[`mediaEncryptedKey${i}`] || "";
          const mediaSenderEncryptedKey = req.body[`mediaSenderEncryptedKey${i}`] || "";
          const originalName = req.body[`originalName${i}`] || `file_${i}`;

          console.log(`📁 File ${i + 1}: ${originalName}, type: ${fileType}, size: ${file.buffer.length} bytes`);

          // Save encrypted blob to GridFS
          // In sendMessage function, update the file saving part:
const savedFile = await saveEncryptedFileToGridFS(
  file.buffer, 
  originalName, 
  i, 
  fileType // Pass file type
);

mediaArray.push({
  url: savedFile.url, // GridFS media URL
  type: fileType,
  encryptedKey: mediaEncryptedKey,
  senderEncryptedKey: mediaSenderEncryptedKey,
  originalName: originalName,
  fileSize: file.buffer.length,
  isEncrypted: true,
  fileId: savedFile.fileId
});

          console.log(`✅ Encrypted file ${i + 1} saved to GridFS`);

        } catch (fileError) {
          console.error(`❌ Error processing encrypted file ${i}:`, fileError);
          // Continue with other files even if one fails
          continue;
        }
      }
    }

    let msg;
    let responseData;
    
    if (isGroup) {
      console.log("👥 Processing group message...");
      
      // Verify user is member of the group
      const group = await Group.findOne({
        _id: receiver,
        members: sender
      });

      if (!group) {
        console.error("❌ User not member of group:", { sender, receiver });
        return res.status(403).json({ message: "Not a member of this group" });
      }

      msg = await GroupMessage.create({
        sender,
        group: receiver,
        ciphertext,
        type,
        contentType,
        encryptedKey: encryptedKey,
        senderEncryptedKey: senderEncryptedKey,
        media: mediaArray
      });

      console.log("✅ Group message created:", msg._id);

      // Prepare response data
      responseData = {
        _id: msg._id,
        sender: msg.sender.toString(),
        group: msg.group.toString(),
        ciphertext: msg.ciphertext,
        type: msg.type,
        contentType: msg.contentType,
        encryptedKey: msg.encryptedKey,
        senderEncryptedKey: msg.senderEncryptedKey,
        media: msg.media,
        sentAt: msg.sentAt,
        readBy: msg.readBy || []
      };

      // ---- REAL-TIME GROUP EMISSIONS ----
      const onlineUsers = getOnlineUsers();
      
      // Emit to all group members who are online
      group.members.forEach(memberId => {
        const memberStr = memberId.toString();
        
        // Don't emit to sender (they'll get message-sent)
        if (memberStr === sender) return;
        
        if (onlineUsers.has(memberStr)) {
          console.log(`📡 Emitting new-group-message to member: ${memberStr}`);
          emitToUser(memberStr, "new-group-message", responseData);
        }
      });
      
      // Emit to sender that message was sent successfully
      console.log(`📡 Emitting group-message-sent to sender: ${sender}`);
      emitToUser(sender, "group-message-sent", responseData);

      // Update group activity
      await Group.findByIdAndUpdate(receiver, {
        lastActivity: new Date()
      });

      console.log("📢 Group message broadcasted");

    } else {
      console.log("👤 Processing private message...");
      
      // Verify receiver exists
      const receiverExists = await User.findById(receiver);
      if (!receiverExists) {
        console.error("❌ Receiver not found:", receiver);
        return res.status(404).json({ message: "Receiver not found" });
      }

      // Create message
      msg = await Message.create({
        sender,
        receiver,
        ciphertext,
        type,
        contentType,
        encryptedKey: encryptedKey,
        senderEncryptedKey: senderEncryptedKey,
        media: mediaArray
      });

      console.log("✅ Private message created:", msg._id);

      // Prepare response data
      responseData = {
        _id: msg._id,
        sender: msg.sender.toString(),
        receiver: msg.receiver.toString(),
        ciphertext: msg.ciphertext,
        type: msg.type,
        contentType: msg.contentType,
        encryptedKey: msg.encryptedKey,
        senderEncryptedKey: msg.senderEncryptedKey,
        media: msg.media,
        sentAt: msg.sentAt,
        delivered: msg.delivered,
        read: msg.read
      };

      // ---- REAL-TIME PRIVATE EMISSIONS ----
      const onlineUsers = getOnlineUsers();
      const receiverStr = receiver.toString();
      const senderStr = sender.toString();
      
      // Check if receiver is online
      if (onlineUsers.has(receiverStr)) {
        console.log(`✅ Receiver ${receiverStr} is online, marking as delivered`);
        
        // Mark as delivered
        await Message.findByIdAndUpdate(
          msg._id, 
          { delivered: true }, 
          { new: true }
        );
        
        responseData.delivered = true;
        
        // Emit delivered status to sender
        console.log(`📡 Emitting message-delivered to sender: ${senderStr}`);
        emitToUser(senderStr, "message-delivered", { 
          messageId: msg._id,
          receiverId: receiverStr,
          deliveredAt: new Date()
        });
      } else {
        console.log(`📴 Receiver ${receiverStr} is offline, message will be delivered when they come online`);
      }
      
      // Emit new message to receiver (if online)
      if (onlineUsers.has(receiverStr)) {
        console.log(`📡 Emitting new-message to receiver: ${receiverStr}`);
        emitToUser(receiverStr, "new-message", responseData);
      }
      
      // Emit message-sent to sender
      console.log(`📡 Emitting message-sent to sender: ${senderStr}`);
      emitToUser(senderStr, "message-sent", responseData);
      
      console.log("📢 Private message broadcasted");
    }

    console.log("🎉 Message processing complete");
    
    // Return response
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: responseData
    });

  } catch (err) {
    console.error("❌ sendMessage error:", err);
    
    // Emit error to sender
    if (req.body.data) {
      try {
        const data = JSON.parse(req.body.data);
        if (data.sender) {
          const errorPayload = { 
            error: "Failed to send message",
            isGroup: data.isGroup || false,
            timestamp: new Date()
          };
          
          console.log(`📡 Emitting message-error to sender: ${data.sender}`);
          emitToUser(data.sender, "message-error", errorPayload);
        }
      } catch (e) {
        console.error("Could not parse data for error emission:", e);
      }
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server error while sending message",
      error: err.message
    });
  }
};



// Additional real-time endpoints
export const markMessageAsRead = async (req, res) => {
  try {
    const { messageId, userId } = req.body;
    const currentUserId = req.user._id;

    if (!messageId || !userId) {
      return res.status(400).json({ message: "Message ID and user ID are required" });
    }

    let updatedMessage;

    // Check if it's a group message
    const groupMessage = await GroupMessage.findById(messageId);
    if (groupMessage) {
      // Add user to readBy array if not already there
      if (!groupMessage.readBy.includes(userId)) {
        groupMessage.readBy.push(userId);
        updatedMessage = await groupMessage.save();
        
        // Emit read receipt to sender
        emitToUser(groupMessage.sender.toString(), "message-read", {
          messageId: groupMessage._id,
          readerId: userId,
          readAt: new Date()
        });
      }
    } else {
      // Private message
      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Verify user is receiver
      if (message.receiver.toString() !== currentUserId.toString()) {
        return res.status(403).json({ message: "Not authorized to mark this message as read" });
      }

      updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { read: true },
        { new: true }
      );

      // Emit read receipt to sender
      emitToUser(message.sender.toString(), "message-read", {
        messageId: message._id,
        readerId: currentUserId,
        readAt: new Date()
      });
    }

    res.json({
      success: true,
      message: "Message marked as read",
      data: updatedMessage
    });

  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const markMessageAsDelivered = async (req, res) => {
  try {
    const { messageId } = req.body;
    const currentUserId = req.user._id;

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify user is receiver
    if (message.receiver.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Mark as delivered
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { delivered: true },
      { new: true }
    );

    // Emit delivered receipt to sender
    emitToUser(message.sender.toString(), "message-delivered", {
      messageId: message._id,
      receiverId: currentUserId,
      deliveredAt: new Date()
    });

    res.json({
      success: true,
      message: "Message marked as delivered",
      data: updatedMessage
    });

  } catch (error) {
    console.error("Error marking message as delivered:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const resolveEncryptedKey = (msg, currentUserId) => {
  return String(msg.sender._id) === String(currentUserId)
    ? msg.senderEncryptedKey   // sender decrypts with this
    : msg.encryptedKey;        // receiver decrypts with this
};



export const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { receiverId } = req.params;
    const { isGroup } = req.query;

    // Validate receiverId
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: "Invalid receiver ID" });
    }

    if (isGroup === 'true') {
      // ---- GET GROUP MESSAGES ----
      
      // Validate group ID
      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      // Verify user is member of the group
      const group = await Group.findOne({
        _id: receiverId,
        members: currentUserId
      });

      if (!group) {
        return res.status(403).json({ message: "Not a member of this group" });
      }

      // Query for GroupMessage model
      const messages = await GroupMessage.find({
        group: receiverId
      })
      .populate('sender', 'username fullName profilePic email')
      .sort({ sentAt: 1 });

      // ✅ Normalize to string IDs with GridFS URLs
      const normalizedMessages = messages.map(msg => {
        const encryptedKeyForUser = resolveEncryptedKey(msg, currentUserId);

        return {
          _id: msg._id,
          sender: msg.sender._id,
          group: receiverId, // Group ID from params
          ciphertext: msg.ciphertext,
          type: msg.type,
          contentType: msg.contentType,
          
          // ✅ ONLY send the correct AES key
          encryptedKey: encryptedKeyForUser,
          senderEncryptedKey: msg.senderEncryptedKey, // Keep for sender

          // ✅ Process media with GridFS URLs
          media: msg.media ? msg.media.map(media => {
            // Determine correct encrypted key for this user
            const mediaEncryptedKey = String(msg.sender._id) === String(currentUserId)
              ? media.senderEncryptedKey
              : media.encryptedKey;

            return {
              url: media.url, // This should be /api/messages/media/:id from GridFS
              type: media.type,
              encryptedKey: mediaEncryptedKey,
              senderEncryptedKey: media.senderEncryptedKey, // Keep for sender
              originalName: media.originalName,
              fileSize: media.fileSize,
              isEncrypted: media.isEncrypted !== false, // Default to true
              fileId: media.fileId // Keep fileId for reference
            };
          }) : [],

          sentAt: msg.sentAt,
          delivered: msg.delivered,
          read: msg.read,
          readBy: msg.readBy || []
        };
      });

      return res.json(normalizedMessages);

    } else {
      // ---- GET PRIVATE MESSAGES ----
      
      // Validate user IDs
      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Query for private messages
      const messages = await Message.find({
        $or: [
          { sender: currentUserId, receiver: receiverId },
          { sender: receiverId, receiver: currentUserId }
        ]
      })
      .populate('sender', 'username fullName profilePic email')
      .populate('receiver', 'username fullName profilePic email')
      .sort({ sentAt: 1 });

      // ✅ Normalize to string IDs with GridFS URLs
      const normalizedMessages = messages.map(msg => {
        const encryptedKeyForUser = resolveEncryptedKey(msg, currentUserId);

        return {
          _id: msg._id,
          sender: msg.sender._id,
          receiver: msg.receiver._id,
          ciphertext: msg.ciphertext,
          type: msg.type,
          contentType: msg.contentType,

          // ✅ Only correct key sent
          encryptedKey: encryptedKeyForUser,
          senderEncryptedKey: msg.senderEncryptedKey, // Keep for sender

          // ✅ Process media with GridFS URLs
          media: msg.media ? msg.media.map(media => {
            // Determine correct encrypted key for this user
            const mediaEncryptedKey = String(msg.sender._id) === String(currentUserId)
              ? media.senderEncryptedKey
              : media.encryptedKey;

            return {
              url: media.url, // This should be /api/messages/media/:id from GridFS
              type: media.type,
              encryptedKey: mediaEncryptedKey,
              senderEncryptedKey: media.senderEncryptedKey, // Keep for sender
              originalName: media.originalName,
              fileSize: media.fileSize,
              isEncrypted: media.isEncrypted !== false, // Default to true
              fileId: media.fileId // Keep fileId for reference
            };
          }) : [],

          sentAt: msg.sentAt,
          delivered: msg.delivered,
          read: msg.read
        };
      });

      return res.json(normalizedMessages);
    }

  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching messages",
      error: err.message 
    });
  }
};



export const getUserForSideBar = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);

    // ✅ PRIVATE CHATS
    const privateChats = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { receiver: userId }]
        }
      },
      {
        $project: {
          otherUser: {
            $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"]
          },
          sender: 1,
          receiver: 1,
          ciphertext: 1,
          media: 1,
          sentAt: 1,
          delivered: 1,
          read: 1,
          encryptedKey: 1,
          senderEncryptedKey: 1,
          isGroup: { $literal: false }
        }
      },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: "$otherUser",
          lastMessage: { $first: "$ciphertext" },
          lastMessageMedia: { $first: "$media" },
          lastMessageTime: { $first: "$sentAt" },
          lastMessageEncryptedKey: { $first: "$encryptedKey" },
          lastMessageEncryptedKeySender: { $first: "$senderEncryptedKey" },
          lastMessageSenderId: { $first: "$sender" }, // ✅ added
          lastMessageDelivered: { $first: "$delivered" }, // ✅ added
          lastMessageRead: { $first: "$read" }, // ✅ added
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", userId] },
                    { $eq: ["$delivered", false] },
                    { $eq: ["$read", false] }
                  ]
                },
                1,
                0
              ]
            }
          },
          isGroup: { $first: "$isGroup" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: "$user._id",
          fullName: "$user.fullName",
          username: "$user.username",
          profilePic: "$user.profilePic",
          lastMessage: 1,
          lastMessageMedia: 1,
          lastMessageTime: 1,
          lastMessageEncryptedKey: 1,
          lastMessageEncryptedKeySender: 1,
          lastMessageSenderId: 1, // ✅ added
          lastMessageDelivered: 1, // ✅ added
          lastMessageRead: 1, // ✅ added
          unreadCount: 1,
          isGroup: 1,
          isOnline: "$user.isOnline"
        }
      }
    ]);

    // ✅ GROUP CHATS
    const groupChats = await Group.aggregate([
      { $match: { members: userId } },
      {
        $lookup: {
          from: "groupmessages",
          let: { groupId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$group", "$$groupId"] } } },
            { $sort: { sentAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                ciphertext: 1,
                media: 1,
                sentAt: 1,
                sender: 1,
                encryptedKey: 1,
                senderEncryptedKey: 1,
                delivered: 1,
                read: 1
              }
            }
          ],
          as: "lastMessage"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.sender",
          foreignField: "_id",
          as: "lastMessageSender"
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          admin: 1,
          members: 1,
          createdAt: 1,
          lastMessage: { $arrayElemAt: ["$lastMessage.ciphertext", 0] },
          lastMessageMedia: { $arrayElemAt: ["$lastMessage.media", 0] },
          lastMessageTime: { $arrayElemAt: ["$lastMessage.sentAt", 0] },
          lastMessageEncryptedKey: { $arrayElemAt: ["$lastMessage.encryptedKey", 0] },
          lastMessageEncryptedKeySender: { $arrayElemAt: ["$lastMessage.senderEncryptedKey", 0] },
          lastMessageSenderId: { $arrayElemAt: ["$lastMessage.sender", 0] }, // ✅ added
          lastMessageDelivered: { $arrayElemAt: ["$lastMessage.delivered", 0] }, // ✅ added
          lastMessageRead: { $arrayElemAt: ["$lastMessage.read", 0] }, // ✅ added
          lastMessageSender: { $arrayElemAt: ["$lastMessageSender", 0] },
          isGroup: { $literal: true },
          unreadCount: { $literal: 0 }
        }
      }
    ]);

    // ✅ MERGE + SORT
    const allChats = [...privateChats, ...groupChats].sort(
      (a, b) => new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime()
    );

    res.status(200).json(allChats);
  } catch (err) {
    console.error("❌ getUserForSideBar error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const searchUsers = async (req, res) => {
  try {
    console.log('🔍 Search controller called with query:', req.query.q);
    
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const currentUserId = req.user._id;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);

    // 1) Search friend's list with last message and unread count
    const friends = await User.aggregate([
      { $match: { _id: currentUserObjectId } },
      {
        $lookup: {
          from: "users",
          let: { friendIds: "$friends" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$friendIds"] },
                $or: [
                  { fullName: { $regex: searchRegex } },
                  { username: { $regex: searchRegex } },
                ],
              },
            },
            // Get last message with this user
            {
              $lookup: {
                from: "messages",
                let: { friendId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $or: [
                          {
                            $and: [
                              { $eq: ["$sender", currentUserObjectId] },
                              { $eq: ["$receiver", "$$friendId"] }
                            ]
                          },
                          {
                            $and: [
                              { $eq: ["$sender", "$$friendId"] },
                              { $eq: ["$receiver", currentUserObjectId] }
                            ]
                          }
                        ]
                      }
                    }
                  },
                  { $sort: { sentAt: -1 } },
                  { $limit: 1 },
                  {
                    $project: {
                      ciphertext: 1,
                      media: 1,
                      sentAt: 1,
                      delivered: 1,
                      read: 1,
                      encryptedKey: 1,
                      encryptedKeySender: 1 // ⭐ Include for search results
                    }
                  }
                ],
                as: "lastMessage"
              }
            },
            // Get unread count
            {
              $lookup: {
                from: "messages",
                let: { friendId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$sender", "$$friendId"] },
                          { $eq: ["$receiver", currentUserObjectId] },
                          { $eq: ["$delivered", false] },
                          { $eq: ["$read", false] }
                        ]
                      }
                    }
                  },
                  { $count: "count" }
                ],
                as: "unreadMessages"
              }
            },
            {
              $project: {
                _id: 1,
                fullName: 1,
                username: 1,
                profilePic: 1,
                isOnline: 1,
                lastMessage: { $arrayElemAt: ["$lastMessage.ciphertext", 0] },
                lastMessageTime: { $arrayElemAt: ["$lastMessage.sentAt", 0] },
                lastMessageMedia: { $arrayElemAt: ["$lastMessage.media", 0] },
                lastMessageEncryptedKey: { $arrayElemAt: ["$lastMessage.encryptedKey", 0] },
                lastMessageEncryptedKeySender: { $arrayElemAt: ["$lastMessage.encryptedKeySender", 0] }, // ⭐ Add
                unreadCount: { $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0] },
                lastMessageDelivered: { $arrayElemAt: ["$lastMessage.delivered", 0] },
                lastMessageRead: { $arrayElemAt: ["$lastMessage.read", 0] }
              },
            },
            { $limit: 20 },
          ],
          as: "matches",
        },
      },
      { $unwind: "$matches" },
      { $replaceRoot: { newRoot: "$matches" } },
    ]);

    // 2) Search groups where user is a member with last message
    const groups = await Group.aggregate([
      {
        $match: {
          members: currentUserObjectId,
          name: { $regex: searchRegex },
        },
      },
      // Get last group message
      {
        $lookup: {
          from: "groupmessages",
          let: { groupId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$group", "$$groupId"] } } },
            { $sort: { sentAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                ciphertext: 1,
                media: 1,
                sentAt: 1,
                sender: 1,
                encryptedKey: 1,
                encryptedKeySender: 1 // ⭐ Include for group messages
              }
            }
          ],
          as: "lastMessage"
        }
      },
      // Get unread count
      {
        $lookup: {
          from: "groupmessages",
          let: { groupId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { 
                  $and: [
                    { $eq: ["$group", "$$groupId"] },
                    { $ne: [currentUserObjectId, "$readBy"] }
                  ]
                }
              }
            },
            { $count: "count" }
          ],
          as: "unreadMessages"
        }
      },
      // Get sender info for last message
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.sender",
          foreignField: "_id",
          as: "lastMessageSender"
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          profilePic: 1,
          admin: 1,
          members: 1,
          lastMessage: { $arrayElemAt: ["$lastMessage.ciphertext", 0] },
          lastMessageTime: { $arrayElemAt: ["$lastMessage.sentAt", 0] },
          lastMessageMedia: { $arrayElemAt: ["$lastMessage.media", 0] },
          lastMessageEncryptedKey: { $arrayElemAt: ["$lastMessage.encryptedKey", 0] },
          lastMessageEncryptedKeySender: { $arrayElemAt: ["$lastMessage.encryptedKeySender", 0] }, // ⭐ Add
          lastMessageSender: { $arrayElemAt: ["$lastMessageSender.username", 0] },
          unreadCount: { $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0] },
          type: { $literal: "group" }
        }
      },
      { $limit: 20 },
    ]);

    // Format users for response
    const userResults = (friends || []).map((u) => ({
      _id: u._id,
      name: u.fullName || u.username,
      profilePic: u.profilePic || null,
      isOnline: !!u.isOnline,
      lastMessage: u.lastMessage || null,
      lastMessageTime: u.lastMessageTime || null,
      lastMessageMedia: u.lastMessageMedia || null,
      lastMessageEncryptedKey: u.lastMessageEncryptedKey || null,
      lastMessageEncryptedKeySender: u.lastMessageEncryptedKeySender || null, // ⭐ Add to response
      unreadCount: u.unreadCount || 0,
      lastMessageDelivered: u.lastMessageDelivered || false,
      lastMessageRead: u.lastMessageRead || false,
      type: "user",
    }));

    // Format groups for response
    const groupResults = (groups || []).map((g) => ({
      _id: g._id,
      name: g.name,
      profilePic: g.profilePic || null,
      lastMessage: g.lastMessage ? 
        (g.lastMessageSender ? `${g.lastMessageSender}: ${g.lastMessage}` : g.lastMessage) : 
        null,
      lastMessageTime: g.lastMessageTime || null,
      lastMessageMedia: g.lastMessageMedia || null,
      lastMessageEncryptedKey: g.lastMessageEncryptedKey || null,
      lastMessageEncryptedKeySender: g.lastMessageEncryptedKeySender || null, // ⭐ Add to response
      unreadCount: g.unreadCount || 0,
      type: "group",
    }));

    // Combine and sort by last message time (newest first)
    const results = [...userResults, ...groupResults].sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return timeB - timeA;
    });

    console.log(`✅ Search complete: ${results.length} results`);

    return res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("❌ Search error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during search",
    });
  }
};