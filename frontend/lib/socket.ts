// lib/socket.ts - COMPLETE UPDATED VERSION
import { io, Socket } from "socket.io-client";
import {
  Message,
  MessageSeenEvent,
  Notification,
  TypingEvent,
  OnlineStatusEvent,
  NotificationCountEvent
} from "@/types";

type EventCallback<T = unknown> = (data: T) => void;

interface FriendRequestReceivedData {
  requestId: string;
  sender: {
    _id: string;
    fullName: string;
    username: string;
    profilePic: string;
  };
  timestamp: string;
}

interface FriendRemovedData {
  userId: string;
  friendId: string;
  timestamp: string;
}

interface FriendRequestAcceptedData {
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

interface FriendRequestWithdrawnData {
  requestId: string;
  senderId: string;
  receiverId: string;
  timestamp: string;
}

interface FriendRequestSentData {
  senderId: string;
  receiverId: string;
  requestId: string;
  timestamp: string;
}

interface PendingRequestsCountData {
  count: number;
}

interface FriendsListUpdatedData {
  userId: string;
}

// New interfaces for enhanced features
interface MessageDeliveredEvent {
  messageId: string;
  receiverId: string;
}

interface TypingStartEvent {
  senderId: string;
  isTyping: boolean;
}

interface TypingStopEvent {
  senderId: string;
  isTyping: boolean;
}

class SocketService {
  private socket: Socket | null = null;
  private userId: string | null = null;
  private listeners: Map<string, EventCallback<unknown>[]> = new Map();
  private connectionState: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';

  connect(userId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.socket && this.socket.connected) {
        console.log('✅ Socket already connected');
        this.userId = userId;
        resolve(true);
        return;
      }

      this.userId = userId;
      this.connectionState = 'connecting';

      this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001", {
        auth: { userId },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
      });

      this.socket.on("connect", () => {
        console.log("✅ Connected to socket server:", this.socket?.id);
        this.connectionState = 'connected';
        this.emit("user-online", { userId });
        this.emit("join-user-room", userId);
        resolve(true);
      });

      this.socket.on("disconnect", (reason) => {
        console.log("❌ Disconnected from socket server. Reason:", reason);
        this.connectionState = 'disconnected';
      });

      this.socket.on("connect_error", (error) => {
        console.error("❌ Socket connection error:", error);
        this.connectionState = 'error';
        resolve(false);
      });

      this.socket.on("reconnect", (attemptNumber) => {
        console.log("🔄 Reconnected to socket server. Attempt:", attemptNumber);
        this.connectionState = 'connected';
        if (this.userId) {
          this.emit("user-online", { userId: this.userId });
          this.emit("join-user-room", this.userId);
        }
      });

      this.setupDefaultListeners();
    });
  }

  private setupDefaultListeners() {
    if (!this.socket) return;

    // Message Events
    this.socket.on("new-message", (message: Message) => {
      this.emitEvent('new-message', message);
    });

    this.socket.on("message-sent", (message: Message) => {
      this.emitEvent('message-sent', message);
    });

    this.socket.on("message-delivered", (data: MessageDeliveredEvent) => {
      this.emitEvent('message-delivered', data);
    });

    this.socket.on("message-error", (error: { error: string }) => {
      this.emitEvent('message-error', error);
    });

    // Enhanced Typing Events
    this.socket.on("typing-start", (data: TypingStartEvent) => {
      this.emitEvent('typing-start', data);
    });

    this.socket.on("typing-stop", (data: TypingStopEvent) => {
      this.emitEvent('typing-stop', data);
    });

    // Legacy Typing Events (for backward compatibility)
    this.socket.on("typing", (data: TypingEvent) => {
      this.emitEvent('typing', data);
    });

    this.socket.on("stop-typing", (data: TypingEvent) => {
      this.emitEvent('stop-typing', data);
    });

    this.socket.on("messages-seen", (data: MessageSeenEvent) => {
      this.emitEvent('messages-seen', data);
    });

    this.socket.on("user-online-status", (data: OnlineStatusEvent) => {
      this.emitEvent('user-online-status', data);
    });

    this.socket.on("user-online", (data: { userId: string }) => {
      this.emitEvent('user-online', data);
    });

    this.socket.on("user-offline", (data: { userId: string; lastSeen: string }) => {
      this.emitEvent('user-offline', data);
    });

    this.socket.on("new-notification", (notification: Notification) => {
      this.emitEvent('new-notification', notification);
    });

    this.socket.on("notification-count-update", (data: NotificationCountEvent) => {
      this.emitEvent('notification-count-update', data);
    });

    // --- FRIEND REQUEST EVENTS ---

    this.socket.on("friend-request-sent-realtime", (data: FriendRequestSentData) => {
      this.emitEvent('friend-request-sent-realtime', data);
    });

    this.socket.on("friend-request-received", (data: FriendRequestReceivedData) => {
      this.emitEvent('friend-request-received', data);
    });

    this.socket.on("friend-request-accepted-realtime", (data: FriendRequestAcceptedData) => {
      this.emitEvent('friend-request-accepted-realtime', data);
    });

    this.socket.on("friend-request-withdrawn", (data: FriendRequestWithdrawnData) => {
      this.emitEvent('friend-request-withdrawn', data);
    });

    this.socket.on("friend-request-rejected", (data: FriendRequestWithdrawnData) => {
      this.emitEvent('friend-request-rejected', data);
    });

    this.socket.on("friend-removed", (data: FriendRemovedData) => {
      this.emitEvent('friend-removed', data);
    });

    this.socket.on("pending-requests-count-updated", (data: PendingRequestsCountData) => {
      this.emitEvent('pending-requests-count-updated', data);
    });

    this.socket.on("friends-list-updated", (data: FriendsListUpdatedData) => {
      this.emitEvent('friends-list-updated', data);
    });

    // --- GROUP EVENTS ---
    this.socket.on("new-group-message", (message: Message) => {
      this.emitEvent('new-group-message', message);
    });

    this.socket.on("group-message-sent", (message: Message) => {
      this.emitEvent('group-message-sent', message);
    });

    this.socket.on("group-message-error", (error: { error: string }) => {
      this.emitEvent('group-message-error', error);
    });

    this.socket.on("group-typing", (data: { groupId: string; sender: string }) => {
      this.emitEvent('group-typing', data);
    });

    this.socket.on("group-stop-typing", (data: { groupId: string; sender: string }) => {
      this.emitEvent('group-stop-typing', data);
    });

    this.socket.on("group-message-seen", (data: { messageId: string; userId: string }) => {
      this.emitEvent('group-message-seen', data);
    });

    // --- NOTIFICATION EVENTS ---
    this.socket.on("notification-read", (data: { notificationId: string }) => {
      this.emitEvent('notification-read', data);
    });

    this.socket.on("error", (error: { message: string }) => {
      console.error('Socket error:', error);
      this.emitEvent('error', error);
    });
  }

  disconnect() {
    if (this.socket) {
      if (this.userId) {
        this.emit("user-offline", { userId: this.userId });
      }
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
      this.connectionState = 'disconnected';
    }
  }

  emit(event: string, data?: unknown) {
    if (this.socket) {
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ Cannot emit ${event}: Socket not connected`);
    }
  }

  // Message Methods
  sendMessage(messageData: {
    sender: string;
    receiver: string;
    ciphertext: string;
    type: string;
    media?: Array<{ url: string; type: string; encryptedKey?: string }>;
  }) {
    this.emit("send-message", messageData);
  }

  markMessageAsDelivered(messageId: string, receiverId: string) {
    this.emit("message-delivered", { messageId, receiverId });
  }

  // Enhanced Typing Methods
  startTypingEnhanced(receiverId: string) {
    this.emit("typing-start", { 
      receiverId, 
      senderId: this.userId 
    });
  }

  stopTypingEnhanced(receiverId: string) {
    this.emit("typing-stop", { 
      receiverId, 
      senderId: this.userId 
    });
  }

  // Legacy Typing Methods
  startTyping(to: string) {
    this.emit("typing", { to, from: this.userId } as TypingEvent);
  }

  stopTyping(to: string) {
    this.emit("stop-typing", { to, from: this.userId } as TypingEvent);
  }

  markMessageSeen(messageId: string, from: string) {
    const payload: MessageSeenEvent = {
      messageId,
      from
    };
    this.emit("message-seen", payload);
  }

  // Group Methods
  joinGroup(groupId: string) {
    this.emit("join-group", groupId);
  }

  leaveGroup(groupId: string) {
    this.emit("leave-group", groupId);
  }

  sendGroupMessage(data: {
    groupId: string;
    sender: string;
    ciphertext: string;
    type: string;
    media?: unknown[];
  }) {
    this.emit("send-group-message", data);
  }

  groupTyping(data: { groupId: string; sender: string }) {
    this.emit("group-typing", data);
  }

  groupStopTyping(data: { groupId: string; sender: string }) {
    this.emit("group-stop-typing", data);
  }

  markGroupMessageSeen(data: { messageId: string; groupId: string; userId: string }) {
    this.emit("group-message-seen", data);
  }

  // Notification Methods
  markNotificationRead(data: { notificationId: string; userId: string }) {
    this.emit("mark-notification-read", data);
  }

  // ========== EVENT LISTENERS ==========

  // Message Event Listeners
  onNewMessage(callback: (message: Message) => void) {
    this.addEventListener('new-message', callback);
  }

  onMessageSent(callback: (message: Message) => void) {
    this.addEventListener('message-sent', callback);
  }

  onMessageDelivered(callback: (data: MessageDeliveredEvent) => void) {
    this.addEventListener('message-delivered', callback);
  }

  onMessageError(callback: (error: { error: string }) => void) {
    this.addEventListener('message-error', callback);
  }

  // Enhanced Typing Listeners
  onTypingStart(callback: (data: TypingStartEvent) => void) {
    this.addEventListener('typing-start', callback);
  }

  onTypingStop(callback: (data: TypingStopEvent) => void) {
    this.addEventListener('typing-stop', callback);
  }

  // Legacy Typing Listeners
  onTyping(callback: (data: TypingEvent) => void) {
    this.addEventListener('typing', callback);
  }

  onStopTyping(callback: (data: TypingEvent) => void) {
    this.addEventListener('stop-typing', callback);
  }

  onMessagesSeen(callback: (data: MessageSeenEvent) => void) {
    this.addEventListener('messages-seen', callback);
  }

  onUserOnlineStatus(callback: (data: OnlineStatusEvent) => void) {
    this.addEventListener('user-online-status', callback);
  }

  onUserOnline(callback: (data: { userId: string }) => void) {
    this.addEventListener('user-online', callback);
  }

  onUserOffline(callback: (data: { userId: string; lastSeen: string }) => void) {
    this.addEventListener('user-offline', callback);
  }

  onNewNotification(callback: (notification: Notification) => void) {
    this.addEventListener('new-notification', callback);
  }

  onNotificationCountUpdate(callback: (data: NotificationCountEvent) => void) {
    this.addEventListener('notification-count-update', callback);
  }

  // --- Friend Request Realtime Methods ---

  sendFriendRequestRealtime(data: {
    senderId: string;
    receiverId: string;
    requestId: string;
  }) {
    this.emit("send-friend-request-realtime", {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  acceptFriendRequestRealtime(data: {
    requestId: string;
    senderId: string;
    receiverId: string;
  }) {
    this.emit("accept-friend-request-realtime", {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  rejectFriendRequest(data: {
    requestId: string;
    senderId: string;
    receiverId: string;
  }) {
    this.emit("reject-friend-request", {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  withdrawFriendRequest(data: {
    requestId: string;
    senderId: string;
    receiverId: string;
  }) {
    this.emit("withdraw-friend-request", {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  removeFriend(data: {
    userId: string;
    friendId: string;
  }) {
    this.emit("remove-friend", {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  joinUserRoom(userId: string) {
    this.emit("join-user-room", userId);
  }

  // Friend Request Listeners
  onFriendRequestReceived(callback: (data: FriendRequestReceivedData) => void) {
    this.addEventListener('friend-request-received', callback);
  }

  onFriendRequestAcceptedRealtime(callback: (data: FriendRequestAcceptedData) => void) {
    this.addEventListener('friend-request-accepted-realtime', callback);
  }

  onFriendRequestWithdrawn(callback: (data: FriendRequestWithdrawnData) => void) {
    this.addEventListener('friend-request-withdrawn', callback);
  }

  onFriendRequestRejected(callback: (data: FriendRequestWithdrawnData) => void) {
    this.addEventListener('friend-request-rejected', callback);
  }

  onFriendRemoved(callback: (data: FriendRemovedData) => void) {
    this.addEventListener('friend-removed', callback);
  }

  onFriendRequestSentRealtime(callback: (data: FriendRequestSentData) => void) {
    this.addEventListener('friend-request-sent-realtime', callback);
  }
  
  onPendingRequestsCountUpdated(callback: (data: PendingRequestsCountData) => void) {
    this.addEventListener('pending-requests-count-updated', callback);
  }

  onFriendsListUpdated(callback: (data: FriendsListUpdatedData) => void) {
    this.addEventListener('friends-list-updated', callback);
  }

  // Group Event Listeners - ADDING MISSING METHODS
  onNewGroupMessage(callback: (message: Message) => void) {
    this.addEventListener('new-group-message', callback);
  }

  onGroupMessageSent(callback: (message: Message) => void) {
    this.addEventListener('group-message-sent', callback);
  }

  onGroupMessageError(callback: (error: { error: string }) => void) {
    this.addEventListener('group-message-error', callback);
  }

  onGroupTyping(callback: (data: { groupId: string; sender: string }) => void) {
    this.addEventListener('group-typing', callback);
  }

  onGroupStopTyping(callback: (data: { groupId: string; sender: string }) => void) {
    this.addEventListener('group-stop-typing', callback);
  }

  onGroupMessageSeen(callback: (data: { messageId: string; userId: string }) => void) {
    this.addEventListener('group-message-seen', callback);
  }

  // Notification Event Listeners
  onNotificationRead(callback: (data: { notificationId: string }) => void) {
    this.addEventListener('notification-read', callback);
  }

  // Connection Events
  onConnect(callback: () => void) {
    this.socket?.on("connect", callback);
  }

  onDisconnect(callback: () => void) {
    this.socket?.on("disconnect", callback);
  }

  onError(callback: (error: { message: string }) => void) {
    this.addEventListener('error', callback);
  }

  onConnectError(callback: (error: unknown) => void) {
    this.socket?.on("connect_error", callback);
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
}

export const socketService = new SocketService();

export type {
  FriendRequestReceivedData,
  FriendRequestAcceptedData,
  FriendRequestWithdrawnData,
  FriendRequestSentData,
  FriendRemovedData,
  PendingRequestsCountData,
  FriendsListUpdatedData,
  MessageDeliveredEvent,
  TypingStartEvent,
  TypingStopEvent
};