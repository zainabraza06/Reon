// ── Auth ──────────────────────────────────────────────────────────────────────
export interface RecommendedUser extends Omit<User, "friends" | "isOnboarded" | "isVerified"> {
  mutualFriendsCount?: number;
  friendRequestSent?: boolean;
  friendRequestReceived?: boolean;
  score?: number;
}

export interface User {
  _id: string;
  fullName: string;
  email: string;
  username?: string;
  profilePic?: string;
  bio?: string;
  location?: string;
  nativeLanguage?: string;
  isOnboarded: boolean;
  isVerified: boolean;
  friends: string[];
  hasPassword?: boolean;
  createdAt?: string;
  lastSeen?: string;
  privacySettings?: {
    showLastSeen: boolean;
    showActiveStatus: boolean;
  };
}

// ── Messages ──────────────────────────────────────────────────────────────────
export interface MediaFile {
  url: string;
  downloadUrl?: string;
  type: "image" | "video" | "audio" | "document" | "blob";
  fileName?: string;
  originalName?: string;
  fileSize?: number;
  fileId?: string;
  encryptedKey?: string;
  senderEncryptedKey?: string;
  encryptionIV?: string;
  isEncrypted?: boolean;
}

export interface Message {
  _id: string;
  sender: string;
  receiver: string;
  ciphertext?: string;
  plaintext?: string; // decrypted on client
  type?: "prekey" | "ratcheted";
  contentType: "text" | "image" | "audio" | "video" | "document";
  encryptedKey?: string;
  senderEncryptedKey?: string;
  media?: MediaFile[];
  sentAt: string;
  delivered?: boolean;
  deliveredAt?: string | null;
  read?: boolean;
  readAt?: string | null;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  isVoiceMessage?: boolean;
  senderInfo?: { fullName: string; username?: string; profilePic?: string };
  // client-only: temp id before server confirms
  tempId?: string;
}

// ── Group Chat ─────────────────────────────────────────────────────────────────
export interface GroupMember {
  user: User;
  joinedAt: string;
  addedBy?: string;
}

export interface GroupChat {
  _id: string;
  name: string;
  description?: string;
  avatar?: string;
  creator: User;
  admins: User[];
  members: GroupMember[];
  lastMessage?: {
    content: string;
    ciphertext?: string;
    memberKeys?: { userId: string; encryptedKey: string }[];
    encryptedKey?: string;
    sender: User | string;
    sentAt: string;
    contentType?: string;
    senderName?: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMediaKey {
  userId: string;
  encryptedKey: string;
}

export interface GroupReceiptEntry {
  user: { _id: string; fullName: string; username?: string; profilePic?: string };
  at: string;
}

export interface GroupMessage {
  _id: string;
  groupId: string;
  sender: User;
  ciphertext?: string;
  plaintext?: string;
  contentType: "text" | "image" | "audio" | "video" | "document" | "system";
  encryptedKey?: string;
  memberKeys?: { userId: string; encryptedKey: string }[];
  media?: (MediaFile & { memberKeys?: GroupMediaKey[] })[];
  sentAt: string;
  readBy?: { userId: string; at: string }[];
  deliveredTo?: { userId: string; at: string }[];
  // client-only
  status?: "sending" | "failed";
  tempId?: string;
}

export interface PersonalMessageInfo {
  sentAt: string;
  delivered: boolean;
  deliveredAt: string | null;
  read: boolean;
  readAt: string | null;
  receiver: { _id: string; fullName: string; username?: string; profilePic?: string };
}

export interface GroupMessageInfo {
  readBy: GroupReceiptEntry[];
  deliveredTo: GroupReceiptEntry[];
  memberCount: number;
}

// ── Friends ───────────────────────────────────────────────────────────────────
export interface FriendRequest {
  _id: string;
  sender: User;
  receiver: User;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  createdAt: string;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export interface ChatListItem {
  _id: string;
  fullName: string;
  username?: string;
  profilePic?: string;
  lastMessage?: {
    content?: string;
    contentType?: string;
    sentAt?: string;
    status?: string;
    ciphertext?: string;
    sender?: string;
    encryptedKey?: string;
  };
  unreadCount?: number;
  isOnline?: boolean;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export interface AppNotification {
  _id?: string;      // present on DB-returned documents
  id: string;        // always present: equals _id after mapFromDb, or tempId for optimistic entries
  type: "friend_request" | "friend_accepted" | "group_added" | "group_removed" | "new_message" | "new_group_message";
  title: string;
  body: string;
  avatar?: string;
  link?: string;
  read: boolean;
  timestamp: string; // maps to createdAt on DB documents
  createdAt?: string;
}

// ── Crypto ────────────────────────────────────────────────────────────────────
export interface KeyPair {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

export interface EncryptedMessage {
  ciphertext: string;
  encryptedKey: string;
  senderEncryptedKey: string;
}
