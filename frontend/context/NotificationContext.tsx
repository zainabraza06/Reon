// contexts/NotificationContext.tsx
'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import { User } from '@/types';

interface FriendRequestEvent {
  sender?: { _id?: string; fullName?: string };
  receiver?: { _id?: string; fullName?: string };
  senderId?: string;
  receiverId?: string;
  requestId?: string;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  initializeSocketListeners: (user: User) => (() => void) | void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);

      setNotifications(prev => {
        if (prev.some(n => n.title === notification.title && n.message === notification.message)) {
          return prev;
        }
        return [...prev, { ...notification, id }];
      });

      if (notification.duration) {
        setTimeout(() => removeNotification(id), notification.duration);
      }
    },
    [removeNotification]
  );

  const initializeSocketListeners = useCallback(
    (user: User) => {
      socketService.connect(user._id);

      // friend-request-received → toast for the receiver
      const handleFriendRequestReceived = (data: FriendRequestEvent) => {
        addNotification({
          type: 'info',
          title: 'New Friend Request',
          message: `${data?.sender?.fullName || 'Someone'} sent you a friend request`,
          duration: 5000
        });
      };

      // friend-request-accepted-realtime → toast for both sides
      const handleFriendRequestAccepted = (data: FriendRequestEvent) => {
        const currentUserId = user._id;
        const senderId = data?.senderId || data?.sender?._id;
        const receiverId = data?.receiverId || data?.receiver?._id;

        if (currentUserId === senderId) {
          addNotification({
            type: 'success',
            title: 'Friend Request Accepted',
            message: `${data?.receiver?.fullName || 'Someone'} accepted your friend request!`,
            duration: 5000
          });
        } else if (currentUserId === receiverId) {
          addNotification({
            type: 'success',
            title: 'You are now friends!',
            message: `You are now friends with ${data?.sender?.fullName || 'Someone'}`,
            duration: 5000
          });
        }
      };

      // friend-request-rejected → toast for the original sender
      const handleFriendRequestRejected = (data: FriendRequestEvent) => {
        if (user._id === data?.senderId) {
          addNotification({
            type: 'info',
            title: 'Friend Request Declined',
            message: 'Your friend request was declined',
            duration: 4000
          });
        }
      };

      // friend-request-withdrawn → toast for the receiver
      const handleFriendRequestWithdrawn = (data: FriendRequestEvent) => {
        if (user._id === data?.receiverId) {
          addNotification({
            type: 'info',
            title: 'Friend Request Withdrawn',
            message: 'A friend request was withdrawn',
            duration: 4000
          });
        }
      };

      socketService.on('friend-request-received', handleFriendRequestReceived);
      socketService.on('friend-request-accepted-realtime', handleFriendRequestAccepted);
      socketService.on('friend-request-rejected', handleFriendRequestRejected);
      socketService.on('friend-request-withdrawn', handleFriendRequestWithdrawn);

      return () => {
        socketService.off('friend-request-received', handleFriendRequestReceived);
        socketService.off('friend-request-accepted-realtime', handleFriendRequestAccepted);
        socketService.off('friend-request-rejected', handleFriendRequestRejected);
        socketService.off('friend-request-withdrawn', handleFriendRequestWithdrawn);
      };
    },
    [addNotification]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        initializeSocketListeners
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
