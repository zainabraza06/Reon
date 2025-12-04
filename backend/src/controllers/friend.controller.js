import mongoose from "mongoose";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Notification from "../models/Notification.js";
import sendEmail from  "../utils/sendEmail.js"; 
import { getIO, emitToUser } from "../lib/socket.js";

// -------------------- GET RECOMMENDED FRIENDS --------------------
export const getRecommendedFriends = async (req, res) => {
  try {
    const userId = req.user._id;
   
    const searchQuery = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(userId)
      .select("friends location nativeLanguage sentFriendRequests receivedFriendRequests");

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const totalCount = await User.countDocuments({
      _id: { $ne: userId },
      isOnboarded: true,
      ...(searchQuery && {
        $or: [
          { fullName: { $regex: searchQuery, $options: "i" } },
          { username: { $regex: searchQuery, $options: "i" } }
        ]
      })
    });

 const recommended = await User.aggregate([
  {
    $match: {
      _id: { $ne: userId, $nin: currentUser.friends || [] }, // exclude current friends
      isOnboarded: true,
      ...(searchQuery && {
        $or: [
          { fullName: { $regex: searchQuery, $options: "i" } },
          { username: { $regex: searchQuery, $options: "i" } }
        ]
      })
    }
  },
  {
    $project: {
      fullName: 1,
      username: 1,
      profilePic: 1,
      location: 1,
      nativeLanguage: 1,
      friends: 1,
      isOnline: 1,
      lastSeen: 1,
      mutualFriendsCount: {
        $size: {
          $setIntersection: ["$friends", currentUser.friends || []]
        }
      },
      friendRequestSent: {
        $in: ["$_id", currentUser.sentFriendRequests || []]
      },
      friendRequestReceived: {
        $in: ["$_id", currentUser.receivedFriendRequests || []]
      },
      isFriend: {
        $in: ["$_id", currentUser.friends || []]
      },
      locationBonus: {
        $cond: [
          { $and: ["$location", currentUser.location, { $eq: ["$location", currentUser.location] }] },
          2,
          0
        ]
      },
      languageBonus: {
        $cond: [
          { $and: ["$nativeLanguage", currentUser.nativeLanguage, { $eq: ["$nativeLanguage", currentUser.nativeLanguage] }] },
          1,
          0
        ]
      }
    }
  },
  {
    $addFields: {
      score: {
        $add: [
          { $multiply: ["$mutualFriendsCount", 3] },
          "$locationBonus",
          "$languageBonus"
        ]
      }
    }
  },
  { $sort: { score: -1, createdAt: -1 } },
  { $skip: skip },
  { $limit: limit }
]);


    res.status(200).json({
      success: true,
      page,
      limit,
      total: totalCount,
      recommended
    });
  } catch (err) {
    console.error("❌ Get recommended friends error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching recommended friends"
    });
  }
};

// -------------------- GET MY FRIENDS --------------------
export const getMyFriends = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const searchQuery = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.aggregate([
      { $match: { _id: userId } },
      {
        $lookup: {
          from: "users",
          localField: "friends",
          foreignField: "_id",
          as: "friendsData"
        }
      },
      {
        $project: {
          friendsData: {
            $filter: {
              input: "$friendsData",
              as: "friend",
              cond: {
                $or: [
                  { $regexMatch: { input: "$$friend.fullName", regex: searchQuery, options: "i" } },
                  { $regexMatch: { input: "$$friend.username", regex: searchQuery, options: "i" } }
                ]
              }
            }
          }
        }
      },
      { $project: { friendsData: { $slice: ["$friendsData", skip, limit] } } }
    ]);

    const totalFriends = user[0]?.friendsData.length || 0;

    res.status(200).json({ page, limit, total: totalFriends, friends: user[0]?.friendsData || [] });
  } catch (err) {
    console.error("Get my friends error:", err);
    res.status(500).json({ message: "Server error while fetching friends" });
  }
};

// -------------------- GET PENDING FRIEND REQUESTS COUNT --------------------
export const getPendingFriendRequestsCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const pendingCount = await FriendRequest.countDocuments({ receiver: userId });
    res.json({ pendingCount });
  } catch (err) {
    console.error("Pending friend requests count error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// -------------------- SEND FRIEND REQUEST --------------------
export const sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.id;

    if (senderId.equals(receiverId)) return res.status(400).json({ message: "You cannot send a friend request to yourself" });

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: "User not found" });

    if (sender.friends.includes(receiver._id)) return res.status(400).json({ message: "You are already friends" });

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    });
    if (existingRequest) return res.status(400).json({ message: "Friend request already exists" });

    const friendRequest = await FriendRequest.create({ sender: senderId, receiver: receiverId });

    await friendRequest.populate('sender', 'fullName username profilePic');
    
    // Real-time notification using socket
    // Emit to Receiver (They received it)
    emitToUser(receiverId.toString(), 'friend-request-received', {
      requestId: friendRequest._id,
      sender: {
        _id: sender._id,
        fullName: sender.fullName,
        username: sender.username,
        profilePic: sender.profilePic
      },
      timestamp: new Date().toISOString()
    });

    // Emit to Sender (To update their UI to "Pending")
    emitToUser(senderId.toString(), 'friend-request-sent-realtime', {
      senderId: sender._id.toString(),
      receiverId: receiver._id.toString(),
      requestId: friendRequest._id.toString(),
      timestamp: new Date().toISOString()
    });

    const pendingCount = await FriendRequest.countDocuments({ receiver: receiverId, status: 'pending' });
    emitToUser(receiverId.toString(), 'pending-requests-count-updated', { count: pendingCount });

    await Notification.create({
      user: receiver._id,
      sender: sender._id,
      type: "friend_request",
      message: `${sender.fullName} has sent you a friend request`,
      link: `/user/${sender._id}`
    });

    res.status(201).json({ 
      message: "Friend request sent successfully", 
      requestId: friendRequest._id 
    });
  } catch (err) {
    console.error("Send friend request error:", err);
    res.status(500).json({ message: "Server error while sending friend request" });
  }
};

// -------------------- ACCEPT FRIEND REQUEST --------------------
export const acceptFriendRequest = async (req, res) => {
  try {
    const receiverId = req.user._id;
    const requestId = req.params.id;

    const request = await FriendRequest.findById(requestId).populate('sender receiver');
    if (!request) return res.status(404).json({ message: "Friend request not found" });
    if (!request.receiver._id.equals(receiverId)) return res.status(403).json({ message: "Not authorized to accept this request" });

    const sender = request.sender;
    const receiver = request.receiver;

    if (!sender.friends.includes(receiver._id)) sender.friends.push(receiver._id);
    if (!receiver.friends.includes(sender._id)) receiver.friends.push(sender._id);

    await sender.save();
    await receiver.save();
    
    await FriendRequest.findByIdAndDelete(requestId);


    // Real-time notifications
    // Notify Sender that their request was accepted
    emitToUser(sender._id.toString(), 'friend-request-accepted-realtime', {
      requestId: request._id.toString(),
      senderId: sender._id.toString(),
      receiverId: receiver._id.toString(),
      receiver: {
        _id: receiver._id.toString(),
        fullName: receiver.fullName,
        username: receiver.username,
        profilePic: receiver.profilePic
      },
      timestamp: new Date().toISOString()
    });
    
    // Notify Receiver (current user) to ensure UI consistency
    emitToUser(receiver._id.toString(), 'friend-request-accepted-realtime', {
      requestId: request._id.toString(),
      senderId: sender._id.toString(),
      receiverId: receiver._id.toString(),
      receiver: {
         _id: receiver._id.toString(),
         fullName: receiver.fullName,
         username: receiver.username,
         profilePic: receiver.profilePic
      },
      timestamp: new Date().toISOString()
    });

    // Update counts
    const senderPendingCount = await FriendRequest.countDocuments({ sender: sender._id, status: 'pending' });
    const receiverPendingCount = await FriendRequest.countDocuments({ receiver: receiver._id, status: 'pending' });
    
    emitToUser(sender._id.toString(), 'pending-requests-count-updated', { count: senderPendingCount });
    emitToUser(receiver._id.toString(), 'pending-requests-count-updated', { count: receiverPendingCount });

    await Notification.create({
      user: sender._id,
      sender: receiver._id,
      type: "friend_accept",
      message: `${receiver.fullName} accepted your friend request`,
      link: `/user/${receiver._id}`
    });

    res.status(200).json({ message: "Friend request accepted" });
  } catch (err) {
    console.error("Accept friend request error:", err);
    res.status(500).json({ message: "Server error while accepting friend request" });
  }
};

// -------------------- WITHDRAW FRIEND REQUEST --------------------
export const withdrawFriendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const requestId = req.params.id;

    const request = await FriendRequest.findById(requestId).populate('receiver');
    if (!request) return res.status(404).json({ message: "Friend request not found" });
    if (!request.sender.equals(senderId)) return res.status(403).json({ message: "Not authorized to withdraw this request" });

    const receiver = request.receiver;

    await FriendRequest.findByIdAndDelete(requestId);

    // Notify Receiver
    emitToUser(receiver._id.toString(), 'friend-request-withdrawn', {
      requestId: request._id.toString(),
      senderId: senderId.toString(),
      receiverId: receiver._id.toString()
    });

    // Notify Sender (Confirmation)
    emitToUser(senderId.toString(), 'friend-request-withdrawn', {
      requestId: request._id.toString(),
      senderId: senderId.toString(),
      receiverId: receiver._id.toString()
    });

    const pendingCount = await FriendRequest.countDocuments({ receiver: receiver._id, status: 'pending' });
    emitToUser(receiver._id.toString(), 'pending-requests-count-updated', { count: pendingCount });

    res.status(200).json({ message: "Friend request withdrawn successfully" });
  } catch (err) {
    console.error("Withdraw friend request error:", err);
    res.status(500).json({ message: "Server error while withdrawing friend request" });
  }
};

// -------------------- REJECT FRIEND REQUEST --------------------
export const rejectFriendRequest = async (req, res) => {
  try {
    const receiverId = req.user._id;
    const requestId = req.params.id;

    const request = await FriendRequest.findById(requestId).populate('sender');
    if (!request) return res.status(404).json({ message: "Friend request not found" });
    if (!request.receiver.equals(receiverId)) return res.status(403).json({ message: "Not authorized to reject this request" });

    const sender = request.sender;

    await FriendRequest.findByIdAndDelete(requestId);

    const payload = {
      requestId: request._id.toString(),
      senderId: sender._id.toString(), // The original sender
      receiverId: receiverId.toString(), // The person rejecting (Me)
      timestamp: new Date().toISOString()
    };

    // Notify Sender (Their request was rejected)
    emitToUser(sender._id.toString(), 'friend-request-rejected', payload);

    // Notify Receiver (Confirm rejection on my UI)
    emitToUser(receiverId.toString(), 'friend-request-rejected', payload);

    const pendingCount = await FriendRequest.countDocuments({ receiver: receiverId, status: 'pending' });
    emitToUser(receiverId.toString(), 'pending-requests-count-updated', { count: pendingCount });

    res.status(200).json({ message: "Friend request rejected successfully" });
  } catch (err) {
    console.error("Reject friend request error:", err);
    res.status(500).json({ message: "Server error while rejecting friend request" });
  }
};

// -------------------- REMOVE FRIEND --------------------
export const removeFriend = async (req, res) => {
  try {
    const userId = req.user._id;
    const friendId = req.params.id;

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) return res.status(404).json({ message: "User not found" });

    // Remove from both friends lists
    user.friends = user.friends.filter(fid => !fid.equals(friendId));
    friend.friends = friend.friends.filter(fid => !fid.equals(userId));

    await user.save();
    await friend.save();

    // CRITICAL: Delete any existing FriendRequest document to prevent "Sent" status on frontend
    await FriendRequest.findOneAndDelete({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ]
    });

    const payload = {
      userId: userId.toString(), // The person removing
      friendId: friendId.toString(), // The person being removed
      timestamp: new Date().toISOString()
    };

    // Notify the user who removed the friend (for UI sync)
    emitToUser(userId.toString(), 'friend-removed', payload);

    // Notify the user who was removed
    emitToUser(friendId.toString(), 'friend-removed', payload);

    res.status(200).json({ message: "Friend removed successfully" });
  } catch (err) {
    console.error("Remove friend error:", err);
    res.status(500).json({ message: "Server error while removing friend" });
  }
};

// -------------------- GET RECEIVED FRIEND REQUESTS --------------------
export const getReceivedRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({ receiver: userId })
      .populate("sender", "fullName username profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json({ total: requests.length, requests });
  } catch (err) {
    console.error("Get received requests error:", err);
    res.status(500).json({ message: "Server error while fetching received requests" });
  }
};

// -------------------- GET SENT FRIEND REQUESTS --------------------
export const getSentRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({ sender: userId })
      .populate("receiver", "fullName username profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json({ total: requests.length, requests });
  } catch (err) {
    console.error("Get sent requests error:", err);
    res.status(500).json({ message: "Server error while fetching sent requests" });
  }
};