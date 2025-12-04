import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import User from "../models/User.js";
import { getIO, getOnlineUsers, emitToUser } from "../lib/socket.js";
import cloudinary from "../lib/cloudinary.js";
import mongoose from "mongoose";



//  CREATE GROUP 
export const createGroup = async (req, res) => {
  try {
    const { name, members } = req.body;
    const admin = req.user._id;

    // Parse members if it's a string (from FormData)
    const membersArray = typeof members === 'string' ? JSON.parse(members) : members;

    // Check if group name already exists for this user
    const existingGroup = await Group.findOne({ 
      name: name.trim(),
      $or: [
        { admin: admin },
        { members: admin }
      ]
    });
    
    if (existingGroup) {
      return res.status(400).json({ message: "Group name already exists" });
    }

    // Ensure admin is included in members
    const allMembers = [...new Set([admin, ...membersArray])];

    // Upload profile picture if provided
    let profilePicUrl = '';
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "reon/group_pics" },
            (error, result) => (error ? reject(error) : resolve(result))
          );
          stream.end(req.file.buffer);
        });
        profilePicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Profile picture upload error:", uploadError);
        return res.status(500).json({ message: "Failed to upload profile picture" });
      }
    }

    const group = await Group.create({
      name: name.trim(),
      admin,
      members: allMembers,
      profilePic: profilePicUrl
    });

    // Populate group info
    const populatedGroup = await Group.findById(group._id)
      .populate('admin', 'username fullName profilePic')
      .populate('members', 'username fullName profilePic');

    // Notify all members about the new group
    const io = getIO();
    allMembers.forEach(memberId => {
      io.to(memberId.toString()).emit("group-created", populatedGroup);
    });

    res.status(201).json(populatedGroup);
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({ message: "Failed to create group" });
  }
};

// ---- GET MY GROUPS ----
export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const groups = await Group.find({ 
      members: userId 
    })
    .populate('admin', 'username fullName profilePic')
    .populate('members', 'username fullName profilePic')
    .sort({ createdAt: -1 });
    
    res.status(200).json(groups);
  } catch (err) {
    console.error("getMyGroups:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---- GET GROUP DETAILS ----
export const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findOne({
      _id: groupId,
      members: userId
    })
    .populate('admin', 'username fullName profilePic isOnline lastSeen')
    .populate('members', 'username fullName profilePic isOnline lastSeen');

    if (!group) {
      return res.status(404).json({ message: "Group not found or access denied" });
    }

    // Get message count for the group
    const messageCount = await GroupMessage.countDocuments({ group: groupId });

    res.json({
      ...group.toObject(),
      messageCount
    });
  } catch (error) {
    console.error("Get group details error:", error);
    res.status(500).json({ message: "Failed to get group details" });
  }
};

// ---- SEND GROUP MESSAGE ----
export const sendGroupMessage = async (req, res) => {
  try {
    const { groupId, ciphertext, type = 'text', encryptedKeys } = req.body;
    const sender = req.user._id;

    // Verify user is a member of the group
    const group = await Group.findOne({
      _id: groupId,
      members: sender
    });

    if (!group) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    // Handle media if any
    const mediaArray = [];
    if (req.files?.length) {
      for (const file of req.files) {
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "reon/group_media" },
            (error, result) => (error ? reject(error) : resolve(result))
          ).end(file.buffer);
        });

        mediaArray.push({
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          type: file.mimetype.startsWith("image") ? "image" :
                file.mimetype.startsWith("audio") ? "audio" :
                file.mimetype.startsWith("video") ? "video" : "document",
          encryptedKeys: encryptedKeys || {}
        });
      }
    }

    const groupMessage = await GroupMessage.create({
      sender,
      group: groupId,
      ciphertext,
      type,
      media: mediaArray
    });

    // Populate the message with sender info
    const populatedMessage = await GroupMessage.findById(groupMessage._id)
      .populate('sender', 'username fullName profilePic');

    // Emit to all group members
    const io = getIO();
    group.members.forEach(memberId => {
      io.to(memberId.toString()).emit("new-group-message", populatedMessage);
    });

    res.status(201).json(populatedMessage);

  } catch (error) {
    console.error("Send group message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

// ---- GET GROUP MESSAGES ----
export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is a member of the group
    const group = await Group.findOne({
      _id: groupId,
      members: userId
    });

    if (!group) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const skip = (page - 1) * limit;

    const messages = await GroupMessage.find({ group: groupId })
      .populate('sender', 'username fullName profilePic')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await GroupMessage.countDocuments({ group: groupId });

    res.json({
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalMessages,
        pages: Math.ceil(totalMessages / limit)
      }
    });

  } catch (error) {
    console.error("Get group messages error:", error);
    res.status(500).json({ message: "Failed to get group messages" });
  }
};

// ---- ADD MEMBERS TO GROUP ----
export const addGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const userId = req.user._id;

    // Verify user is admin of the group
    const group = await Group.findOne({
      _id: groupId,
      admin: userId
    });

    if (!group) {
      return res.status(403).json({ message: "Only group admin can add members" });
    }

    // Validate members array
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ message: "Invalid members data" });
    }

    // Check if users exist
    const existingUsers = await User.find({ 
      _id: { $in: members } 
    }).select('_id');

    const existingUserIds = existingUsers.map(user => user._id.toString());
    const invalidUsers = members.filter(memberId => !existingUserIds.includes(memberId));

    if (invalidUsers.length > 0) {
      return res.status(400).json({ 
        message: `Some users not found: ${invalidUsers.join(', ')}` 
      });
    }

    // Add new members (avoid duplicates)
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { 
        $addToSet: { 
          members: { 
            $each: members.filter(memberId => !group.members.includes(memberId))
          } 
        } 
      },
      { new: true }
    )
    .populate('admin', 'username fullName profilePic')
    .populate('members', 'username fullName profilePic');

    // Notify all group members about the update
    const io = getIO();
    updatedGroup.members.forEach(member => {
      io.to(member._id.toString()).emit("group-updated", updatedGroup);
    });

    // Notify new members specifically
    members.forEach(memberId => {
      if (!group.members.includes(memberId)) {
        io.to(memberId.toString()).emit("added-to-group", updatedGroup);
      }
    });

    res.json({
      group: updatedGroup,
      addedMembers: members.filter(memberId => !group.members.includes(memberId))
    });

  } catch (error) {
    console.error("Add group members error:", error);
    res.status(500).json({ message: "Failed to add members to group" });
  }
};

// ---- REMOVE MEMBER FROM GROUP ----
export const removeMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.user._id;

    // Verify user is admin of the group
    const group = await Group.findOne({
      _id: groupId,
      admin: userId
    });

    if (!group) {
      return res.status(403).json({ message: "Only group admin can remove members" });
    }

    // Prevent admin from removing themselves
    if (memberId === userId.toString()) {
      return res.status(400).json({ message: "Admin cannot remove themselves from group" });
    }

    // Check if member exists in group
    if (!group.members.includes(memberId)) {
      return res.status(400).json({ message: "User is not a member of this group" });
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pull: { members: memberId } },
      { new: true }
    )
    .populate('admin', 'username fullName profilePic')
    .populate('members', 'username fullName profilePic');

    // Notify all group members about the update
    const io = getIO();
    updatedGroup.members.forEach(member => {
      io.to(member._id.toString()).emit("group-updated", updatedGroup);
    });

    // Notify removed user
    io.to(memberId).emit("removed-from-group", {
      groupId,
      groupName: group.name
    });

    res.json({
      group: updatedGroup,
      removedMember: memberId
    });

  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({ message: "Failed to remove member from group" });
  }
};

// ---- LEAVE GROUP ----
export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findOne({
      _id: groupId,
      members: userId
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found or you are not a member" });
    }

    // If user is admin, transfer admin to another member or delete group if only member
    if (group.admin.toString() === userId.toString()) {
      const otherMembers = group.members.filter(member => 
        member.toString() !== userId.toString()
      );

      if (otherMembers.length === 0) {
        // Delete group if no other members
        await Group.findByIdAndDelete(groupId);
        await GroupMessage.deleteMany({ group: groupId });
        
        // Notify all (former) members
        const io = getIO();
        io.to(groupId).emit("group-deleted", { groupId });
        
        return res.json({ 
          message: "Group deleted as you were the only member",
          deleted: true 
        });
      } else {
        // Transfer admin to the first other member
        const newAdmin = otherMembers[0];
        await Group.findByIdAndUpdate(
          groupId,
          { 
            admin: newAdmin,
            $pull: { members: userId }
          },
          { new: true }
        )
        .populate('admin', 'username fullName profilePic')
        .populate('members', 'username fullName profilePic');

        // Notify group members about admin change
        const io = getIO();
        group.members.forEach(member => {
          io.to(member.toString()).emit("group-updated", {
            ...group.toObject(),
            admin: newAdmin,
            members: group.members.filter(m => m.toString() !== userId.toString())
          });
        });

        return res.json({ 
          message: "Left group and transferred admin role",
          newAdmin 
        });
      }
    }

    // Regular member leaving
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pull: { members: userId } },
      { new: true }
    )
    .populate('admin', 'username fullName profilePic')
    .populate('members', 'username fullName profilePic');

    // Notify remaining group members
    const io = getIO();
    updatedGroup.members.forEach(member => {
      io.to(member._id.toString()).emit("group-updated", updatedGroup);
    });

    res.json({ 
      message: "Successfully left the group",
      group: updatedGroup 
    });

  } catch (error) {
    console.error("Leave group error:", error);
    res.status(500).json({ message: "Failed to leave group" });
  }
};

// ---- MAKE MEMBER ADMIN ----
export const makeMemberAdmin = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.user._id;

    // Verify current user is admin
    const group = await Group.findOne({
      _id: groupId,
      admin: userId
    });

    if (!group) {
      return res.status(403).json({ message: "Only group admin can transfer admin role" });
    }

    // Check if target member exists in group
    if (!group.members.includes(memberId)) {
      return res.status(400).json({ message: "User is not a member of this group" });
    }

    // Transfer admin role
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { admin: memberId },
      { new: true }
    )
    .populate('admin', 'username fullName profilePic')
    .populate('members', 'username fullName profilePic');

    // Notify all group members about admin change
    const io = getIO();
    group.members.forEach(member => {
      io.to(member.toString()).emit("group-admin-changed", {
        group: updatedGroup,
        previousAdmin: userId,
        newAdmin: memberId
      });
    });

    res.json({
      group: updatedGroup,
      newAdmin: memberId
    });

  } catch (error) {
    console.error("Make member admin error:", error);
    res.status(500).json({ message: "Failed to transfer admin role" });
  }
};

// ---- DELETE GROUP ----
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Verify user is admin of the group
    const group = await Group.findOne({
      _id: groupId,
      admin: userId
    });

    if (!group) {
      return res.status(403).json({ message: "Only group admin can delete the group" });
    }

    // Delete group and all messages
    await Group.findByIdAndDelete(groupId);
    await GroupMessage.deleteMany({ group: groupId });

    // Notify all members
    const io = getIO();
    group.members.forEach(member => {
      io.to(member.toString()).emit("group-deleted", { groupId });
    });

    res.json({ 
      message: "Group deleted successfully",
      deleted: true 
    });

  } catch (error) {
    console.error("Delete group error:", error);
    res.status(500).json({ message: "Failed to delete group" });
  }
};

// ---- UPDATE GROUP INFO ----
export const updateGroupInfo = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    const userId = req.user._id;

    // Verify user is admin of the group
    const group = await Group.findOne({
      _id: groupId,
      admin: userId
    });

    if (!group) {
      return res.status(403).json({ message: "Only group admin can update group info" });
    }

    // Check if new name already exists
    if (name && name.trim() !== group.name) {
      const existingGroup = await Group.findOne({
        name: name.trim(),
        _id: { $ne: groupId },
        $or: [
          { admin: userId },
          { members: userId }
        ]
      });
      
      if (existingGroup) {
        return res.status(400).json({ message: "Group name already exists" });
      }
    }

    let profilePicUrl = group.profilePic;

    // Upload new profile picture if provided
    if (req.file) {
      try {
        // Delete old profile picture from Cloudinary if exists
        if (group.profilePic) {
          const publicId = group.profilePic.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`reon/group_pics/${publicId}`);
        }

        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "reon/group_pics" },
            (error, result) => (error ? reject(error) : resolve(result))
          );
          stream.end(req.file.buffer);
        });
        profilePicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Profile picture upload error:", uploadError);
        return res.status(500).json({ message: "Failed to upload profile picture" });
      }
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      {
        ...(name && { name: name.trim() }),
        ...(req.file && { profilePic: profilePicUrl })
      },
      { new: true }
    )
    .populate('admin', 'username fullName profilePic')
    .populate('members', 'username fullName profilePic');

    // Notify all group members about the update
    const io = getIO();
    updatedGroup.members.forEach(member => {
      io.to(member._id.toString()).emit("group-updated", updatedGroup);
    });

    res.json(updatedGroup);

  } catch (error) {
    console.error("Update group info error:", error);
    res.status(500).json({ message: "Failed to update group info" });
  }
};