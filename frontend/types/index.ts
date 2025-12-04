// ----------------------------
// Chat UI Message (local only)
// ----------------------------
export interface ChatMessage {
  text: string;
  type: "user" | "other";
  time?: string;
  status?: string;
  visible?: boolean;
  typing?: boolean;
  currentText?: string;
}

// types/index.ts

// Base interface for search results
export interface SearchedUserBase {
  _id: string;
  type: 'user' | 'group';
  profilePic?: string;
}

// For user search results
export interface SearchedUser extends SearchedUserBase {
  type: 'user';
  fullName: string;
  username: string;
  isOnline: boolean;
  lastSeen: string;
}

// For group search results  
export interface SearchedGroup extends SearchedUserBase {
  type: 'group';
  name: string;
  description?: string;
  admin: string | User;
  members: (string | User)[];
  memberCount?: number;
}

// Union type for search results
export type SearchResult = SearchedUser | SearchedGroup;


export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

export interface Notification {
  _id: string;
  user: string;
  type: 'message' | 'friend_request' | 'group_invite' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: unknown;
}

export interface FriendRequest {
  _id: string;
  sender: User;
  receiver: User;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}


export interface TypingEvent {
  to: string;
  from: string;
}



// ----------------------------
// Dashboard counters
// ----------------------------
export interface CounterState {
  users: number;
  messages: number;
}

// ----------------------------
// Flash messages (alerts)
// ----------------------------
export interface FlashMessage {
  message: string;
  type: "success" | "error" | "info";
}

// ----------------------------
// User model used everywhere
// ----------------------------
export interface User {
  _id: string;
  username: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
  lastSeen?: string;
  fullName?: string;
  isOnboarded?: boolean;
   pendingFriendRequests?: number;
   location?:string;
   bio?:string;

  friends?: { _id: string }[];
  chats?: { _id: string }[];
}

export type ChatItem = User | Group;

export interface NotificationCountEvent {
  unreadCount: number;
}

// ----------------------------
// Searched user (public view)
// ----------------------------



// ----------------------------
// Friend (minimal)
// ----------------------------
export interface Friend {
  _id: string;
  fullName: string;
  email?: string;
}

// ----------------------------
// Chat summary
// ----------------------------
export interface Chat {
  _id: string;
  participants: string[];
  lastMessage?: string;
  updatedAt?: string;
}

// ----------------------------
// Socket events
// ----------------------------
export interface MessageSeenEvent {
  from: string;
  messageId: string;
  status?: string; 
}

export interface OnlineStatusEvent {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}

// ----------------------------
// Auth context
// ----------------------------
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => void;
  refreshUser: () => Promise<User | null>;
  checkAuth: () => Promise<User | null>;
}


export interface FriendRequestAcceptedData {
  requestId: string;
  friend?: User;
  receiverId: string;
  timestamp: Date;
}

export interface FriendRequestWithdrawnData {
  requestId: string;
  senderId: string;
  timestamp: Date;
}

export interface FriendRemovedData {
  friendId: string;
  timestamp: Date;
}

export interface PendingRequestsCountData {
  pendingCount: number;
}




export interface BaseMessage {
  _id: string;
  sender: string;
  type: "text" | "image" | "audio" | "video" | "document";
  ciphertext?: string;
  text?: string;
  media?: Array<{
    url: string;
    type: string;
    encryptedKey?: string; // 1:1 only
  }>;
  sentAt: string;
  delivered?: boolean;
  read?: boolean;
  isTemp?: boolean;
}

export interface Message extends BaseMessage {
  receiver: string;
  media?: Array<{
    url: string;
    type: string;
    encryptedKey?: string;
  }>;
}

export interface GroupMessage extends BaseMessage {
  groupId: string;
  isGroup: true;
  // For group, media can have encryptedKeys mapping userId → AES key
  media?: Array<{
    url: string;
    type: string;
    encryptedKeys?: Record<string, string>;
  }>;
  // Group text can have encrypted keys per user
  encryptedKeys?: Record<string, string>;
}



export interface ChatItemBase {
  _id: string;
  name: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
  lastSeen?: string;
  createdAt?: string;
}

export interface UserChatItem extends ChatItemBase {
  type: 'user';
  username?: string;
  email?: string;
}

export interface GroupChatItem extends ChatItemBase {
  type: 'group';
  members: string[]; // Array of user IDs
  membersDetails?: User[]; // Full user objects
  admin: string;
  description?: string;
}

export interface MessageSeenEvent {
  messageId: string;
  from: string;
}

export interface OnlineStatusEvent {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface TypingEvent {
  from: string;
  to: string;
  isTyping: boolean;
}


// types/index.ts

// Use a more specific type for Group to avoid union type issues
export interface Group {
  _id: string;
  name: string;
  description?: string;
  profilePic?: string;
  coverPhoto?: string;
  // Allow both string IDs (unpopulated) and User objects (populated)
  admin: string | User;
  members: (string | User)[];
  createdAt: string | Date;
  updatedAt: string | Date;
  lastActivity?: string | Date;
  lastMessage?: string | Message;
  settings?: {
    allowInvites?: boolean;
    adminOnlyMessages?: boolean;
    membersCanAddMembers?: boolean;
    approvalRequired?: boolean;
  };
  metadata?: {
    memberCount?: number;
    unreadCount?: number;
    isMuted?: boolean;
    isPinned?: boolean;
  };
}

