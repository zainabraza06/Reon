// components/GlobalNotifications.tsx
'use client';
import React from 'react';
import { useNotification } from '@/context/NotificationContext';
import Toast from '@/components/chat/Toast';
import styles from './GlobalNotification.module.css';

export const GlobalNotifications: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className={styles.globalNotifications}>
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