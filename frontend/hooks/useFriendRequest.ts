'use client';

import { useEffect, useState, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import type {
  FriendRequestReceivedData,
  FriendRequestAcceptedData,
  FriendRequestWithdrawnData,
  FriendRequestSentData,
  FriendRemovedData,
} from '@/lib/socket';

interface FriendRequestState {
  userId: string;
  status: 'none' | 'pending-sent' | 'pending-received' | 'friends';
  requestId?: string;
}

export function useFriendRequests(currentUserId: string | null) {
  const [friendStates, setFriendStates] = useState<Map<string, FriendRequestState>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);

  const updateFriendState = useCallback((userId: string, updates: Partial<FriendRequestState>) => {
    setFriendStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(userId) || { userId, status: 'none' };
      newMap.set(userId, { ...current, ...updates });
      return newMap;
    });
  }, []);

  const removeFriendState = useCallback((userId: string) => {
    setFriendStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
  }, []);

  useEffect(() => {
    if (!currentUserId || !socketService.isConnected()) return;

    // 1. Friend Request Received (Target is Me)
    const handleFriendRequestReceived = (data: FriendRequestReceivedData) => {
      console.log('🔔 Friend request received:', data);
      updateFriendState(data.sender._id, {
        userId: data.sender._id,
        status: 'pending-received',
        requestId: data.requestId
      });
      setPendingCount(prev => prev + 1);
    };

    // 2. Friend Request Sent (Initiator is Me - Realtime confirmation)
    const handleFriendRequestSent = (data: FriendRequestSentData) => {
      console.log('🚀 Friend request sent (confirmation):', data);
      updateFriendState(data.receiverId, {
        userId: data.receiverId,
        status: 'pending-sent',
        requestId: data.requestId
      });
    };

    // 3. Friend Request Accepted (Handling both Sender and Receiver perspectives)
    const handleFriendRequestAccepted = (data: FriendRequestAcceptedData) => {
      console.log('🤝 Friend request accepted:', data);
      
      // If I am the one who sent the request originally, and it's now accepted:
      if (data.senderId === currentUserId) {
        updateFriendState(data.receiverId, {
          userId: data.receiverId,
          status: 'friends',
          requestId: undefined // Clear request ID to prevent "sent" status
        });
      } 
      // If I am the one who accepted it (this event might come back to confirm):
      else if (data.receiverId === currentUserId) {
         updateFriendState(data.senderId, {
          userId: data.senderId,
          status: 'friends',
          requestId: undefined
        });
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    };

    // 4. Friend Request Withdrawn (Handling both sides)
    const handleFriendRequestWithdrawn = (data: FriendRequestWithdrawnData) => {
      console.log('↩️ Friend request withdrawn:', data);
      
      const isSender = data.senderId === currentUserId;
      const targetUserId = isSender ? data.receiverId : data.senderId;

      if (targetUserId) {
        updateFriendState(targetUserId, {
          userId: targetUserId,
          status: 'none',
          requestId: undefined // CRITICAL: Clear request ID
        });
      }

      // If I received the request (and it was withdrawn), decrease count
      if (!isSender) {
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    };

    // 5. Friend Request Rejected (Handling both sides)
    const handleFriendRequestRejected = (data: FriendRequestWithdrawnData) => {
      console.log('❌ Friend request rejected:', data);
      
      // data.senderId is the original sender of the request
      // data.receiverId is the one who rejected it

      if (currentUserId === data.senderId) {
        // I sent the request, and it was rejected. Reset status with receiver.
        updateFriendState(data.receiverId, {
          userId: data.receiverId,
          status: 'none',
          requestId: undefined // CRITICAL: Clear request ID
        });
      } else if (currentUserId === data.receiverId) {
        // I rejected the request. Reset status with sender.
        updateFriendState(data.senderId, {
          userId: data.senderId,
          status: 'none',
          requestId: undefined // CRITICAL: Clear request ID
        });
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    };

    // 6. Friend Removed (Handling both sides)
    const handleFriendRemoved = (data: FriendRemovedData) => {
      console.log('💔 Friend removed:', data);
      
      // data.userId is the person who performed the removal
      // data.friendId is the person who was removed

      if (currentUserId === data.userId) {
        // I removed someone
        updateFriendState(data.friendId, {
          userId: data.friendId,
          status: 'none',
          requestId: undefined // CRITICAL: Ensure this is undefined so button shows "Add Friend" not "Sent"
        });
      } else if (currentUserId === data.friendId) {
        // Someone removed me
        updateFriendState(data.userId, {
          userId: data.userId,
          status: 'none',
          requestId: undefined // CRITICAL: Ensure this is undefined
        });
      }
    };

    const handlePendingCountUpdate = (data: { count: number }) => {
      setPendingCount(data.count);
    };

    // Register listeners
    socketService.onFriendRequestReceived(handleFriendRequestReceived);
    socketService.onFriendRequestSentRealtime(handleFriendRequestSent);
    socketService.onFriendRequestAcceptedRealtime(handleFriendRequestAccepted);
    socketService.onFriendRequestWithdrawn(handleFriendRequestWithdrawn);
    socketService.onFriendRequestRejected(handleFriendRequestRejected);
    socketService.onFriendRemoved(handleFriendRemoved);
    socketService.onPendingRequestsCountUpdated(handlePendingCountUpdate);

    return () => {
      // Cleanup
      socketService.removeListener('friend-request-received', handleFriendRequestReceived);
      socketService.removeListener('friend-request-sent-realtime', handleFriendRequestSent);
      socketService.removeListener('friend-request-accepted-realtime', handleFriendRequestAccepted);
      socketService.removeListener('friend-request-withdrawn', handleFriendRequestWithdrawn);
      socketService.removeListener('friend-request-rejected', handleFriendRequestRejected);
      socketService.removeListener('friend-removed', handleFriendRemoved);
      socketService.removeListener('pending-requests-count-updated', handlePendingCountUpdate);
    };
  }, [currentUserId, updateFriendState]);

  // Actions
  const sendFriendRequest = useCallback((receiverId: string, requestId: string) => {
    if (!currentUserId) return;
    
    // Optimistic Update
    updateFriendState(receiverId, {
      userId: receiverId,
      status: 'pending-sent',
      requestId
    });
    
    // NOTE: The actual socket emit happens via the API call usually, 
    // but if you are using pure sockets:
    socketService.sendFriendRequestRealtime({
      senderId: currentUserId,
      receiverId,
      requestId
    });
  }, [currentUserId, updateFriendState]);

  const acceptFriendRequest = useCallback((senderId: string, requestId: string) => {
    if (!currentUserId) return;

    // Optimistic Update
    updateFriendState(senderId, {
      userId: senderId,
      status: 'friends',
      requestId: undefined
    });
    setPendingCount(prev => Math.max(0, prev - 1));

    socketService.acceptFriendRequestRealtime({
      requestId,
      senderId,
      receiverId: currentUserId
    });
  }, [currentUserId, updateFriendState]);

  const rejectFriendRequest = useCallback((senderId: string, requestId: string) => {
    if (!currentUserId) return;

    // Optimistic Update
    updateFriendState(senderId, {
      userId: senderId,
      status: 'none',
      requestId: undefined
    });
    setPendingCount(prev => Math.max(0, prev - 1));

    socketService.rejectFriendRequest({
      requestId,
      senderId,
      receiverId: currentUserId
    });
  }, [currentUserId, updateFriendState]);

  const withdrawFriendRequest = useCallback((receiverId: string, requestId: string) => {
    if (!currentUserId) return;

    // Optimistic Update
    updateFriendState(receiverId, {
      userId: receiverId,
      status: 'none',
      requestId: undefined
    });

    socketService.withdrawFriendRequest({
      requestId,
      senderId: currentUserId,
      receiverId
    });
  }, [currentUserId, updateFriendState]);

  const removeFriend = useCallback((friendId: string) => {
    if (!currentUserId) return;

    // Optimistic Update
    updateFriendState(friendId, {
      userId: friendId,
      status: 'none',
      requestId: undefined
    });

    socketService.removeFriend({
      userId: currentUserId,
      friendId
    });
  }, [currentUserId, updateFriendState]);

  const getFriendState = useCallback((userId: string): FriendRequestState => {
    return friendStates.get(userId) || { userId, status: 'none' };
  }, [friendStates]);

  const setInitialFriendState = useCallback((userId: string, state: FriendRequestState) => {
    updateFriendState(userId, state);
  }, [updateFriendState]);

  return {
    friendStates,
    pendingCount,
    getFriendState,
    setInitialFriendState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest,
    removeFriend
  };
}