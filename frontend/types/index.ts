// ── Auth ──────────────────────────────────────────────────────────────────────
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
  createdAt?: string;
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
  contentType: "text" | "image" | "audio" | "video" | "document" | "call-log";
  encryptedKey?: string;
  senderEncryptedKey?: string;
  media?: MediaFile[];
  sentAt: string;
  delivered?: boolean;
  deliveredAt?: string;
  read?: boolean;
  readAt?: string;
  status?: "sent" | "delivered" | "read";
  isVoiceMessage?: boolean;
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
    sender: User | string;
    sentAt: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMediaKey {
  userId: string;
  encryptedKey: string;
}

export interface GroupMessage {
  _id: string;
  groupId: string;
  sender: User;
  ciphertext?: string;
  plaintext?: string;
  contentType: "text" | "image" | "audio" | "video" | "document";
  encryptedKey?: string; // caller's key extracted from memberKeys
  media?: (MediaFile & { memberKeys?: GroupMediaKey[] })[];
  sentAt: string;
  readBy?: string[];
  deliveredTo?: string[];
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
  };
  unreadCount?: number;
  isOnline?: boolean;
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
