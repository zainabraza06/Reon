
export interface ChatMessage {
  text: string;
  type: "user" | "other";
  time?: string;
  status?: string;
  visible?: boolean;
  typing?: boolean;
  currentText?: string;
}


export interface SearchedUserBase {
  _id: string;
  type: 'user' ;
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



export interface TypingEvent {
  to: string;
  from: string;
}

export interface CounterState {
  users: number;
  messages: number;
}


export interface FlashMessage {
  message: string;
  type: "success" | "error" | "info";
}



// User represents a person in the system
export interface User {
  _id: string;
  username?: string;
  fullName?: string;
  profilePic?: string;
  isOnline?: boolean;
  bio?: string;
  location?: string;
  nativeLanguage?: string;
  isOnboarded?: boolean;
  encryptedKey?: string;
  pendingFriendRequests?: number;
  
  unreadCount: number;

  friends?: { _id: string }[];
  chats?: { _id: string }[];
}

// ChatItem represents a message or conversation info for a user
export interface ChatItem extends User {
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageSenderId?: string;
  lastMessageMedia?: "image" | "video" | "audio" | "document";


  read?: boolean;
  sent?: boolean;
  delivered?: boolean;
  tickStatus?: 'none' | 'sent' | 'delivered' | 'read';
  isTyping?: boolean;
}


export interface IncomingCallData {
  callId: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  type: "audio" | "video";
}


export type CallState = 'idle' | 'initiating' | 'ringing' | 'connecting' | 'connected' | 
'ended' | 'failed' | 'rejected' | 'busy';
export interface ActiveCallData {
  callId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: "audio" | "video";
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  startTime: number;
  callState?: CallState;
}



export type EventCallback<T = unknown> = (data: T) => void;


export interface UserStatusChangedData {
  userId: string;
  isOnline: boolean;
  lastSeen: string;

  
}


export interface OnlineFriendsResponseData {
  success: boolean;
  onlineFriends: string[]; // Array of friend IDs
  timestamp: string;
}
export interface TypingStatusData {
  senderId: string;
  receiverId: string;
  isTyping: boolean;
  timestamp: string;
}

export interface MessageDeliveredData {
  messageId: string;
  receiverId: string;
  deliveredAt: string;
  status: string;
}

export interface MessageReadData {
  messageIds: string[];
  readerId: string;
  senderId: string;
  readAt: string;
}

export interface ConversationReadData {
  senderId: string;
  readerId: string;
  readAt: string;
  messageCount: number;
}

export interface OnlineStatusResponseData {
  statuses: {
    [userId: string]: {
      isOnline: boolean;
      lastSeen: number | null;
    };
  };
}

export interface TypingStatusResponseData {
  senderId: string;
  isTyping: boolean;
  typingTo?: string;
}

export interface AuthenticatedData {
  userId: string;
  socketId: string;
  onlineFriends?: string[];
}

export interface SendMessageData {
  sender: string;
  receiver: string;
  ciphertext: string;
  type: "preKey" | "ratcheted";
  encryptedKey: string;
  senderEncryptedKey: string;
  isGroup?: boolean;
  contentType?: string;
  media?: MediaForBackend[];
  messageType?: string;
}


export type CallViewMode = 'full' | 'mini';

export interface CallContextType {
  // Incoming calls
  incomingCall: IncomingCallData | null;
  showIncomingCall: (data: IncomingCallData) => void;
  dismissIncomingCall: () => void;
  
  // Active calls
  activeCall: ActiveCallData | null;
  startCall: (data: ActiveCallData) => void;
  updateCallStreams: (local?: MediaStream, remote?: MediaStream) => void;
  updateCallState: (state: CallState) => void;
  endCall: () => void;
  
  // Call view mode
  callViewMode: CallViewMode;
  setCallViewMode: (mode: CallViewMode) => void;
  
  // Call state
  isCallActive: boolean;
  setIsCallActive: (active: boolean) => void;
  
  // Call controls
  isMicEnabled: boolean;
  setIsMicEnabled: (enabled: boolean) => void;
  isCameraEnabled: boolean;
  setIsCameraEnabled: (enabled: boolean) => void;
}


export interface FriendRequest {
  _id: string;
  sender: User;
  receiver: User;
  status: 'pending' | 'accepted' | 'rejected'|'withdrawn';
  createdAt: string;
}


// types.ts (updated)
export interface Friend {
  _id: string;
  fullName: string;
  email?: string;
  username?: string;
  profilePic?: string;
  nativeLangugae?:string;
}

export interface OnlineStatusEvent {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => void;
  refreshUser: () => Promise<User | null>;
  checkAuth: () => Promise<User | null>;
}




export interface FriendRemovedData {
  userId: string;
  friendId: string;
  timestamp: string;
}

export interface FriendRequestReceivedData {
  requestId: string;
  sender: Friend; // Use Friend interface instead
  timestamp: string;
}

export interface FriendRequestAcceptedData {
  requestId: string;
  senderId: string;
  receiverId: string;
  receiver: Friend; // Now this matches Friend interface
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
  receiverId: string;
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


export interface PendingCountData {
  count: number;
}

export type FriendStatus = 
  | 'none'              // Not friends, no request
  | 'pending-sent'      // You sent a request
  | 'pending-received'  // You received a request
  | 'friends'           // You are friends
  | 'removed'           // Recently removed (temporary state)

export interface FriendRequestState {
  userId: string;
  status: FriendStatus;
  requestId?: string; // Only for pending states
}


// Media interfaces
export interface MediaForUI {
  url: string | File | Blob;
  type: "image" | "video" | "audio" | "document" | "blob";
  fileName?: string;
  fileSize?: number;
  isVoiceMessage?: boolean;
  duration?: number;
  isEncrypted?: boolean;
  
  // Encryption fields
  encryptedKey?: string;
  senderEncryptedKey?: string;
  encryptionIV?: string; // Required for decryption
  
  // Backend fields
  downloadUrl?: string; // For download endpoint: /api/messages/download/{id}
  originalName?: string; // Original filename
  fileId?: string; // GridFS file ID
  
  // For UI display/URL generation
  _previewUrl?: string; // Temporary blob URL for preview
}

export interface DecryptedMediaForUI {
  // Core media data
  url: Blob; // Always Blob after decryption
  type: "image" | "video" | "audio" | "document" | "blob";
  fileName: string;
  fileSize: number;
  encryptionIV?: string;
  
  // Internal decryption state
  _isDecrypted: boolean;
  _canPreview: boolean;
  _requiresPlayer?: boolean;
  _mimeType: string;
  _previewUrl: string; // Object URL for preview
  _error?: string;
  _encryptedUrl?: string; // Original encrypted URL for reference
}

export interface MediaForBackend {
  // What backend stores and returns
  url: string; // Always string URL: /api/messages/media/{id}
  downloadUrl: string; // Download URL: /api/messages/download/{id}
  type: "image" | "video" | "audio" | "document";
  fileName: string;
  fileSize: number;
  originalName: string;
  fileId: string;
  isEncrypted: boolean;
  
  // Encryption data
  encryptedKey: string; // For recipient
  senderEncryptedKey: string; // For sender
  encryptionIV: string; // Base64 encoded IV
}

// Message interfaces
export interface BaseMessage {
  _id: string;
  sender: string;
  receiver?: string; // Make optional in BaseMessage
  ciphertext: string; // Encrypted text (base64)
  type: "ratcheted"; // Your backend only uses "ratcheted"
  contentType: "text" | "image" | "audio" | "video" | "document"|"call-log"; // From backend
  
  // Encrypted keys (from backend)
  encryptedKey: string; // Text encryption key for current user
  senderEncryptedKey?: string; // Sender's copy of text key
  
  // Media
  media?: MediaForUI[]; // For UI display
  mediaBackend?: MediaForBackend[]; // What backend actually returns
  
  // Timestamps
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  
  // Status flags
  delivered: boolean;
  read: boolean;
  status: "sent" | "delivered" | "read"|"none";
  
  // UI-only fields
  text?: string; // Decrypted text for display
  isTemp?: boolean; // Temporary message before backend confirmation
  isFailed?: boolean; // Failed to send
  isVoiceMessage?: boolean; // Special handling for voice messages
}

export interface Message extends BaseMessage {
  receiver: string; // Required in full Message
}

// What backend actually returns in getMessages
export interface BackendMessage {
  _id: string;
  sender: string;
  receiver: string;
  ciphertext: string;
  type: "ratcheted";
  contentType: "text" | "image" | "audio" | "video" | "document"|"call-log";
  encryptedKey: string; // Already resolved for current user
  media: MediaForBackend[]; // Backend media format
  sentAt: string;
  delivered: boolean;
  read: boolean;
  status: "sent" | "delivered" | "read";
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




