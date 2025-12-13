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
  type: 'user' ;
  profilePic?: string;
}

// Update your types file

// Base encrypted content structure
export interface EncryptedContent {
  ciphertext?: string;
  encryptedKey?: string;
  senderEncryptedKey?: string;
  media?: Array<{
    url: string;
    type: string;
    encryptedKey?: string;
    senderEncryptedKey?: string;
    fileName?: string;
    fileSize?: number;
  }>;
  type?: string;
}

export interface MessageDeliveredEvent {
  messageId: string;
  receiverId: string; // The receiver of the message
}

// When a message is seen/read
export interface MessageSeenEvent {
  messageId: string;
  readerId: string; // The person who read the message
  senderId: string; // The sender of the original message
}

// For conversation read (batch)
export interface ConversationReadEvent {
  senderId: string;
  readerId: string;
  readAt: string;
  messageCount: number;
}

// New message event
export interface NewMessageEvent {
  messageId: string;
  sender: string;
  receiver: string;
  content: EncryptedContent | string;
  messageType: string;
  sentAt: string;
  status: string;
}

// Message sent confirmation
export interface MessageSentEvent {
  messageId: string;
  sender: string;
  receiver: string;
  content: EncryptedContent | string;
  messageType: string;
  sentAt: string;

}


// For user search results
export interface SearchedUser extends SearchedUserBase {
  type: 'user';
  fullName: string;
  username: string;
  isOnline: boolean;
  lastSeen: string;
}


// Union type for search results
export type SearchResult = SearchedUser ;


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
  type: 'message' | 'friend_request'  | 'system';
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
  username?: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  read?:boolean;
  sent?:boolean;
  delivered?:boolean;
  tickStatus?:'none' | 'sent' | 'delivered' | 'read';
  isTyping?:boolean;
  
  
   lastMessageSenderId?:string;
  lastMessageMedia?:"image" | "video" | "audio" | "document";
  unreadCount: number;
  isOnline?: boolean;
  fullName?: string;
  isOnboarded?: boolean;
    encryptedKey?:string;
   pendingFriendRequests?: number;
   location?:string;
   bio?:string;

  friends?: { _id: string }[];
  chats?: { _id: string }[];
}

export type ChatItem =User;
 
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


export interface FriendRequestReceivedData {
  requestId: string;
  sender: {
    _id: string;
    fullName: string;
    username: string;
    profilePic: string;
  };
  timestamp: string;
}

export interface FriendRemovedData {
  userId: string;
  friendId: string;
  timestamp: string;
}

export interface FriendRequestAcceptedData {
  requestId: string;
  senderId: string;
  receiverId: string;
  receiver: {
    _id: string;
    fullName?: string;
    username?: string;
    profilePic?: string;
  };
  timestamp: string;
}

export interface FriendRequestData {
  requestId: string;
  senderId: string;
  receiverId: string;
  timestamp: string;
}

 export interface FriendRequestRejectedData {
  requestId: string;
  rejectorId: string;
  senderId: string;
  rejectedAt: string;
}


export interface FriendRequestWithdrawnData {
  requestId: string;
  senderId: string;
  receiverId: string;
  timestamp: string;
}
export interface FriendRequestSentData {
  senderId: string;
  receiverId: string;
  requestId: string;
  timestamp: string;
}


export interface PendingRequestsCountData {
  pendingCount: number;
}



export interface MediaForUI {
  url: string | File | Blob;
  type: "image" | "video" | "audio" | "document" | "blob"; // Add "blob" here
  encryptedKey?: string;
  senderEncryptedKey?: string;
  fileName?: string;
  fileSize?: number;
    isVoiceMessage?:boolean;
    duration?:number;
}


export interface DecryptedMediaForUI extends MediaForUI {
  // Internal decryption state
  _isDecrypted: boolean;
  _canPreview: boolean;
  _requiresPlayer?: boolean;
  _mimeType?: string;
  _previewUrl?: string; // Object URL for preview
  _error?: string;
}

export interface MediaForBackend {
  url: string;
  type: "image" | "video" | "audio" | "document" | "blob"; // Same type
  encryptedKey?: string;
  senderEncryptedKey?: string;
}

export interface BaseMessage {
  _id: string;
  sender: string;
  type: "preKey" | "ratcheted";
  ciphertext?: string;
  text?: string;
  media?: MediaForUI[]; // Use MediaForUI for BaseMessage
  sentAt: string;
  delivered?: boolean;
  read?: boolean;
  isTemp?: boolean;
  sent?: boolean;
  status?:string;
  isVoiceMessage?:boolean;

}

export interface Message extends BaseMessage {
  receiver: string;
  // media is already inherited from BaseMessage as MediaForUI[]
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


