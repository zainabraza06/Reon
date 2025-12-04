import mongoose from "mongoose";
import Message from "../models/Message.js";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import User from "../models/User.js";
import { getIO, getOnlineUsers, emitToUser, emitToGroup } from "../lib/socket.js";
import cloudinary from "../lib/cloudinary.js";

// ---- SEND MESSAGE (TEXT OR MEDIA) ----
export const sendMessage = async (req, res) => {
  try {
    const { sender, receiver, ciphertext, type, isGroup = false } = req.body;

    // ---- HANDLE MEDIA IF PRESENT ----
    const mediaArray = [];
    if (req.files?.length) {
      for (const file of req.files) {
        const uploaded = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "chat_media" },
            (err, result) => (err ? reject(err) : resolve(result))
          ).end(file.buffer);
        });

        mediaArray.push({
          url: uploaded.secure_url,
          type:
            file.mimetype.startsWith("image") ? "image" :
            file.mimetype.startsWith("audio") ? "audio" :
            file.mimetype.startsWith("video") ? "video" :
            "document",
          encryptedKey: file.encryptedKey || ""
        });
      }
    }

    let msg;
    
    if (isGroup) {
      // ---- GROUP MESSAGE ----
      msg = await GroupMessage.create({
        sender,
        group: receiver, // receiver is actually groupId for group messages
        ciphertext,
        type,
        media: mediaArray
      });

      // Populate sender info
      msg = await GroupMessage.findById(msg._id)
        .populate('sender', 'username fullName profilePic email')
        .populate('group', 'name admin members');

      // ---- REAL-TIME GROUP DELIVERY ----
      emitToGroup(receiver, "new-group-message", msg);
      emitToUser(sender, "group-message-sent", msg);

      // Update group last activity
      await Group.findByIdAndUpdate(receiver, {
        lastActivity: new Date()
      });

    } else {
      // ---- PRIVATE MESSAGE ----
      msg = await Message.create({
        sender,
        receiver,
        ciphertext,
        type,
        media: mediaArray
      });

      // Populate sender and receiver info
      msg = await Message.findById(msg._id)
        .populate('sender', 'username fullName profilePic email')
        .populate('receiver', 'username fullName profilePic email');

      // ---- REAL-TIME PRIVATE DELIVERY ----
      const online = getOnlineUsers();
      
      if (online.has(receiver)) {
        msg = await Message.findByIdAndUpdate(msg._id, { delivered: true }, { new: true });
        
        // Notify sender that message was delivered
        emitToUser(sender, "message-delivered", { 
          messageId: msg._id,
          receiverId: receiver
        });
      }

      emitToUser(receiver, "new-message", msg);
      emitToUser(sender, "message-sent", msg);
    }

    res.status(201).json(msg);

  } catch (err) {
    console.error("sendMessage error:", err);
    
    // Emit error to sender
    if (req.body.sender) {
      emitToUser(req.body.sender, "message-error", { 
        error: "Failed to send message",
        isGroup: req.body.isGroup || false
      });
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

// ---- GET ALL MESSAGES BETWEEN CURRENT USER & RECEIVER (PRIVATE OR GROUP) ----
export const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { receiverId } = req.params;
    const { isGroup } = req.query; // Changed to req.query instead of req.params

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

      const messages = await GroupMessage.find({
        group: receiverId
      })
      .populate('sender', 'username fullName profilePic email')
      .populate('group', 'name admin members')
      .sort({ sentAt: 1 });

      return res.json(messages);

    } else {
      // ---- GET PRIVATE MESSAGES ----
      // Validate user IDs
      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const messages = await Message.find({
        $or: [
          { sender: currentUserId, receiver: receiverId },
          { sender: receiverId, receiver: currentUserId }
        ]
      })
      .populate('sender', 'username fullName profilePic email')
      .populate('receiver', 'username fullName profilePic email')
      .sort({ sentAt: 1 });

      return res.json(messages);
    }

  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// ---- MARK MESSAGE AS DELIVERED OR SEEN ----
export const ackMessage = async (req, res) => {
  try {
    const { status, isGroup = false } = req.body; // "delivered" or "seen"
    const msgId = req.params.id;

    if (isGroup) {
      // ---- GROUP MESSAGE ACKNOWLEDGMENT ----
      if (status === "seen") {
        const msg = await GroupMessage.findByIdAndUpdate(
          msgId,
          { 
            $addToSet: { readBy: req.user._id } 
          },
          { new: true }
        );

        if (msg) {
          // Notify group members that message was read
          emitToGroup(msg.group.toString(), "group-message-seen", { 
            messageId: msgId, 
            userId: req.user._id 
          });
        }
      }

    } else {
      // ---- PRIVATE MESSAGE ACKNOWLEDGMENT ----
      const msg = await Message.findByIdAndUpdate(
        msgId,
        { delivered: status === "delivered" },
        { new: true }
      );

      // Notify sender
      if (msg && msg.sender) {
        if (status === "delivered") {
          emitToUser(msg.sender.toString(), "message-delivered", { 
            messageId: msgId,
            receiverId: req.user._id 
          });
        } else if (status === "seen") {
          emitToUser(msg.sender.toString(), "messages-seen", { 
            messageId: msgId,
            from: req.user._id 
          });
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("ackMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---- GET USERS AND GROUPS FOR CHAT SIDEBAR ----
export const getUserForSideBar = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);

    // Get private chats
    const privateChats = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      {
        $project: {
          otherUser: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
          sender: 1,
          receiver: 1,
          ciphertext: 1,
          media: 1,
          sentAt: 1,
          delivered: 1,
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
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$receiver", userId] }, { $eq: ["$delivered", false] }] },
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
          unreadCount: 1,
          isGroup: 1,
          isOnline: "$user.isOnline"
        }
      }
    ]);

    // Get group chats where user is a member
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
                sender: 1
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
          lastMessageSender: { $arrayElemAt: ["$lastMessageSender", 0] },
          isGroup: { $literal: true },
          unreadCount: { $literal: 0 } // Fixed: use $literal instead of 0 for exclusion
        }
      }
    ]);

    // Combine and sort all chats by last message time
    const allChats = [...privateChats, ...groupChats].sort((a, b) => 
      new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0)
    );

    res.status(200).json(allChats);

  } catch (err) {
    console.error("getUserForSideBar error:", err);
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
                      read: 1
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
                sender: 1
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
      name: u.fullName || u.username, // Display name
      profilePic: u.profilePic || null,
      isOnline: !!u.isOnline,
      lastMessage: u.lastMessage || null,
      lastMessageTime: u.lastMessageTime || null,
      lastMessageMedia: u.lastMessageMedia || null,
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
    console.log(results);

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