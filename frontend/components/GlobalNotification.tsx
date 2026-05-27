// components/GlobalNotifications.tsx
'use client';
import React from 'react';
import { useNotification } from '@/context/NotificationContext';
import Toast from '@/components/chat/Toast';

export const GlobalNotifications: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[10000] flex flex-col gap-2.5 max-w-[400px] sm:top-2.5 sm:right-2.5 sm:max-w-[calc(100vw-20px)]">
      {notifications.map(notification => (
        <Toast
          key={notification.id}
          type={notification.type}
          title={notification.title}
          message={notification.message}
          duration={notification.duration}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
};
