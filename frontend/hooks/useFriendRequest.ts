'use client';

import { useEffect, useState, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import {
  FriendRequestState,
  FriendRequestReceivedData,
  FriendRequestSentData,
  FriendRequestAcceptedData,
  FriendRequestWithdrawnData,
  FriendRequestRejectedData,
  FriendRemovedData,
  PendingCountData
} from "@/types";

export function useFriendRequests(currentUserId: string | null) {
  const [friendStates, setFriendStates] = useState<Map<string, FriendRequestState>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

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

  // Initialize socket listeners and fetch initial data
  useEffect(() => {
    if (!currentUserId || !socketService.isConnected()) {
      console.log('Socket not connected or no user ID');
      return;
    }

    console.log('Setting up friend request listeners for user:', currentUserId);

    // Fetch initial pending count
    const fetchInitialData = async () => {
      try {
        const response = await fetch(`/api/friends/requests/pending-count`);
        if (response.ok) {
          const data = await response.json();
          setPendingCount(data.pendingCount);
          console.log('Initial pending count:', data.pendingCount);
        }
      } catch (error) {
        console.error('Failed to fetch pending count:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    fetchInitialData();

    // Event Handlers
    const handleFriendRequestReceived = (data: FriendRequestReceivedData) => {
      console.log('🔔 Friend request received from:', data.sender._id);
      updateFriendState(data.sender._id, {
        userId: data.sender._id,
        status: 'pending-received',
        requestId: data.requestId
      });
      setPendingCount(prev => prev + 1);
    };

    const handleFriendRequestSent = (data: FriendRequestSentData) => {
      console.log('🚀 Friend request sent confirmation for:', data.receiverId);
      updateFriendState(data.receiverId, {
        userId: data.receiverId,
        status: 'pending-sent',
        requestId: data.requestId
      });
    };

    const handleFriendRequestAccepted = (data: FriendRequestAcceptedData) => {
      console.log('🤝 Friend request accepted:', data);
      
      if (data.senderId === currentUserId) {
        // I sent the request
        updateFriendState(data.receiverId, {
          userId: data.receiverId,
          status: 'friends',
          requestId: undefined
        });
      } else if (data.receiverId === currentUserId) {
        // I accepted the request
        updateFriendState(data.senderId, {
          userId: data.senderId,
          status: 'friends',
          requestId: undefined
        });
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    };

    const handleFriendRequestWithdrawn = (data: FriendRequestWithdrawnData) => {
      console.log('↩️ Friend request withdrawn:', data);
      
      const isSender = data.senderId === currentUserId;
      const targetUserId = isSender ? data.receiverId : data.senderId;

      if (targetUserId) {
        updateFriendState(targetUserId, {
          userId: targetUserId,
          status: 'none',
          requestId: undefined
        });
      }

      // If I received the request, decrease count
      if (!isSender) {
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    };

    const handleFriendRequestRejected = (data: FriendRequestRejectedData) => {
      console.log('❌ Friend request rejected:', data);
      
      if (currentUserId === data.senderId) {
        // My request was rejected
        updateFriendState(data.receiverId, {
          userId: data.receiverId,
          status: 'none',
          requestId: undefined
        });
      } else if (currentUserId === data.receiverId) {
        // I rejected a request
        updateFriendState(data.senderId, {
          userId: data.senderId,
          status: 'none',
          requestId: undefined
        });
        setPendingCount(prev => Math.max(0, prev - 1));
      }
    };

    const handleFriendRemoved = (data: FriendRemovedData) => {
      console.log('💔 Friend removed:', data);
      
      if (currentUserId === data.userId) {
        // I removed someone
        updateFriendState(data.friendId, {
          userId: data.friendId,
          status: 'none',
          requestId: undefined
        });
      } else if (currentUserId === data.friendId) {
        // Someone removed me
        updateFriendState(data.userId, {
          userId: data.userId,
          status: 'none',
          requestId: undefined
        });
      }
    };

    const handlePendingCountUpdate = (data: PendingCountData) => {
      console.log('📊 Pending count updated:', data.count);
      setPendingCount(data.count);
    };

    // Register socket listeners using socketService methods
    socketService.onFriendRequestReceived(handleFriendRequestReceived);
    socketService.onFriendRequestSent(handleFriendRequestSent);
    socketService.onFriendRequestAccepted(handleFriendRequestAccepted);
    socketService.onFriendRequestWithdrawn(handleFriendRequestWithdrawn);
    socketService.onFriendRequestRejected(handleFriendRequestRejected);
    socketService.onFriendRemoved(handleFriendRemoved);
    socketService.onPendingRequestsCountUpdated(handlePendingCountUpdate);

    // Cleanup function
    return () => {
      console.log('Cleaning up friend request listeners');
      socketService.removeListener('friend-request-received', handleFriendRequestReceived);
      socketService.removeListener('friend-request-sent-realtime', handleFriendRequestSent);
      socketService.removeListener('friend-request-accepted-realtime', handleFriendRequestAccepted);
      socketService.removeListener('friend-request-withdrawn', handleFriendRequestWithdrawn);
      socketService.removeListener('friend-request-rejected', handleFriendRequestRejected);
      socketService.removeListener('friend-removed', handleFriendRemoved);
      socketService.removeListener('pending-requests-count-updated', handlePendingCountUpdate);
    };
  }, [currentUserId, updateFriendState]);

  // Action Methods
  const sendFriendRequest = useCallback(async (receiverId: string) => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };
    
    try {
      // Optimistic update first
      const tempRequestId = `temp-${Date.now()}`;
      updateFriendState(receiverId, {
        userId: receiverId,
        status: 'pending-sent',
        requestId: tempRequestId
      });

      // API call
      const response = await fetch(`/api/friends/request/send/${receiverId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        // Revert on error
        updateFriendState(receiverId, {
          userId: receiverId,
          status: 'none',
          requestId: undefined
        });
        const error = await response.json();
        return { success: false, error: error.message };
      }

      // Note: Socket event will confirm with actual requestId
      const data = await response.json();
      return { success: true, requestId: data.requestId };
    } catch (error) {
      console.error('Error sending friend request:', error);
      // Revert on network error
      updateFriendState(receiverId, {
        userId: receiverId,
        status: 'none',
        requestId: undefined
      });
      return { success: false, error: 'Failed to send friend request' };
    }
  }, [currentUserId, updateFriendState]);

  const acceptFriendRequest = useCallback(async (requestId: string) => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      // Find which user this request is from
      const friendState = Array.from(friendStates.values()).find(
        state => state.requestId === requestId
      );
      
      if (!friendState) {
        return { success: false, error: 'Request not found' };
      }

      // Optimistic update
      updateFriendState(friendState.userId, {
        status: 'friends',
        requestId: undefined
      });
      setPendingCount(prev => Math.max(0, prev - 1));

      // API call
      const response = await fetch(`/api/friends/request/accept/${requestId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        // Revert on error
        updateFriendState(friendState.userId, {
          status: 'pending-received',
          requestId
        });
        setPendingCount(prev => prev + 1);
        const error = await response.json();
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return { success: false, error: 'Failed to accept friend request' };
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const rejectFriendRequest = useCallback(async (requestId: string) => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      const friendState = Array.from(friendStates.values()).find(
        state => state.requestId === requestId
      );
      
      if (!friendState) {
        return { success: false, error: 'Request not found' };
      }

      // Optimistic update
      updateFriendState(friendState.userId, {
        status: 'none',
        requestId: undefined
      });
      setPendingCount(prev => Math.max(0, prev - 1));

      // API call
      const response = await fetch(`/api/friends/request/reject/${requestId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        // Revert on error
        updateFriendState(friendState.userId, {
          status: 'pending-received',
          requestId
        });
        setPendingCount(prev => prev + 1);
        const error = await response.json();
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      return { success: false, error: 'Failed to reject friend request' };
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const withdrawFriendRequest = useCallback(async (requestId: string) => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      const friendState = Array.from(friendStates.values()).find(
        state => state.requestId === requestId
      );
      
      if (!friendState) {
        return { success: false, error: 'Request not found' };
      }

      // Optimistic update
      updateFriendState(friendState.userId, {
        status: 'none',
        requestId: undefined
      });

      // API call
      const response = await fetch(`/api/friends/request/withdraw/${requestId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Revert on error
        updateFriendState(friendState.userId, {
          status: 'pending-sent',
          requestId
        });
        const error = await response.json();
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error withdrawing friend request:', error);
      return { success: false, error: 'Failed to withdraw friend request' };
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      // Optimistic update
      updateFriendState(friendId, {
        status: 'none',
        requestId: undefined
      });

      // API call
      const response = await fetch(`/api/friends/remove/${friendId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Revert on error
        updateFriendState(friendId, {
          status: 'friends',
          requestId: undefined
        });
        const error = await response.json();
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing friend:', error);
      return { success: false, error: 'Failed to remove friend' };
    }
  }, [currentUserId, updateFriendState]);

  // Helper Methods
  const getFriendState = useCallback((userId: string): FriendRequestState => {
    return friendStates.get(userId) || { userId, status: 'none' };
  }, [friendStates]);

  const setInitialFriendState = useCallback((userId: string, state: FriendRequestState) => {
    updateFriendState(userId, state);
  }, [updateFriendState]);

  const fetchFriendStatus = useCallback(async (userId: string) => {
    if (!currentUserId) return;

    try {
      const response = await fetch(`/api/friends/status/${userId}`);
      if (response.ok) {
        const data = await response.json();
        updateFriendState(userId, {
          userId,
          status: data.status,
          requestId: data.requestId
        });
      }
    } catch (error) {
      console.error('Error fetching friend status:', error);
    }
  }, [currentUserId, updateFriendState]);

  const loadReceivedRequests = useCallback(async () => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch('/api/friends/requests/received');
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }
      const data = await response.json();
      return { success: true, requests: data.requests };
    } catch (error) {
      console.error('Error loading received requests:', error);
      return { success: false, error: 'Failed to load received requests' };
    }
  }, [currentUserId]);

  const loadSentRequests = useCallback(async () => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch('/api/friends/requests/sent');
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }
      const data = await response.json();
      return { success: true, requests: data.requests };
    } catch (error) {
      console.error('Error loading sent requests:', error);
      return { success: false, error: 'Failed to load sent requests' };
    }
  }, [currentUserId]);

  return {
    friendStates,
    pendingCount,
    isInitialized,
    getFriendState,
    setInitialFriendState,
    fetchFriendStatus,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest,
    removeFriend,
    loadReceivedRequests,
    loadSentRequests
  };
}