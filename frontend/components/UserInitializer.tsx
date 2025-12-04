// components/UserInitializer.tsx
'use client';
import { useEffect } from 'react';
import { useNotification } from '@/context/NotificationContext';

export const UserInitializer: React.FC = () => {
  const { initializeSocketListeners } = useNotification();

  useEffect(() => {
    // Get user from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        const cleanup = initializeSocketListeners(user);
        return cleanup;
      } catch (error) {
        console.error('Error initializing user:', error);
      }
    }
  }, [initializeSocketListeners]);

  return null;
};