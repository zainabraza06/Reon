



import mongoose from "mongoose";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { getOnlineUsers, emitToUser } from "../lib/socket.js";
import { GridFSBucket } from 'mongodb';

// Save encrypted file to GridFS
const saveEncryptedFileToGridFS = async (fileBuffer, originalName, index, fileType = "document", encryptionIV = null) => {
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
      
      // Prepare metadata with encryption IV
      const metadata = {
        originalName: originalName,
        type: fileType,
        extension: extension,
        isEncrypted: true,
        uploadedAt: new Date(),
        isTemp: false
      };
      
      // Store IV in metadata if provided
      if (encryptionIV) {
        metadata.encryptionIV = encryptionIV;
      }
      
      const uploadStream = bucket.openUploadStream(fileName, { metadata });
      
      uploadStream.end(fileBuffer);
      
      uploadStream.on('finish', () => {
        console.log(`✅ Encrypted file saved to GridFS: ${uploadStream.id}`);
        console.log(`🔐 Encryption IV stored: ${encryptionIV ? 'Yes' : 'No'}`);
        resolve({ 
          url: `/api/messages/media/${uploadStream.id}`,
          downloadUrl: `/api/messages/download/${uploadStream.id}`,
          fileId: uploadStream.id.toString(),
          fileName: fileName,
          metadata: metadata
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
    const fileSize = file.length || 0;
    
    // Set CORS headers for media display
    res.setHeader('Access-Control-Allow-Origin', 'https://reon-tau.vercel.app');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Range, Accept-Ranges, ETag, X-Encryption-IV, X-File-Name');
    
    // Determine content type
    let contentType = 'application/octet-stream';
    const originalName = file.metadata?.originalName || '';
    const isVideo = file.metadata?.type === 'video';
    const isAudio = file.metadata?.type === 'audio';
    const isImage = file.metadata?.type === 'image';
    
    // Get extension from metadata or original filename
    let extension = '';
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
      default:
        contentType = 'application/octet-stream';
    }
    
    // Generate ETag for caching (using file ID and upload date)
    const etag = `"${fileId}-${file.uploadDate?.getTime() || file._id}"`;
    res.setHeader('ETag', etag);
    
    // Check if client has cached version
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end(); // Not Modified
    }
    
    // Set caching headers (7 days for images, 1 day for videos/audio, no cache for encrypted files by default)
    if (isImage) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 days
    } else if (isVideo || isAudio) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour for documents
    }
    
    // Support range requests for video/audio (essential for seeking and performance)
    if ((isVideo || isAudio) && fileSize > 0) {
      res.setHeader('Accept-Ranges', 'bytes');
      
      const range = req.headers.range;
      if (range) {
        // Parse range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
          return res.end();
        }
        
        res.status(206); // Partial Content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunksize);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
        
        // Add encryption IV header if available
        if (file.metadata?.encryptionIV) {
          res.setHeader('X-Encryption-IV', file.metadata.encryptionIV);
        }
        
        // Add original filename header
        if (originalName) {
          res.setHeader('X-File-Name', encodeURIComponent(originalName));
        }
        
        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId), {
          start: start,
          end: end
        });
        
        downloadStream.pipe(res);
        
        downloadStream.on('error', (error) => {
          console.error('Error streaming media range:', error);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming media' });
          }
        });
        
        return; // Early return for range requests
      }
    }
    
    // Standard full file response
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    
    // Add encryption IV header if available
    if (file.metadata?.encryptionIV) {
      res.setHeader('X-Encryption-IV', file.metadata.encryptionIV);
    }
    
    // Add original filename header
    if (originalName) {
      res.setHeader('X-File-Name', encodeURIComponent(originalName));
    }
    
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error) => {
      console.error('Error streaming media:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming media' });
      }
    });
    
  } catch (error) {
    console.error('Media serve error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
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
    res.setHeader('Access-Control-Allow-Origin', 'https://reon-tau.vercel.app');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Encrypted, X-Encryption-IV, X-File-Name');
    
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
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('X-Encrypted', 'true');
    
    // Add encryption IV header if available
    if (file.metadata?.encryptionIV) {
      res.setHeader('X-Encryption-IV', file.metadata.encryptionIV);
    }
    
    // Add original filename header
    if (originalName) {
      res.setHeader('X-File-Name', encodeURIComponent(originalName));
    }
    
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

    // Get current user ID from auth middleware
    const currentUserId = req.user?._id?.toString();
    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized: User not authenticated" });
    }

    // Parse message data
    let messageData = {};
    try {
      messageData = JSON.parse(req.body.data || '{}');
      console.log("📊 Parsed message data:", {
        sender: messageData.sender,
        receiver: messageData.receiver,
        contentType: messageData.contentType,
        ciphertextLength: messageData.ciphertext?.length || 0,
        hasEncryptedKey: !!messageData.encryptedKey,
        hasSenderEncryptedKey: !!messageData.senderEncryptedKey
      });
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
    
    // Check for text content or media
    const hasText = ciphertext && ciphertext.trim() !== '';
    const hasMedia = req.files && req.files.length > 0;
    
    // Regular messages: validate based on content type
    if (hasText) {
      if (!encryptedKey) missingFields.push("encryptedKey");
      if (!senderEncryptedKey) missingFields.push("senderEncryptedKey");
    }
    
    if (missingFields.length > 0) {
      console.error("❌ Missing required fields:", missingFields);
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Ensure the current user is either the sender or receiver
    const isSender = currentUserId === sender;
    const isReceiver = currentUserId === receiver;
    
    if (!isSender && !isReceiver) {
      console.error("❌ User not authorized for this message:", {
        currentUser: currentUserId,
        sender,
        receiver
      });
      return res.status(403).json({ 
        message: "You are not authorized to send this message" 
      });
    }

    console.log(`🔍 Message type: ${hasText ? 'TEXT' : ''}${hasMedia ? 'MEDIA' : ''}`);

    // Validate text messages
    if (hasText) {
      if (!encryptedKey || !senderEncryptedKey) {
        console.error("❌ Text message missing encryption keys");
        return res.status(400).json({ 
          message: "Text messages require both encryptedKey and senderEncryptedKey" 
        });
      }
    }

    // Validate media messages
    if (hasMedia) {
      if (!req.body.mediaEncryptedKey || !req.body.mediaSenderEncryptedKey) {
        console.error("❌ Media message missing encryption keys");
        return res.status(400).json({ 
          message: "Media messages require both mediaEncryptedKey and mediaSenderEncryptedKey" 
        });
      }
      
      // Ensure only one file is sent
      if (req.files.length > 1) {
        console.error("❌ Multiple files received in single request");
        return res.status(400).json({ 
          message: "Only one media file allowed per message" 
        });
      }
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(sender) || !mongoose.Types.ObjectId.isValid(receiver)) {
      console.error("❌ Invalid ObjectId:", { sender, receiver });
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // ---- HANDLE SINGLE MEDIA FILE ----
    const mediaArray = [];
    if (hasMedia) {
      const file = req.files[0]; // Only one file
      console.log(`📦 Processing media file: ${file.originalname || 'unnamed'}, size: ${file.size} bytes`);
      
      try {
        // Get metadata from form data
        const fileType = req.body.mediaType || contentType || "document";
        const mediaEncryptedKey = req.body.mediaEncryptedKey;
        const mediaSenderEncryptedKey = req.body.mediaSenderEncryptedKey;
        const originalName = req.body.originalName || file.originalname || `file_${Date.now()}`;
        const encryptionIV = req.body.encryptionIV || null;

        console.log(`📁 File details: ${originalName}, type: ${fileType}`);
        
        if (encryptionIV) {
          console.log(`🔐 Has encryption IV: ${encryptionIV.substring(0, 20)}...`);
        }

        // Save encrypted blob to GridFS
        const savedFile = await saveEncryptedFileToGridFS(
          file.buffer, 
          originalName, 
          0, // Single file, index 0
          fileType,
          encryptionIV
        );

        mediaArray.push({
          url: `/api/messages/media/${savedFile.fileId}`,
          downloadUrl: `/api/messages/download/${savedFile.fileId}`,
          type: fileType,
          fileName: originalName,
          encryptedKey: mediaEncryptedKey,      // For receiver
          senderEncryptedKey: mediaSenderEncryptedKey, // For sender
          encryptionIV: encryptionIV,
          fileSize: file.size,
          isEncrypted: true,
          fileId: savedFile.fileId
        });

        console.log(`✅ Media file saved to GridFS: ${savedFile.fileId}`);

      } catch (fileError) {
        console.error("❌ Error processing media file:", fileError);
        return res.status(500).json({ 
          message: `Failed to process media file: ${fileError.message}` 
        });
      }
    }

    // Verify receiver exists
    const receiverExists = await User.findById(receiver);
    if (!receiverExists) {
      console.error("❌ Receiver not found:", receiver);
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Determine final contentType
    let finalContentType = contentType;
    let finalCiphertext = ciphertext || "";
    let finalEncryptedKey = encryptedKey || "";
    let finalSenderEncryptedKey = senderEncryptedKey || "";

    // For media-only messages
    if (hasMedia && !hasText) {
      finalContentType = mediaArray[0]?.type || "document";
      finalCiphertext = "";
      finalEncryptedKey = "";
      finalSenderEncryptedKey = "";
    }

    // Create regular message
    const msg = await Message.create({
      sender,
      receiver,
      ciphertext: finalCiphertext,
      type,
      contentType: finalContentType,
      encryptedKey: finalEncryptedKey,
      senderEncryptedKey: finalSenderEncryptedKey,
      media: mediaArray
    });
    
    console.log(`✅ Private message created: ${msg._id}`);
    console.log(`   Type: ${msg.contentType}`);
    console.log(`   Has Text: ${msg.ciphertext ? 'Yes' : 'No'}`);
    console.log(`   Media: ${msg.media.length > 0 ? 'Yes' : 'No'}`);

    // Helper function to get appropriate encrypted key
    const getEncryptedKeyForUser = (message, userId) => {
      const isSender = message.sender.toString() === userId;
      
      // For text messages
      if (message.ciphertext && message.ciphertext.trim() !== '') {
        return isSender ? message.senderEncryptedKey : message.encryptedKey;
      }
      
      // For media messages
      if (message.media && message.media.length > 0) {
        const media = message.media[0];
        return isSender ? media.senderEncryptedKey : media.encryptedKey;
      }
      
      return "";
    };

    // Helper function to format media for user
    const formatMediaForUser = (mediaArray, userId) => {
      if (!mediaArray || mediaArray.length === 0) return [];
      
      return mediaArray.map(media => {
        const isSender = msg.sender.toString() === userId;
        return {
          url: media.url,
          downloadUrl: media.downloadUrl,
          type: media.type,
          fileName: media.fileName,
          encryptedKey: isSender ? media.senderEncryptedKey : media.encryptedKey,
          senderEncryptedKey: media.senderEncryptedKey,
          encryptionIV: media.encryptionIV,
          fileSize: media.fileSize,
          isEncrypted: media.isEncrypted,
          fileId: media.fileId
        };
      });
    };

    // Prepare response data for the current user
    const responseData = {
      _id: msg._id,
      sender: msg.sender.toString(),
      receiver: msg.receiver.toString(),
      ciphertext: msg.ciphertext,
      type: msg.type,
      contentType: msg.contentType,
      encryptedKey: getEncryptedKeyForUser(msg, currentUserId),
      media: formatMediaForUser(msg.media, currentUserId),
      sentAt: msg.sentAt,
      delivered: false,
      deliveredAt: null,
      read: false,
      status: 'sent'
    };

    console.log(`🔑 Response key for user ${currentUserId} (isSender: ${isSender}):`, 
      responseData.encryptedKey?.substring(0, 64) + '...');

    // ---- REAL-TIME EMISSIONS ----
    const onlineUsers = getOnlineUsers();
    const isReceiverOnline = onlineUsers.includes(receiver.toString());
    
    if (isReceiverOnline) {
        console.log(`✅ Receiver ${receiver} is online - marking as delivered`);
        
        // Mark as delivered
        await Message.findByIdAndUpdate(
            msg._id, 
            { 
                delivered: true, 
                deliveredAt: new Date(),
                status: 'delivered' 
            }, 
            { new: true }
        );
        
        // Update response data
        responseData.delivered = true;
        responseData.deliveredAt = new Date();
        responseData.status = 'delivered';
        
        // Prepare payload for the RECEIVER
        const receiverPayload = {
          _id: msg._id,
          sender: msg.sender.toString(),
          receiver: msg.receiver.toString(),
          ciphertext: msg.ciphertext,
          type: msg.type,
          contentType: msg.contentType,
          encryptedKey: getEncryptedKeyForUser(msg, receiver),
          media: formatMediaForUser(msg.media, receiver),
          sentAt: msg.sentAt,
          delivered: true,
          deliveredAt: new Date(),
          read: false,
          status: 'delivered'
        };
        
        // Prepare payload for the SENDER
        const senderPayload = {
          _id: msg._id,
          sender: msg.sender.toString(),
          receiver: msg.receiver.toString(),
          ciphertext: msg.ciphertext,
          type: msg.type,
          contentType: msg.contentType,
          encryptedKey: getEncryptedKeyForUser(msg, sender),
          media: formatMediaForUser(msg.media, sender),
          sentAt: msg.sentAt,
          delivered: true,
          deliveredAt: new Date(),
          read: false,
          status: 'delivered'
        };
        
        console.log(`📤 Emitting to receiver ${receiver}: "new-message"`);
        emitToUser(receiver.toString(), "new-message", receiverPayload);
        
        console.log(`📤 Emitting to sender ${sender}: "message-sent" (receiver online)`);
        // ALWAYS emit to sender, even if they're the current user
        emitToUser(sender.toString(), "message-sent", senderPayload);
        
    } else {
        console.log(`📴 Receiver ${receiver} is offline`);
        
        // Prepare sender payload
        const senderPayload = {
          _id: msg._id,
          sender: msg.sender.toString(),
          receiver: msg.receiver.toString(),
          ciphertext: msg.ciphertext,
          type: msg.type,
          contentType: msg.contentType,
          encryptedKey: getEncryptedKeyForUser(msg, sender),
          media: formatMediaForUser(msg.media, sender),
          sentAt: msg.sentAt,
          delivered: false,
          deliveredAt: null,
          read: false,
          status: 'sent'
        };
        
        console.log(`📤 Emitting to sender ${sender}: "message-sent" (receiver offline)`);
        // ALWAYS emit to sender
        emitToUser(sender.toString(), "message-sent", senderPayload);
    }

    console.log("📤 Response data:", {
      messageId: responseData._id,
      userType: isSender ? 'sender' : 'receiver',
      contentType: responseData.contentType
    });

    // Return response to the current user
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: responseData
    });

  } catch (err) {
    console.error("❌ sendMessage error:", err);
    
    // Emit error to sender if the current user is the sender
    if (req.body.data && req.user?._id) {
      try {
        const data = JSON.parse(req.body.data);
        const currentUserId = req.user._id.toString();
        
        if (data.sender && data.sender === currentUserId) {
          const errorPayload = { 
            error: "Failed to send message",
            timestamp: new Date(),
            messageId: data.messageId || null
          };
          
          emitToUser(currentUserId, "message-error", errorPayload);
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
export const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { receiverId } = req.params;
    const limitParam = parseInt(req.query.limit, 10) || 50;
    const before = req.query.before; // ISO date string expected
    const limit = Math.min(Math.max(limitParam, 5), 200); // clamp between 5 and 200

    // Validate receiverId
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: "Invalid receiver ID" });
    }

    // Build base filter for private messages
    const baseFilter = {
      $or: [
        { sender: currentUserId, receiver: receiverId },
        { sender: receiverId, receiver: currentUserId }
      ]
    };

    let query = Message.find(baseFilter)
      .populate('sender', 'username fullName profilePic email')
      .populate('receiver', 'username fullName profilePic email');

    // If `before` provided, load messages older than that timestamp
    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        query = query.where('sentAt').lt(beforeDate).sort({ sentAt: -1 }).limit(limit);
      } else {
        // invalid before parameter
        return res.status(400).json({ message: 'Invalid before parameter' });
      }
    } else {
      // No before -> load latest `limit` messages
      query = query.sort({ sentAt: -1 }).limit(limit);
    }

    // Execute query
    let messages = await query.exec();

    // Query returns newest-first due to sort({sentAt:-1}); normalize to ascending order
    messages = messages.reverse();

    console.log(`📥 Found ${messages.length} messages between users (limit ${limit}${before ? ', before '+before : ''})`);

    // Normalize messages
    const normalizedMessages = messages.map(msg => {
      // Get correct encrypted key for TEXT
      const textEncryptedKey = resolveEncryptedKey(msg, currentUserId);

      // Build response with ONLY ONE encryptedKey field
      const response = {
        _id: msg._id,
        sender: msg.sender._id,
        receiver: msg.receiver._id,
        ciphertext: msg.ciphertext,
        type: msg.type,
        contentType: msg.contentType,
        encryptedKey: textEncryptedKey, // ← ONLY ONE FIELD, resolved by function
        media: [], // Media will be processed below
        sentAt: msg.sentAt,
        delivered: msg.delivered || false,
        read: msg.read || false,
        status: msg.delivered ? 'delivered' : 'sent'
      };

      // Process media files
      if (msg.media && msg.media.length > 0) {
        response.media = msg.media.map(media => {
          // Get correct encrypted key for MEDIA (same logic)
          const isCurrentUserSender = String(msg.sender._id) === String(currentUserId);
          const mediaEncryptedKey = isCurrentUserSender
            ? media.senderEncryptedKey
            : media.encryptedKey;

          return {
            // URLs
            url: media.url,
            downloadUrl: media.downloadUrl || media.url,
            
            // File info
            type: media.type,
            fileName: media.fileName || media.originalName,
            fileSize: media.fileSize,
            originalName: media.originalName,
            
            // Encryption - ONLY ONE encryptedKey field here too
            encryptedKey: mediaEncryptedKey, // ← Media's encrypted key
            encryptionIV: media.encryptionIV, // Required for decryption
            
            // Metadata
            isEncrypted: media.isEncrypted !== false,
            fileId: media.fileId
          };
        });
        
        console.log(`   📁 Message ${msg._id} has ${msg.media.length} media files`);
      }
     console.log("response", response);
      return response;
    });

    console.log(`✅ Successfully normalized ${normalizedMessages.length} messages`);
    
    return res.json({
      success: true,
      data: normalizedMessages
    });

  } catch (err) {
    console.error("❌ getMessages error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching messages",
      error: err.message 
    });
  }
};

const resolveEncryptedKey = (msg, currentUserId) => {
  return String(msg.sender._id) === String(currentUserId)
    ? msg.senderEncryptedKey
    : msg.encryptedKey;
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
          delivered: 1, // use your boolean field
          read: 1,      // use your boolean field
          encryptedKey: 1,
          senderEncryptedKey: 1,
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
          delivered: { $first: "$delivered" }, // boolean
          read: { $first: "$read" },           // boolean
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", userId] },
                    { $eq: ["$read", false] },
                    { $ne: ["$sender", userId] }
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
          lastMessageSenderId: 1,
          encryptedKey: {
            $cond: [
              { $eq: ["$lastMessageSenderId", userId] },
              "$lastMessageEncryptedKeySender",
              "$lastMessageEncryptedKey"
            ]
          },
          delivered: 1, // boolean
          read: 1,      // boolean
          sent: { $cond: [{ $ne: ["$lastMessageTime", null] }, true, false] }, // derived from sentAt
          unreadCount: 1,
          isOnline: "$user.isOnline",
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
                lastMessageRead: { $arrayElemAt: ["$lastMessage.read", 0] },

                // ⭐ Derived sent field
                sent: { $cond: [{ $ne: [{ $arrayElemAt: ["$lastMessage.sentAt", 0] }, null] }, true, false] },

                // ⭐ Frontend-friendly hasUnread
                hasUnread: {
                  $gt: [{ $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0] }, 0]
                }
              }
            },

            { $limit: 20 },
          ],
          as: "matches",
        },
      },

      { $unwind: "$matches" },
      { $replaceRoot: { newRoot: "$matches" } },
    ]);

    // ⭐ Map encrypted keys correctly
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
      hasUnread: u.hasUnread || false,
      delivered: u.lastMessageDelivered || false,
      read: u.lastMessageRead || false,
      sent: u.sent || false,
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

    const messageIds = unreadMessages.map(m => m._id.toString());

    // Mark all as read
    const result = await Message.updateMany(
      { sender: userId, receiver: currentUserId, read: false },
      { $set: { read: true, readAt: new Date(), delivered: true } }
    );

    console.log("All Messages Marked as Read");

    // 🔥 Emit events ONCE
    const payload = {
      messageIds,
      readerId: currentUserId.toString(),
      readAt: new Date(),
      status: "read"
    };

    // Notify the sender once
    emitToUser(userId, "message-read", payload);

    // Notify the current user (receiver) once
    emitToUser(currentUserId.toString(), "message-read", payload);

    console.log("Event message-read emitted to sender and receiver");

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} messages as read`,
      data: {
        markedCount: result.modifiedCount,
        chatWith: userId,
        messageIds
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
