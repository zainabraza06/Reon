import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { GroupChat, GroupMessage } from "../models/GroupChat.js";
import User from "../models/User.js";
import { emitToUser, isUserOnline } from "../lib/socket.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const isMember = (group, userId) =>
  group.members.some((m) => m.user.toString() === userId.toString());

const isAdmin = (group, userId) =>
  group.admins.some((id) => id.toString() === userId.toString());

const getMimeType = (extension, fileType) => {
  const ext = (extension || "").toLowerCase();
  const mimes = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".zip": "application/zip",
  };
  return mimes[ext] || "application/octet-stream";
};

const saveFileToGridFS = (buffer, originalName, index, fileType, encryptionIV) =>
  new Promise((resolve, reject) => {
    try {
      const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
      const fileName = `encrypted_group_${Date.now()}_${index}_${safeName}`;
      const extension = originalName.includes(".")
        ? originalName.substring(originalName.lastIndexOf("."))
        : ".bin";

      const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "encryptedFiles" });
      const metadata = { originalName, type: fileType, extension, isEncrypted: true, uploadedAt: new Date() };
      if (encryptionIV) metadata.encryptionIV = encryptionIV;

      const stream = bucket.openUploadStream(fileName, { metadata });
      stream.end(buffer);
      stream.on("finish", () =>
        resolve({
          url: `/api/groups/media/${stream.id}`,
          downloadUrl: `/api/groups/download/${stream.id}`,
          fileId: stream.id.toString(),
          fileName,
          metadata,
        })
      );
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });

// ── group CRUD ────────────────────────────────────────────────────────────────

export const createGroup = async (req, res) => {
  try {
    const creatorId = req.user._id;
    const { name, description = "", memberIds = [] } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Group name is required" });

    // Validate members are friends
    const creator = await User.findById(creatorId).select("friends");
    const validMembers = (memberIds || []).filter((id) =>
      creator.friends.some((f) => f.toString() === id.toString())
    );

    const allMemberIds = [...new Set([creatorId.toString(), ...validMembers])];

    const group = await GroupChat.create({
      name: name.trim(),
      description: description.trim(),
      creator: creatorId,
      admins: [creatorId],
      members: allMemberIds.map((uid) => ({
        user: uid,
        addedBy: creatorId,
        joinedAt: new Date(),
      })),
    });

    const populated = await GroupChat.findById(group._id)
      .populate("members.user", "fullName username profilePic")
      .populate("admins", "fullName username profilePic")
      .populate("creator", "fullName username profilePic");

    // Notify all members
    for (const uid of allMemberIds) {
      if (uid !== creatorId.toString()) {
        emitToUser(uid, "group-added", { group: populated });
      }
    }

    res.status(201).json({ group: populated });
  } catch (err) {
    console.error("createGroup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await GroupChat.find({ "members.user": userId, isActive: true })
      .populate("members.user", "fullName username profilePic")
      .populate("admins", "fullName username profilePic")
      .populate("creator", "fullName username profilePic")
      .populate("lastMessage.sender", "fullName username")
      .sort({ "lastMessage.sentAt": -1, updatedAt: -1 });

    res.json({ groups });
  } catch (err) {
    console.error("getMyGroups error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId))
      return res.status(400).json({ message: "Invalid group ID" });

    const group = await GroupChat.findById(groupId)
      .populate("members.user", "fullName username profilePic")
      .populate("admins", "fullName username profilePic")
      .populate("creator", "fullName username profilePic");

    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (!isMember(group, userId)) return res.status(403).json({ message: "Not a member" });

    res.json({ group });
  } catch (err) {
    console.error("getGroupById error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { name, description } = req.body;

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (!isAdmin(group, userId)) return res.status(403).json({ message: "Admins only" });

    if (name?.trim()) group.name = name.trim();
    if (description !== undefined) group.description = description.trim();
    await group.save();

    const populated = await GroupChat.findById(groupId)
      .populate("members.user", "fullName username profilePic")
      .populate("admins", "fullName username profilePic");

    group.members.forEach((m) => emitToUser(m.user.toString(), "group-updated", { group: populated }));
    res.json({ group: populated });
  } catch (err) {
    console.error("updateGroup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const addMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { memberIds = [] } = req.body;

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (!isAdmin(group, userId)) return res.status(403).json({ message: "Admins only" });

    const adder = await User.findById(userId).select("friends");
    const added = [];

    for (const mid of memberIds) {
      if (isMember(group, mid)) continue;
      if (!adder.friends.some((f) => f.toString() === mid.toString())) continue;
      group.members.push({ user: mid, addedBy: userId, joinedAt: new Date() });
      added.push(mid);
    }

    await group.save();
    const populated = await GroupChat.findById(groupId)
      .populate("members.user", "fullName username profilePic")
      .populate("admins", "fullName username profilePic");

    group.members.forEach((m) => emitToUser(m.user.toString(), "group-updated", { group: populated }));
    added.forEach((mid) => emitToUser(mid.toString(), "group-added", { group: populated }));

    res.json({ group: populated, added });
  } catch (err) {
    console.error("addMembers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });

    const selfLeave = userId.toString() === memberId;
    if (!selfLeave && !isAdmin(group, userId)) return res.status(403).json({ message: "Admins only" });
    if (!isMember(group, memberId)) return res.status(400).json({ message: "Not a member" });
    if (!selfLeave && group.creator.toString() === memberId)
      return res.status(400).json({ message: "Cannot remove the creator" });

    group.members = group.members.filter((m) => m.user.toString() !== memberId.toString());
    group.admins = group.admins.filter((a) => a.toString() !== memberId.toString());
    await group.save();

    emitToUser(memberId.toString(), "group-removed", { groupId });
    group.members.forEach((m) =>
      emitToUser(m.user.toString(), "group-member-left", { groupId, memberId })
    );

    res.json({ message: selfLeave ? "Left group" : "Member removed" });
  } catch (err) {
    console.error("removeMember error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const promoteAdmin = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (group.creator.toString() !== userId.toString())
      return res.status(403).json({ message: "Only creator can promote admins" });
    if (!isMember(group, memberId)) return res.status(400).json({ message: "Not a member" });
    if (isAdmin(group, memberId)) return res.status(400).json({ message: "Already an admin" });

    group.admins.push(memberId);
    await group.save();

    const populated = await GroupChat.findById(groupId)
      .populate("members.user", "fullName username profilePic")
      .populate("admins", "fullName username profilePic");

    group.members.forEach((m) => emitToUser(m.user.toString(), "group-updated", { group: populated }));
    res.json({ group: populated });
  } catch (err) {
    console.error("promoteAdmin error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (group.creator.toString() !== userId.toString())
      return res.status(403).json({ message: "Only creator can delete group" });

    group.isActive = false;
    await group.save();

    group.members.forEach((m) => emitToUser(m.user.toString(), "group-deleted", { groupId }));
    res.json({ message: "Group deleted" });
  } catch (err) {
    console.error("deleteGroup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── group messages ────────────────────────────────────────────────────────────

export const sendGroupMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId))
      return res.status(400).json({ message: "Invalid group ID" });

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (!isMember(group, senderId)) return res.status(403).json({ message: "Not a member" });

    let messageData = {};
    try {
      messageData = JSON.parse(req.body.data || "{}");
    } catch {
      return res.status(400).json({ message: "Invalid message data" });
    }

    const { ciphertext, contentType = "text", memberKeys = [], mediaKeys = [] } = messageData;
    const hasText = ciphertext && ciphertext.trim() !== "";
    const hasFiles = req.files && req.files.length > 0;

    if (!hasText && !hasFiles)
      return res.status(400).json({ message: "Message must have text or files" });

    const mediaArr = [];
    if (hasFiles) {
      for (let i = 0; i < req.files.length; i++) {
        const f = req.files[i];
        const fileTypeGuess = f.mimetype.startsWith("image/")
          ? "image"
          : f.mimetype.startsWith("video/")
          ? "video"
          : f.mimetype.startsWith("audio/")
          ? "audio"
          : "document";

        const mediaKeyEntry = mediaKeys[i] || {};
        const { encryptionIV } = mediaKeyEntry;

        const saved = await saveFileToGridFS(f.buffer, f.originalname, i, fileTypeGuess, encryptionIV);
        mediaArr.push({
          url: saved.url,
          downloadUrl: saved.downloadUrl,
          type: fileTypeGuess,
          fileName: saved.fileName,
          originalName: f.originalname,
          fileSize: f.size,
          fileId: saved.fileId,
          memberKeys: mediaKeyEntry.memberKeys || [],
          encryptionIV: encryptionIV || "",
          isEncrypted: true,
        });
      }
    }

    const now = new Date();
    const message = await GroupMessage.create({
      groupId,
      sender: senderId,
      ciphertext: hasText ? ciphertext : undefined,
      contentType: hasFiles ? mediaArr[0]?.type || "document" : contentType,
      memberKeys,
      media: mediaArr,
      sentAt: now,
      deliveredTo: [{ userId: senderId, at: now }],
      readBy:      [{ userId: senderId, at: now }],
    });

    // Update group's lastMessage
    const previewText = hasText ? "[encrypted]" : `[${mediaArr[0]?.type || "file"}]`;
    await GroupChat.findByIdAndUpdate(groupId, {
      lastMessage: { content: previewText, sender: senderId, sentAt: new Date() },
    });

    const populated = await GroupMessage.findById(message._id).populate(
      "sender",
      "fullName username profilePic"
    );

    // Find online members (excluding sender) — mark them delivered immediately
    const otherMembers = group.members.filter((m) => m.user.toString() !== senderId.toString());
    const onlineMemberIds = otherMembers
      .filter((m) => isUserOnline(m.user.toString()))
      .map((m) => m.user);

    if (onlineMemberIds.length > 0) {
      await GroupMessage.findByIdAndUpdate(message._id, {
        $addToSet: { deliveredTo: { $each: onlineMemberIds } },
      });
    }

    const memberCount = otherMembers.length;
    const deliveredCount = onlineMemberIds.length;

    // Notify sender with initial delivery count
    emitToUser(senderId.toString(), "group-message-delivered", {
      messageId: message._id.toString(),
      groupId,
      deliveredCount,
      memberCount,
    });

    // Emit new-message to all other members
    for (const m of otherMembers) {
      emitToUser(m.user.toString(), "new-group-message", { message: populated, groupId });
    }

    res.status(201).json({ message: populated });
  } catch (err) {
    console.error("sendGroupMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : new Date();

    if (!mongoose.Types.ObjectId.isValid(groupId))
      return res.status(400).json({ message: "Invalid group ID" });

    const group = await GroupChat.findById(groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: "Group not found" });
    if (!isMember(group, userId)) return res.status(403).json({ message: "Not a member" });

    const messages = await GroupMessage.find({ groupId, sentAt: { $lt: before } })
      .populate("sender", "fullName username profilePic")
      .sort({ sentAt: -1 })
      .limit(limit);

    // Return oldest-first
    messages.reverse();

    // Filter each message's memberKeys to only include caller's key
    const filtered = messages.map((msg) => {
      const obj = msg.toObject();
      obj.encryptedKey = obj.memberKeys?.find((k) => k.userId?.toString() === userId.toString())?.encryptedKey;
      obj.media = obj.media?.map((m) => ({
        ...m,
        encryptedKey: m.memberKeys?.find((k) => k.userId?.toString() === userId.toString())?.encryptedKey,
      }));
      return obj;
    });

    res.json({ messages: filtered, hasMore: messages.length === limit });
  } catch (err) {
    console.error("getGroupMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const markGroupMessagesRead = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!isMember(group, userId)) return res.status(403).json({ message: "Not a member" });

    // Collect unread messages (excluding ones the user sent themselves)
    const unread = await GroupMessage.find({
      groupId,
      readBy: { $ne: userId },
      sender: { $ne: userId },
    }).select("_id sender readBy");

    if (unread.length === 0) return res.json({ message: "Nothing to mark" });

    await GroupMessage.updateMany(
      { groupId, readBy: { $ne: userId }, sender: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    // Group message IDs by original sender so each sender gets one event
    const memberCount = group.members.length - 1; // total non-sender members per msg varies, use group size
    const bySender = new Map();
    for (const msg of unread) {
      const sid = msg.sender.toString();
      if (!bySender.has(sid)) bySender.set(sid, []);
      bySender.get(sid).push(msg._id.toString());
    }

    for (const [sid, messageIds] of bySender.entries()) {
      emitToUser(sid, "group-messages-read", {
        groupId,
        messageIds,
        readBy: userId.toString(),
        memberCount,
      });
    }

    res.json({ message: "Marked as read" });
  } catch (err) {
    console.error("markGroupMessagesRead error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── file serving (mirrors message controller) ─────────────────────────────────

export const serveGroupMedia = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid file ID" });

    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "encryptedFiles" });
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(id) }).toArray();
    if (!files.length) return res.status(404).json({ message: "File not found" });

    const file = files[0];
    const origin = process.env.FRONTEND_URL || "http://localhost:3000";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, X-Encryption-IV, X-File-Name");

    const ext = file.metadata?.extension || "";
    const contentType = getMimeType(ext, file.metadata?.type);
    const originalName = file.metadata?.originalName || "file";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", file.length || 0);
    res.setHeader("Content-Disposition", `inline; filename="${originalName}"`);
    if (file.metadata?.encryptionIV) res.setHeader("X-Encryption-IV", file.metadata.encryptionIV);
    if (originalName) res.setHeader("X-File-Name", encodeURIComponent(originalName));

    bucket.openDownloadStream(new mongoose.Types.ObjectId(id)).pipe(res);
  } catch (err) {
    console.error("serveGroupMedia error:", err);
    if (!res.headersSent) res.status(500).json({ message: "Server error" });
  }
};

export const downloadGroupFile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid file ID" });

    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "encryptedFiles" });
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(id) }).toArray();
    if (!files.length) return res.status(404).json({ message: "File not found" });

    const file = files[0];
    const origin = process.env.FRONTEND_URL || "http://localhost:3000";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Encrypted, X-Encryption-IV, X-File-Name");

    const ext = file.metadata?.extension || "";
    const contentType = getMimeType(ext, file.metadata?.type);
    const originalName = file.metadata?.originalName || "file";
    const encodedName = encodeURIComponent(originalName);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${originalName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader("X-Encrypted", "true");
    if (file.metadata?.encryptionIV) res.setHeader("X-Encryption-IV", file.metadata.encryptionIV);
    if (originalName) res.setHeader("X-File-Name", encodedName);

    bucket.openDownloadStream(new mongoose.Types.ObjectId(id)).pipe(res);
  } catch (err) {
    console.error("downloadGroupFile error:", err);
    if (!res.headersSent) res.status(500).json({ message: "Server error" });
  }
};
