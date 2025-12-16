// lib/socket.ts - UPDATED FOR BACKEND COMPATIBILITY
import { io, Socket } from "socket.io-client";
import {
  Message,
 MediaForBackend, FriendRequestAcceptedData, FriendRequestReceivedData,FriendRequestRejectedData,
  FriendRequestSentData,FriendRequestWithdrawnData,PendingCountData,FriendRemovedData
} from "@/types";

type EventCallback<T = unknown> = (data: T) => void;


interface UserStatusChangedData {
  userId: string;
  isOnline: boolean;
  lastSeen: string;

  
}


interface OnlineFriendsResponseData {
  success: boolean;
  onlineFriends: string[]; // Array of friend IDs
  timestamp: string;
}
interface TypingStatusData {
  senderId: string;
  receiverId: string;
  isTyping: boolean;
  timestamp: string;
}

interface MessageDeliveredData {
  messageId: string;
  receiverId: string;
  deliveredAt: string;
  status: string;
}

interface MessageReadData {
  messageIds: string[];
  readerId: string;
  senderId: string;
  readAt: string;
}

interface ConversationReadData {
  senderId: string;
  readerId: string;
  readAt: string;
  messageCount: number;
}

interface OnlineStatusResponseData {
  statuses: {
    [userId: string]: {
      isOnline: boolean;
      lastSeen: number | null;
    };
  };
}

interface TypingStatusResponseData {
  senderId: string;
  isTyping: boolean;
  typingTo?: string;
}

interface AuthenticatedData {
  userId: string;
  socketId: string;
  onlineFriends?: string[];
}

interface SendMessageData {
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

class SocketService {
  private socket: Socket | null = null;
  private userId: string | null = null;
  private listeners: Map<string, EventCallback<unknown>[]> = new Map();
  private connectionState: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';
  private heartbeatInterval: NodeJS.Timeout | null = null;
    private callSocket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private connectionPromise: Promise<boolean> | null = null;

   connect(userId: string): Promise<boolean> {
  // Return existing promise if already connecting
  if (this.connectionPromise) {
    return this.connectionPromise;
  }

  this.connectionPromise = new Promise((resolve) => {
    if (this.socket && this.socket.connected) {
      this.userId = userId;
      this.startHeartbeat(userId);
      resolve(true);
      this.connectionPromise = null;
      return;
    }

    this.userId = userId;
    this.connectionState = 'connecting';

      // Grab auth token if available
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "https://reon-4g0b.onrender.com", {
      auth: { userId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      query: { userId }
    });

      try {
      this.callSocket = io((process.env.NEXT_PUBLIC_SOCKET_URL || "https://reon-4g0b.onrender.com") + "/calls", {
        auth: { token },
        transports: ['websocket', 'polling'],
        withCredentials: true,
        query: { userId }
      });

      // Forward incoming call namespace events into our event system
      this.callSocket.onAny((eventName, ...args) => {
        // Prefix with namespace to avoid collisions (events already have 'call:' prefix)
        this.emitEvent(eventName, args[0]);
      });

      // Debug outgoing from call namespace
      this.callSocket.onAnyOutgoing((eventName, ...args) => {
        console.log(`📤 [CALL-NS OUTGOING] Emitting: "${eventName}"`, {
          data: args[0],
          timestamp: new Date().toISOString(),
          socketId: this.callSocket?.id
        });
      });
    } catch (err) {
      console.warn('Could not connect to /calls namespace:', err);
      this.callSocket = null;
    }

    // ✅ Set up listeners BEFORE connect event fires
    this.setupDefaultListeners();
    this.debugSocketEvents(); // Only call this ONCE!
    
    this.socket.on("connect", () => {

      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      
      this.emit("authenticate", userId);
      
      // Start heartbeat
      this.startHeartbeat(userId);
      this.emit("request-online-friends");

    });

    this.socket.on("authenticated", (data: AuthenticatedData) => {

      this.connectionState = 'connected';
      resolve(true);
      this.connectionPromise = null;
      this.emitEvent('authenticated', data);
    });

    this.socket.on("authentication-error", (error: { message: string }) => {
      console.error("❌ Authentication error:", error);
      this.connectionState = 'error';
      resolve(false);
      this.connectionPromise = null;
      this.emitEvent('authentication-error', error);
    });

    this.socket.on("disconnect", (reason) => {
  
      this.connectionState = 'disconnected';
      this.stopHeartbeat();
      this.emitEvent('disconnected', { reason });
      
      // Auto-reconnect logic
      if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId) {
        this.reconnectAttempts++;
       
        
        setTimeout(() => {
          if (this.userId && !this.socket?.connected) {
            this.connect(this.userId).catch(err => 
              console.error('Reconnect failed:', err)
            );
          }
        }, 2000);
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      this.connectionState = 'error';
      this.stopHeartbeat();
      resolve(false);
      this.connectionPromise = null;
      this.emitEvent('connect-error', error);
    });

    this.socket.on("reconnect", () => {
  
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      
      if (this.userId) {
        this.emit("authenticate", this.userId);
        this.startHeartbeat(this.userId);
      }
    });

    this.socket.on("reconnect_error", (error) => {
      console.error("❌ Reconnection error:", error);
    });

    this.socket.on("reconnect_failed", () => {
      console.error("❌ Reconnection failed after multiple attempts");
    });

    // ✅ Add timeout to prevent hanging promise
    setTimeout(() => {
      if (this.connectionState === 'connecting') {
     
        this.connectionState = 'error';
        resolve(false);
        this.connectionPromise = null;
        
        // Clean up socket on timeout
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
             this.callSocket?.removeAllListeners();
          this.socket = null;
        }
      }
    }, 10000);
  });

  return this.connectionPromise;
}

// Keep only ONE debug method (remove setupDebugListeners since they're the same)
private debugSocketEvents() {
  if (!this.socket) {
   
    return;
  }




}

  private startHeartbeat(userId: string) {
    // Clear any existing interval
    this.stopHeartbeat();
    
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected && userId) {
        this.emit("heartbeat", { userId });
      }
    }, 15000); // 20 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private setupDefaultListeners() {
    if (!this.socket) return;
 this.socket.onAny((eventName, data) => {
    this.emitEvent(eventName, data);
  });
  }

  disconnect() {
    // Stop heartbeat
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
      this.connectionState = 'disconnected';
      this.reconnectAttempts = 0;
      this.connectionPromise = null;
    }
  }

  emit(event: string, data?: unknown) {
    // Route call-related events to the calls namespace socket when available
    if (event.startsWith('call:')) {
      if (this.callSocket && this.callSocket.connected) {
        console.log(`📤 Emitting ${event} on /calls namespace:`, data);
        this.callSocket.emit(event, data);
        return;
      }
      // fallback to main socket if call namespace not available
    }

    if (this.socket && this.socket.connected) {
      console.log(`📤 Emitting ${event}:`, data);
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ Cannot emit ${event}: Socket not connected`);
    }
  }

  // Heartbeat method (can be called manually if needed)
  sendHeartbeat() {
    if (this.userId && this.socket?.connected) {
      this.emit("heartbeat", { userId: this.userId });
    }
  }




  confirmMessageDelivery(data: { messageId: string; receiverId: string; senderId: string }) {
    this.emit("confirm-message-delivery", data);
  }

  markMessageRead(data: { messageId: string; senderId: string; readerId: string }) {
    this.emit("mark-message-read", data);
  }

  markConversationRead(data: { senderId: string; receiverId: string }) {
    this.emit("mark-conversation-read", data);
  }

    startTyping(data: { senderId: string; receiverId: string; isTyping: boolean; timestamp: string }) {
    this.emit('start-typing', data);
  }
  
  stopTyping(data: { senderId: string; receiverId: string; isTyping: boolean; timestamp: string }) {
    this.emit('stop-typing', data);
  }
  
  onTypingStart(callback: (data: TypingStatusData) => void) {
    this.on('user-start-typing', callback);
  }

  onTypingStop(callback:(data:TypingStatusData)=>void){
    this.on('user-stop-typing', callback);
  }

    // Typing Listeners
  onUserTyping(callback: (data: TypingStatusData) => void) {
    this.addEventListener('user-typing', callback);
  }

 sendFriendRequest(data: { senderId: string; receiverId: string }) {
    this.emit("send-friend-request", data);
  }

  acceptFriendRequest(data: { requestId: string; acceptorId: string; senderId: string }) {
    this.emit("accept-friend-request", data);
  }

  rejectFriendRequest(data: { requestId: string; rejectorId: string; senderId: string }) {
    this.emit("reject-friend-request", data);
  }

  withdrawFriendRequest(data: { requestId: string; senderId: string; receiverId: string }) {
    this.emit("withdraw-friend-request", data);
  }

  removeFriend(data: { userId: string; friendId: string }) {
    this.emit("remove-friend", data);
  }

  // ========== LISTENER METHODS ==========
  onFriendRequestReceived(callback: (data: FriendRequestReceivedData) => void) {
    this.addEventListener('friend-request-received', callback);
  }

  onFriendRequestWithdrawn(callback: (data: FriendRequestWithdrawnData) => void) {
    this.addEventListener('friend-request-withdrawn', callback);
  }

  onFriendRequestSent(callback: (data: FriendRequestSentData) => void) {
    this.addEventListener('friend-request-sent-realtime', callback);
  }

  onFriendRequestAccepted(callback: (data: FriendRequestAcceptedData) => void) {
    this.addEventListener('friend-request-accepted-realtime', callback);
  }

  onFriendRequestRejected(callback: (data: FriendRequestRejectedData) => void) {
    this.addEventListener('friend-request-rejected', callback);
  }

  onPendingRequestsCountUpdated(callback: (data: PendingCountData) => void) {
    this.addEventListener('pending-requests-count-updated', callback);
  }

  onFriendRemoved(callback: (data: FriendRemovedData) => void) {
    this.addEventListener('friend-removed', callback);
  }


  // ========== STATUS QUERY METHODS ==========
  checkOnlineStatus(userIds: string[]) {
    this.emit("check-online-status", { userIds });
  }

  getTypingStatus(senderId: string) {
    this.emit("get-typing-status", { senderId });
  }

  // ========== EVENT LISTENERS ==========
  // Authentication Events
  onAuthenticated(callback: (data: AuthenticatedData) => void) {
    this.addEventListener('authenticated', callback);
  }

  onAuthenticationError(callback: (error: { message: string }) => void) {
    this.addEventListener('authentication-error', callback);
  }

onOnlineFriendsResponse(callback: (data: OnlineFriendsResponseData) => void) {
  this.addEventListener('online-friends-response', callback);
}


  public removeOnlineFriendsListener() {
    this.socket?.off('online-friends-response');
  }
   onSendMessage(callback: (message: Message) => void)  {
    this.addEventListener('send-message', callback);
}


  public requestOnlineFriends() {
    if (this.socket?.connected) {
      this.socket.emit('request-online-friends');
    }
  }

  // Message Event Listeners
  onNewMessage(callback: (message: Message) => void) {
    this.addEventListener('new-message', callback);
  }

  onMessageSent(callback: (message: Message) => void) {
    this.addEventListener('message-sent', callback);
  }

  onMessageDelivered(callback: (data: MessageDeliveredData) => void) {
    this.addEventListener('message-delivered', callback);
  }

  onMessageRead(callback: (data: MessageReadData) => void) {
    this.addEventListener('message-read', callback);
  }


  onMessageError(callback: (error: { error: string; data?: unknown; originalError?: string }) => void) {
    this.addEventListener('message-error', callback);
  }


  

  // User Status Listeners
  onUserStatusChanged(callback: (data: UserStatusChangedData) => void) {
    this.addEventListener('user-status-changed', callback);
  }




  
  // Connection Events
  onConnect(callback: () => void) {
    this.socket?.on("connect", callback);
  }

  onDisconnect(callback: () => void) {
    this.addEventListener('disconnected', callback);
  }

  onError(callback: (error: { message: string }) => void) {
    this.addEventListener('socket-error', callback);
  }

  onConnectError(callback: (error: unknown) => void) {
    this.addEventListener('connect-error', callback);
  }

  onReconnect(callback: (attemptNumber: number) => void) {
    this.socket?.on("reconnect", callback);
  }

  onReconnectError(callback: (error: unknown) => void) {
    this.socket?.on("reconnect_error", callback);
  }

  // Generic event listener method
  on<T>(event: string, callback: (data: T) => void) {
    this.addEventListener(event, callback);
  }

  off<T>(event: string, callback?: (data: T) => void) {
    this.removeListener(event, callback);
  }

  private addEventListener<T>(event: string, callback: EventCallback<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback as EventCallback<unknown>);
  }

  private emitEvent<T>(event: string, data: T) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(callback => (callback as EventCallback<T>)(data));
    }
  }

  removeListener<T>(event: string, callback?: EventCallback<T>) {
    if (this.listeners.has(event)) {
      if (callback) {
        const callbacks = this.listeners.get(event)!;
        const index = callbacks.indexOf(callback as EventCallback<unknown>);
        if (index > -1) callbacks.splice(index, 1);
      } else {
        this.listeners.delete(event);
      }
    }
    this.socket?.off(event);
  }

  removeAllListeners() {
    this.listeners.clear();
    this.socket?.removeAllListeners();
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  getSocketId(): string | null {
    return this.socket?.id || null;
  }

  getUserId(): string | null {
    return this.userId;
  }

  // Helper to wait for connection
  async waitForConnection(timeout = 10000): Promise<boolean> {
    if (this.isConnected()) return true;
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(() => {
        if (this.isConnected()) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }
}

export const socketService = new SocketService();

export type {
  FriendRequestReceivedData,
  FriendRequestAcceptedData,
  FriendRequestRejectedData,
  FriendRequestSentData,
  UserStatusChangedData,
  TypingStatusData,
  MessageDeliveredData,
  MessageReadData,
  ConversationReadData,
  OnlineStatusResponseData,
  TypingStatusResponseData,
  AuthenticatedData,
  SendMessageData,
  OnlineFriendsResponseData  // ADD THIS LINE
};


