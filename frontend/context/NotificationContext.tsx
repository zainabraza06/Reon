// contexts/NotificationContext.tsx
'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import { User } from '@/types';

interface FriendRequestEvent {
  sender?: { fullName?: string };
  receiver?: { fullName?: string };
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
  initializeSocketListeners: (user: User) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 🚀 Remove notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 🚀 Add notification (TOP LEVEL — valid hook usage)
  const addNotification = useCallback(
    (notification: Omit<Notification, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);

      setNotifications(prev => {
        // Avoid duplicate spam
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

  // 🚀 Initialize socket listeners
  const initializeSocketListeners = useCallback(
    (user: User) => {
      socketService.connect(user._id);

      // 🔔 Friend request received
      const handleFriendRequestReceived = (data: FriendRequestEvent) => {
        const senderName = data?.sender?.fullName || 'Someone';
        addNotification({
          type: 'info',
          title: 'New Friend Request',
          message: `${senderName} sent you a friend request`,
          duration: 5000
        });
      };

      // 🔔 Friend request accepted
      const handleFriendRequestAccepted = (data: FriendRequestEvent) => {
        const receiverName = data?.receiver?.fullName || 'Someone';
        addNotification({
          type: 'success',
          title: 'Friend Request Accepted',
          message: `${receiverName} accepted your friend request!`,
          duration: 5000
        });
      };

      // 🔔 Friend request withdrawn
      const handleFriendRequestWithdrawn = () => {
        addNotification({
          type: 'info',
          title: 'Friend Request Withdrawn',
          message: 'A friend request has been withdrawn',
          duration: 3000
        });
      };

      // Register listeners
      socketService.onFriendRequestReceived(handleFriendRequestReceived);
      socketService.onFriendRequestAccepted(handleFriendRequestAccepted);
      socketService.onFriendRequestWithdrawn(handleFriendRequestWithdrawn);

      // Cleanup
      return () => {
        socketService.removeListener('friend-request-received', handleFriendRequestReceived);
        socketService.removeListener('friend-request-accepted-realtime', handleFriendRequestAccepted);
        socketService.removeListener('friend-request-withdrawn', handleFriendRequestWithdrawn);
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
