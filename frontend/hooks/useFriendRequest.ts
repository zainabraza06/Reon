'use client';

import { useEffect, useState, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { AxiosError } from 'axios';
import { User, FriendRequest } from '@/types';

export type FriendStatus = 'none' | 'friends' | 'pending-sent' | 'pending-received' | 'removed';

export interface FriendRequestState {
  userId: string;
  status: FriendStatus;
  requestId?: string;
}

export interface RecommendedFriend extends User {
  mutualFriendsCount: number;
  score: number;
  friendRequestSent: boolean;
  friendRequestReceived: boolean;
  isFriend: boolean;
  locationBonus?: number;
  languageBonus?: number;
}

export interface PendingCountResponse {
  pendingCount: number;
}

export interface RecommendedFriendsResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  recommended: RecommendedFriend[];
}

export interface FriendsListResponse {
  page: number;
  limit: number;
  total: number;
  friends: User[];
}

export interface FriendRequestsResponse {
  total: number;
  requests: FriendRequest[];
}

export interface SendRequestResponse {
  message: string;
  requestId: string;
}

export interface AcceptRequestResponse {
  message: string;
}

export interface WithdrawRequestResponse {
  message: string;
}

export interface RejectRequestResponse {
  message: string;
}

export interface RemoveFriendResponse {
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface SocketFriendRequestReceivedData {
  requestId: string;
  sender: User;
  timestamp: string;
}

interface SocketFriendRequestSentData {
  senderId: string;
  receiverId: string;
  requestId: string;
  timestamp: string;
}

interface SocketFriendRequestAcceptedData {
  requestId: string;
  senderId: string;
  receiverId: string;
  receiver: User;
  timestamp: string;
}

interface SocketFriendRequestWithdrawnData {
  requestId: string;
  senderId: string;
  receiverId: string;
}

interface SocketFriendRequestRejectedData {
  requestId: string;
  senderId: string;
  receiverId: string;
  timestamp: string;
}

interface SocketFriendRemovedData {
  userId: string;
  friendId: string;
  timestamp: string;
}

interface SocketPendingCountData {
  count: number;
}

interface ApiErrorResponse {
  message: string;
  error?: string;
  success?: boolean;
}

export function useFriendRequests(currentUserId: string | null) {
  const [friendStates, setFriendStates] = useState<Map<string, FriendRequestState>>(new Map());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [friendsList, setFriendsList] = useState<User[]>([]);
  const [recommendedFriends, setRecommendedFriends] = useState<RecommendedFriend[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0
  });
  
  const [loading, setLoading] = useState({
    friends: false,
    recommended: false,
    sentRequests: false,
    receivedRequests: false,
    action: false
  });

  const updateFriendState = useCallback((userId: string, updates: Partial<FriendRequestState>) => {
    setFriendStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(userId) || { userId, status: 'none' };
      newMap.set(userId, { ...current, ...updates });
      return newMap;
    });
  }, []);

  const temporarilyRemove = useCallback((userId: string) => {
    updateFriendState(userId, {
      userId,
      status: 'removed',
      requestId: undefined
    });

    const timeoutId = setTimeout(() => {
      updateFriendState(userId, {
        userId,
        status: 'none',
        requestId: undefined
      });
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [updateFriendState]);

  const loadFriendsList = useCallback(async (search = "", page = 1, limit = 10): Promise<ApiResponse<FriendsListResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    setLoading(prev => ({ ...prev, friends: true }));
    try {
      const response = await api.get<FriendsListResponse>('/users/friends', {
        params: { search, page, limit }
      });
      
      const data: FriendsListResponse = response.data;
      
      setFriendsList(data.friends);
      setPagination({
        page: data.page,
        limit: data.limit,
        total: data.total
      });
      
      data.friends.forEach((friend: User) => {
        updateFriendState(friend._id, {
          userId: friend._id,
          status: 'friends',
          requestId: undefined
        });
      });
      
      return { success: true, data };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to load friends';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, friends: false }));
    }
  }, [currentUserId, updateFriendState]);

  const loadRecommendedFriends = useCallback(async (search = "", page = 1, limit = 10): Promise<ApiResponse<RecommendedFriendsResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    setLoading(prev => ({ ...prev, recommended: true }));
    try {
      const response = await api.get<RecommendedFriendsResponse>('/users/recommendation', {
        params: { search, page, limit }
      });
      
      const data: RecommendedFriendsResponse = response.data;
      
      setRecommendedFriends(data.recommended);
      setPagination({
        page: data.page,
        limit: data.limit,
        total: data.total
      });
      
      // Load sent and received requests to get requestIds
      const sentRequestsMap = new Map<string, string>();
      const receivedRequestsMap = new Map<string, string>();
      
      try {
        const [sentResponse, receivedResponse] = await Promise.all([
          api.get<FriendRequestsResponse>('/users/friend-requests/sent'),
          api.get<FriendRequestsResponse>('/users/friend-requests/received')
        ]);
        
        sentResponse.data.requests.forEach((request: FriendRequest) => {
          sentRequestsMap.set(request.receiver._id, request._id);
        });
        
        receivedResponse.data.requests.forEach((request: FriendRequest) => {
          receivedRequestsMap.set(request.sender._id, request._id);
        });
      } catch (err) {
        console.warn('Failed to load requests for syncing:', err);
      }
      
      // Update friend states with proper priority
      setFriendStates(prev => {
        const newMap = new Map(prev);
        
        data.recommended.forEach((friend: RecommendedFriend) => {
          const currentState = prev.get(friend._id);
          let status: FriendStatus = 'none';
          let requestId: string | undefined = undefined;
          
          // Priority: received > sent > friends > none
          // If user received a request from this friend, show Accept/Reject
          if (friend.friendRequestReceived) {
            status = 'pending-received';
            requestId = receivedRequestsMap.get(friend._id) || currentState?.requestId;
          }
          // If user sent a request to this friend, show Request Sent/Withdraw (only if not received)
          else if (friend.friendRequestSent && currentState?.status !== 'pending-received') {
            status = 'pending-sent';
            requestId = sentRequestsMap.get(friend._id) || currentState?.requestId;
          }
          // If already friends (preserve if already set)
          else if (friend.isFriend || currentState?.status === 'friends') {
            status = 'friends';
          }
          // Preserve existing status if it's a valid state and higher priority
          else if (currentState?.status && currentState.status !== 'none') {
            status = currentState.status;
            requestId = currentState.requestId;
          }
          // Otherwise, show Send Request
          else {
            status = 'none';
          }

          newMap.set(friend._id, {
            userId: friend._id,
            status,
            requestId
          });
        });
        
        return newMap;
      });
      
      return { success: true, data };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to load recommended friends';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, recommended: false }));
    }
  }, [currentUserId, updateFriendState]);

  const loadReceivedRequests = useCallback(async (): Promise<ApiResponse<FriendRequestsResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    setLoading(prev => ({ ...prev, receivedRequests: true }));
    try {
      const response = await api.get<FriendRequestsResponse>('/users/friend-requests/received');
      
      const data: FriendRequestsResponse = response.data;
      
      data.requests.forEach((request: FriendRequest) => {
        updateFriendState(request.sender._id, {
          userId: request.sender._id,
          status: 'pending-received',
          requestId: request._id
        });

        // Keep the recommended list entry visible and mark as received
        setRecommendedFriends(prev => prev.map(f => f._id === request.sender._id ? ({ ...f, friendRequestReceived: true }) : f));
      });
      
      return { success: true, data };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to load received requests';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, receivedRequests: false }));
    }
  }, [currentUserId, updateFriendState]);

  const loadSentRequests = useCallback(async (): Promise<ApiResponse<FriendRequestsResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    setLoading(prev => ({ ...prev, sentRequests: true }));
    try {
      const response = await api.get<FriendRequestsResponse>('/users/friend-requests/sent');
      
      const data: FriendRequestsResponse = response.data;
      
      data.requests.forEach((request: FriendRequest) => {
        updateFriendState(request.receiver._id, {
          userId: request.receiver._id,
          status: 'pending-sent',
          requestId: request._id
        });

        // Keep the recommended list entry visible and mark as sent
        setRecommendedFriends(prev => prev.map(f => f._id === request.receiver._id ? ({ ...f, friendRequestSent: true }) : f));
      });
      
      return { success: true, data };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to load sent requests';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, sentRequests: false }));
    }
  }, [currentUserId, updateFriendState]);

  const loadPendingCount = useCallback(async (): Promise<ApiResponse<PendingCountResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    try {
      const response = await api.get<PendingCountResponse>('/users/friend-request/pending-count');
      const data: PendingCountResponse = response.data;
      setPendingCount(data.pendingCount);
      return { success: true, data };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to load pending count';
      return { success: false, error: errorMessage };
    }
  }, [currentUserId]);

  const sendFriendRequest = useCallback(async (receiverId: string): Promise<ApiResponse<SendRequestResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };
    
    const currentState = friendStates.get(receiverId);
    if (currentState?.status === 'removed') {
      return { success: false, error: 'Please wait before sending a new request' };
    }
    
    setLoading(prev => ({ ...prev, action: true }));
    try {
      const tempRequestId = `temp-${Date.now()}`;
      updateFriendState(receiverId, {
        userId: receiverId,
        status: 'pending-sent',
        requestId: tempRequestId
      });

      // Update recommended entry to reflect pending-sent (do not remove it)
      setRecommendedFriends(prev => prev.map(f => f._id === receiverId ? ({ ...f, friendRequestSent: true }) : f));

      const response = await api.post<SendRequestResponse>(`/users/friend-request/${receiverId}`);
      const data: SendRequestResponse = response.data;
      
      updateFriendState(receiverId, {
        userId: receiverId,
        status: 'pending-sent',
        requestId: data.requestId
      });

      // Persist the sent flag on the recommended list (keeps user visible like Instagram)
      setRecommendedFriends(prev => prev.map(f => f._id === receiverId ? ({ ...f, friendRequestSent: true }) : f));

      return { success: true, data };
    } catch (error: unknown) {
      updateFriendState(receiverId, {
        userId: receiverId,
        status: 'none',
        requestId: undefined
      });
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to send friend request';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const acceptFriendRequest = useCallback(async (requestId: string): Promise<ApiResponse<AcceptRequestResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    const friendState = Array.from(friendStates.values()).find(
      state => state.requestId === requestId
    );
    
    if (!friendState) {
      return { success: false, error: 'Request not found' };
    }

    setLoading(prev => ({ ...prev, action: true }));
    try {
      updateFriendState(friendState.userId, {
        status: 'friends',
        requestId: undefined
      });
      setPendingCount(prev => Math.max(0, prev - 1));

      const response = await api.post<AcceptRequestResponse>(`/users/friend-request/${requestId}/accept`);
      const data: AcceptRequestResponse = response.data;
      
      setFriendsList(prev => {
        const exists = prev.some(friend => friend._id === friendState.userId);
        if (exists) return prev;
        
        const newFriend: User = {
          _id: friendState.userId,
          fullName: '',
          username: '',
          profilePic: '',
          unreadCount:0
        };
        return [...prev, newFriend];
      });

      // Keep the user visible but mark as friend so UI shows message/remove
      setRecommendedFriends(prev => prev.map(friend => friend._id === friendState.userId ? ({ ...friend, isFriend: true, friendRequestSent: false, friendRequestReceived: false }) : friend));

      return { success: true, data };
    } catch (error: unknown) {
      updateFriendState(friendState.userId, {
        status: 'pending-received',
        requestId: requestId
      });
      setPendingCount(prev => prev + 1);
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to accept friend request';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const rejectFriendRequest = useCallback(async (requestId: string): Promise<ApiResponse<RejectRequestResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    const friendState = Array.from(friendStates.values()).find(
      state => state.requestId === requestId
    );
    
    if (!friendState) {
      return { success: false, error: 'Request not found' };
    }

    setLoading(prev => ({ ...prev, action: true }));
    try {
      updateFriendState(friendState.userId, {
        status: 'none',
        requestId: undefined
      });
      // Ensure recommended list shows request as cleared but keep user visible
      setRecommendedFriends(prev => prev.map(f => f._id === friendState.userId ? ({ ...f, friendRequestReceived: false }) : f));
      setPendingCount(prev => Math.max(0, prev - 1));

      const response = await api.delete<RejectRequestResponse>(`/users/friend-request/${requestId}`);
      const data: RejectRequestResponse = response.data;

      return { success: true, data };
    } catch (error: unknown) {
      updateFriendState(friendState.userId, {
        status: 'pending-received',
        requestId: requestId
      });
      setPendingCount(prev => prev + 1);
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to reject friend request';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const withdrawFriendRequest = useCallback(async (requestId: string): Promise<ApiResponse<WithdrawRequestResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    const friendState = Array.from(friendStates.values()).find(
      state => state.requestId === requestId
    );
    
    if (!friendState) {
      return { success: false, error: 'Request not found' };
    }

    setLoading(prev => ({ ...prev, action: true }));
    try {

      updateFriendState(friendState.userId, {
        status: 'none',
        requestId: undefined
      });
      // Keep user visible and clear sent flag
      setRecommendedFriends(prev => prev.map(f => f._id === friendState.userId ? ({ ...f, friendRequestSent: false }) : f));

      const response = await api.post<WithdrawRequestResponse>(`/users/friend-request/${requestId}/withdraw`);
      const data: WithdrawRequestResponse = response.data;

      return { success: true, data };
    } catch (error: unknown) {
      updateFriendState(friendState.userId, {
        status: 'pending-sent',
        requestId: requestId
      });
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to withdraw friend request';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  }, [currentUserId, friendStates, updateFriendState]);

  const removeFriend = useCallback(async (friendId: string): Promise<ApiResponse<RemoveFriendResponse>> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };

    setLoading(prev => ({ ...prev, action: true }));
    try {
      temporarilyRemove(friendId);
      setFriendsList(prev => prev.filter(friend => friend._id !== friendId));

      const response = await api.patch<RemoveFriendResponse>(`/users/friends/${friendId}`);
      const data: RemoveFriendResponse = response.data;

      return { success: true, data };
    } catch (error: unknown) {
      const friendToRestore = friendsList.find(friend => friend._id === friendId);
      if (friendToRestore) {
        updateFriendState(friendId, {
          status: 'friends',
          requestId: undefined
        });
        setFriendsList(prev => [...prev, friendToRestore]);
      }
      
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to remove friend';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  }, [currentUserId, updateFriendState, temporarilyRemove, friendsList]);

  const initializeData = useCallback(async (): Promise<void> => {
    if (!currentUserId) return;

    try {
      setIsInitialized(false);
      await Promise.all([
        loadPendingCount(),
        loadFriendsList(),
        loadRecommendedFriends(),
        loadReceivedRequests(),
        loadSentRequests()
      ]);
    } catch (error: unknown) {
      console.error('Failed to initialize friend data:', error);
    } finally {
      setIsInitialized(true);
    }
  }, [currentUserId, loadPendingCount, loadFriendsList, loadRecommendedFriends, loadReceivedRequests, loadSentRequests]);

  useEffect(() => {
    if (!currentUserId) return;

    initializeData();

    const handleFriendRequestReceived = (data: SocketFriendRequestReceivedData) => {
      // Always set to pending-received when a request is received (highest priority)
      updateFriendState(data.sender._id, {
        userId: data.sender._id,
        status: 'pending-received',
        requestId: data.requestId
      });
      setPendingCount(prev => prev + 1);
      // Mark recommended entry as having a received request (keep visible)
      setRecommendedFriends(prev => prev.map(f => f._id === data.sender._id ? ({ ...f, friendRequestReceived: true, friendRequestSent: false }) : f));
    };

    const handleFriendRequestSent = (data: SocketFriendRequestSentData) => {
      // Only set to pending-sent if not already pending-received (received has priority)
      setFriendStates(prev => {
        const currentState = prev.get(data.receiverId);
        if (currentState?.status !== 'pending-received' && currentState?.status !== 'friends') {
          const newMap = new Map(prev);
          newMap.set(data.receiverId, {
            userId: data.receiverId,
            status: 'pending-sent',
            requestId: data.requestId
          });
          return newMap;
        }
        return prev;
      });
      // Mark recommended entry as sent (do not remove it)
      setRecommendedFriends(prev => prev.map(f => f._id === data.receiverId ? ({ ...f, friendRequestSent: true, friendRequestReceived: false }) : f));
    };

    const handleFriendRequestAccepted = (data: SocketFriendRequestAcceptedData) => {
      if (data.senderId === currentUserId) {
        updateFriendState(data.receiverId, {
          userId: data.receiverId,
          status: 'friends',
          requestId: undefined
        });
        
        const newFriend: User = {
          _id: data.receiver._id,
          fullName: data.receiver.fullName || '',
          username: data.receiver.username || '',
          profilePic: data.receiver.profilePic || '',
          unreadCount:0
        };
        
        setFriendsList(prev => {
          const exists = prev.some(friend => friend._id === data.receiverId);
          if (exists) return prev;
          return [...prev, newFriend];
        });

        // Mark recommended entry as a friend instead of removing
        setRecommendedFriends(prev => prev.map(f => f._id === data.receiverId ? ({ ...f, isFriend: true, friendRequestSent: false, friendRequestReceived: false }) : f));
      } else if (data.receiverId === currentUserId) {
        updateFriendState(data.senderId, {
          userId: data.senderId,
          status: 'friends',
          requestId: undefined
        });
        setPendingCount(prev => Math.max(0, prev - 1));
        
        const newFriend: User = {
          _id: data.senderId,
          fullName: '',
          username: '',
          profilePic: '',
          unreadCount:0
        };
        
        setFriendsList(prev => {
          const exists = prev.some(friend => friend._id === data.senderId);
          if (exists) return prev;
          return [...prev, newFriend];
        });

        // Mark recommended entry as a friend and clear any request flags
        setRecommendedFriends(prev => prev.map(f => f._id === data.senderId ? ({ ...f, isFriend: true, friendRequestSent: false, friendRequestReceived: false }) : f));
      }
    };

    const handleFriendRequestWithdrawn = (data: SocketFriendRequestWithdrawnData) => {
      const isSender = data.senderId === currentUserId;
      const targetUserId = isSender ? data.receiverId : data.senderId;

      if (targetUserId) {
        updateFriendState(targetUserId, {
          userId: targetUserId,
          status: 'none',
          requestId: undefined
        });
      }

      if (!isSender) {
        setPendingCount(prev => Math.max(0, prev - 1));
      }
      // Clear sent/received flags on recommended list but keep user visible
      if (targetUserId) {
        setRecommendedFriends(prev => prev.map(f => f._id === targetUserId ? ({ ...f, friendRequestSent: false, friendRequestReceived: false }) : f));
      }
    };

    const handleFriendRequestRejected = (data: SocketFriendRequestRejectedData) => {
      if (currentUserId === data.senderId) {
        updateFriendState(data.receiverId, {
          userId: data.receiverId,
          status: 'none',
          requestId: undefined
        });
      } else if (currentUserId === data.receiverId) {
        updateFriendState(data.senderId, {
          userId: data.senderId,
          status: 'none',
          requestId: undefined
        });
        setPendingCount(prev => Math.max(0, prev - 1));
      }
      // Ensure recommended list entries reflect cleared request state
      setRecommendedFriends(prev => prev.map(f => {
        if (f._id === data.receiverId) return { ...f, friendRequestSent: false };
        if (f._id === data.senderId) return { ...f, friendRequestReceived: false };
        return f;
      }));
    };

    const handleFriendRemoved = (data: SocketFriendRemovedData) => {
      if (currentUserId === data.userId) {
        temporarilyRemove(data.friendId);
        setFriendsList(prev => prev.filter(friend => friend._id !== data.friendId));
      } else if (currentUserId === data.friendId) {
        temporarilyRemove(data.userId);
        setFriendsList(prev => prev.filter(friend => friend._id !== data.userId));
      }
      // Mark recommended entry as not-friend (but keep visible)
      setRecommendedFriends(prev => prev.map(f => {
        if (f._id === data.friendId) return { ...f, isFriend: false };
        if (f._id === data.userId) return { ...f, isFriend: false };
        return f;
      }));
    };

    const handlePendingCountUpdate = (data: SocketPendingCountData) => {
      setPendingCount(data.count);
    };

    socketService.on('friend-request-received', handleFriendRequestReceived);
    socketService.on('friend-request-sent-realtime', handleFriendRequestSent);
    socketService.on('friend-request-accepted-realtime', handleFriendRequestAccepted);
    socketService.on('friend-request-withdrawn', handleFriendRequestWithdrawn);
    socketService.on('friend-request-rejected', handleFriendRequestRejected);
    socketService.on('friend-removed', handleFriendRemoved);
    socketService.on('pending-requests-count-updated', handlePendingCountUpdate);

    return () => {
      socketService.off('friend-request-received', handleFriendRequestReceived);
      socketService.off('friend-request-sent-realtime', handleFriendRequestSent);
      socketService.off('friend-request-accepted-realtime', handleFriendRequestAccepted);
      socketService.off('friend-request-withdrawn', handleFriendRequestWithdrawn);
      socketService.off('friend-request-rejected', handleFriendRequestRejected);
      socketService.off('friend-removed', handleFriendRemoved);
      socketService.off('pending-requests-count-updated', handlePendingCountUpdate);
    };
  }, [currentUserId, updateFriendState, temporarilyRemove, initializeData]);

  const getFriendState = useCallback((userId: string): FriendRequestState => {
    return friendStates.get(userId) || { userId, status: 'none' };
  }, [friendStates]);

  const refreshAll = useCallback(async (): Promise<ApiResponse> => {
    if (!currentUserId) return { success: false, error: 'Not authenticated' };
    
    try {
      await initializeData();
      return { success: true };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'Failed to refresh data';
      return { success: false, error: errorMessage };
    }
  }, [currentUserId, initializeData]);

  return {
    friendStates,
    pendingCount,
    isInitialized,
    friendsList,
    recommendedFriends,
    pagination,
    loading,
    
    getFriendState,
    
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest,
    removeFriend,
    
    loadFriendsList,
    loadRecommendedFriends,
    loadReceivedRequests,
    loadSentRequests,
    loadPendingCount,
    refreshAll
  };
}