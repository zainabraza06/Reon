import mongoose from "mongoose";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { getOnlineUsers, emitToUser } from "../lib/socket.js";
import { GridFSBucket } from 'mongodb';

// Save encrypted file to GridFS
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
          extension: extension,
          isEncrypted: true,
          uploadedAt: new Date(),
          isTemp: false
        }
      });
      
      uploadStream.end(fileBuffer);
      
      uploadStream.on('finish', () => {
        console.log(`✅ Encrypted file saved to GridFS: ${uploadStream.id}`);
        resolve({ 
          url: `/api/messages/media/${uploadStream.id}`,
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
    
    // Set CORS headers for media display
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
          contentType = 'image/jpeg';
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
          contentType = 'video/mp4';
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
          contentType = 'audio/mpeg';
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
          const savedFile = await saveEncryptedFileToGridFS(
            file.buffer, 
            originalName, 
            i, 
            fileType
          );

          mediaArray.push({
            url: savedFile.url,
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
          continue;
        }
      }
    }

    // Verify receiver exists
    const receiverExists = await User.findById(receiver);
    if (!receiverExists) {
      console.error("❌ Receiver not found:", receiver);
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Create message
    const msg = await Message.create({
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

    // Convert IDs to strings for socket operations
    const receiverStr = receiver.toString();
    const senderStr = sender.toString();
    const onlineUsers = getOnlineUsers();
    
    // Prepare response data
    const responseData = {
      _id: msg._id,
      sender: senderStr,
      receiver: receiverStr,
      ciphertext: msg.ciphertext,
      type: msg.type,
      contentType: msg.contentType,
      encryptedKey: msg.encryptedKey,
      senderEncryptedKey: msg.senderEncryptedKey,
      media: msg.media,
      sentAt: msg.sentAt,
      delivered: false, // Will update if receiver is online
      read: false
    };

    // Payload for the RECEIVER — they should get THEIR encryptedKey
    const receiverPayload = {
      _id: msg._id,
      sender: senderStr,
      receiver: receiverStr,
      ciphertext: msg.ciphertext,
      type: msg.type,
      contentType: msg.contentType,
      encryptedKey: msg.encryptedKey,          // receiver's key
      media: msg.media,
      sentAt: msg.sentAt,
      delivered: false,
      read: false
    };

    // Payload for the SENDER — they should get THEIR OWN senderEncryptedKey
    const senderPayload = {
      _id: msg._id,
      sender: senderStr,
      receiver: receiverStr,
      ciphertext: msg.ciphertext,
      type: msg.type,
      contentType: msg.contentType,
      encryptedKey: msg.senderEncryptedKey,     // sender's key
      media: msg.media,
      sentAt: msg.sentAt,
      delivered: false,
      read: false
    };

    // ---- REAL-TIME PRIVATE EMISSIONS ----
    console.log("Online users:", onlineUsers);
    
    // Check if receiver is online
    if (onlineUsers.includes(receiverStr)) {
      console.log(`✅ Receiver ${receiverStr} is online, marking as delivered`);
      
      // Mark as delivered
      await Message.findByIdAndUpdate(
        msg._id, 
        { delivered: true }, 
        { new: true }
      );
      
      // Update payloads with delivered status
      responseData.delivered = true;
      receiverPayload.delivered = true;
      senderPayload.delivered = true;
      
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
    if (onlineUsers.includes(receiverStr)) {
      console.log(`📡 Emitting new-message to receiver: ${receiverStr}`);
      emitToUser(receiverStr, "new-message", receiverPayload);
    }
    
    // Emit message-sent to sender
    console.log(`📡 Emitting message-sent to sender: ${senderStr}`);
    emitToUser(senderStr, "message-sent", senderPayload);
    
    console.log("📢 Private message broadcasted");
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
            timestamp: new Date()
          };
          
          console.log(`📡 Emitting message-error to sender: ${data.sender}`);
          emitToUser(data.sender.toString(), "message-error", errorPayload);
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
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    // Private message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify user is receiver
    if (message.receiver.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Not authorized to mark this message as read" });
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { read: true },
      { new: true }
    );
   

    console.log("Message Updated to read");
    // Emit read receipt to sender
    emitToUser(message.sender.toString(), "message-read", {
      messageId: message._id,
      readerId: currentUserId,
      readAt: new Date()
    });


    console.log9("EVen emeited message read");

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
    const { messageId } = req.params;
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
    ? msg.senderEncryptedKey
    : msg.encryptedKey;
};

export const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { receiverId } = req.params;

    // Validate receiverId
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: "Invalid receiver ID" });
    }

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

    // Normalize to string IDs with GridFS URLs
    const normalizedMessages = messages.map(msg => {
      const encryptedKeyForUser = resolveEncryptedKey(msg, currentUserId);

      return {
        _id: msg._id,
        sender: msg.sender._id,
        receiver: msg.receiver._id,
        ciphertext: msg.ciphertext,
        type: msg.type,
        contentType: msg.contentType,
        encryptedKey: encryptedKeyForUser,
        senderEncryptedKey: msg.senderEncryptedKey,
        media: msg.media ? msg.media.map(media => {
          // Determine correct encrypted key for this user
          const mediaEncryptedKey = String(msg.sender._id) === String(currentUserId)
            ? media.senderEncryptedKey
            : media.encryptedKey;

          return {
            url: media.url,
            type: media.type,
            encryptedKey: mediaEncryptedKey,
            senderEncryptedKey: media.senderEncryptedKey,
            originalName: media.originalName,
            fileSize: media.fileSize,
            isEncrypted: media.isEncrypted !== false,
            fileId: media.fileId
          };
        }) : [],
        sentAt: msg.sentAt,
        delivered: msg.delivered,
        read: msg.read
      };
    });

    return res.json(normalizedMessages);

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
          // Add isFromOtherUser field to identify messages from others
          isFromOtherUser: {
            $cond: [{ $eq: ["$sender", userId] }, false, true]
          }
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
          lastMessageSenderId: { $first: "$sender" },
          lastMessageDelivered: { $first: "$delivered" },
          lastMessageRead: { $first: "$read" },
          // CORRECTED: Count unread messages from the other user to current user
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", userId] }, // Messages to current user
                    { $eq: ["$read", false] }, // Not read yet
                    { $ne: ["$sender", userId] } // From other user (not self)
                  ]
                },
                1,
                0
              ]
            }
          }
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
          encryptedKey: {
            $cond: [
              { $eq: ["$lastMessageSenderId", userId] },
              "$lastMessageEncryptedKeySender",
              "$lastMessageEncryptedKey"
            ]
          },
          lastMessageDelivered: 1,
          lastMessageRead: 1,
          unreadCount: 1,
          isOnline: "$user.isOnline",
          // Add this for frontend to know if there are unread messages
          hasUnread: { $gt: ["$unreadCount", 0] }
        }
      },
      { $sort: { lastMessageTime: -1 } }
    ]);

    res.status(200).json(privateChats);
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

            // ⭐ Last Message Lookup
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
                      senderEncryptedKey: 1,
                      sender: 1
                    }
                  }
                ],
                as: "lastMessage"
              }
            },

            // ⭐ Safe Media Type Extraction
            {
              $addFields: {
                lastMessageMediaType: {
                  $let: {
                    vars: {
                      mediaArray: {
                        $ifNull: [
                          { $arrayElemAt: ["$lastMessage.media", 0] },
                          []
                        ]
                      }
                    },
                    in: {
                      $cond: {
                        if: { $gt: [{ $size: "$$mediaArray" }, 0] },
                        then: {
                          $arrayElemAt: ["$$mediaArray.type", 0]
                        },
                        else: null
                      }
                    }
                  }
                }
              }
            },

            // ⭐ Unread Messages
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

            // ⭐ Final Shape
            {
              $project: {
                _id: 1,
                fullName: 1,
                username: 1,
                profilePic: 1,
                isOnline: 1,

                lastMessage: { $arrayElemAt: ["$lastMessage.ciphertext", 0] },
                lastMessageTime: { $arrayElemAt: ["$lastMessage.sentAt", 0] },
                lastMessageMedia: "$lastMessageMediaType",
                lastMessageSenderId: { $arrayElemAt: ["$lastMessage.sender", 0] },

                encryptedKeyRaw: { $arrayElemAt: ["$lastMessage.encryptedKey", 0] },
                encryptedKeySenderRaw: { $arrayElemAt: ["$lastMessage.senderEncryptedKey", 0] },

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

    // ⭐ Map encrypted keys correctly and include lastMessageSenderId
    const results = friends.map(u => ({
      _id: u._id,
      name: u.fullName || u.username,
      profilePic: u.profilePic || null,
      isOnline: !!u.isOnline,

      lastMessage: u.lastMessage || null,
      lastMessageTime: u.lastMessageTime || null,
      lastMessageMedia: u.lastMessageMedia || null,
      lastMessageSenderId: u.lastMessageSenderId ? String(u.lastMessageSenderId) : null,

      encryptedKey:
        String(u.lastMessageSenderId) === String(currentUserId)
          ? u.encryptedKeySenderRaw
          : u.encryptedKeyRaw,

      unreadCount: u.unreadCount || 0,
      lastMessageDelivered: u.lastMessageDelivered || false,
      lastMessageRead: u.lastMessageRead || false,
      type: "user",
    }));

    // ⭐ Sort by last message time
    results.sort((a, b) => {
      const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return tB - tA;
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



export const markChatAsRead = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false,
        message: "Valid user ID is required" 
      });
    }

    // Get unread messages before updating
    const unreadMessages = await Message.find({
      sender: userId,
      receiver: currentUserId,
      read: false
    }).select('_id sender');

    if (unreadMessages.length === 0) {
      return res.json({
        success: true,
        message: "No unread messages to mark",
        data: { markedCount: 0 }
      });
    }

    // Mark all as read
    const result = await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        read: false
      },
      {
        $set: { 
          read: true, 
          readAt: new Date(),
          delivered: true // Also ensure delivered is true when read
        }
      }
    );

    console.log("All Messages Marked as Read");

    // Emit events for all marked messages
    unreadMessages.forEach(msg => {
      emitToUser(msg.sender.toString(), "message-read", {
        messageIds: unreadMessages.map(m => m._id.toString()),
        readerId: currentUserId.toString(),
        readAt: new Date()
      });
    });

    console.log("event message read emitted");

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} messages as read`,
      data: {
        markedCount: result.modifiedCount,
        chatWith: userId,
        messageIds: unreadMessages.map(msg => msg._id.toString())
      }
    });

  } catch (error) {
    console.error("❌ Error marking chat as read:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error",
      error: error.message 
    });
  }
};