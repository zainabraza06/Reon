'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiSearch, 
  FiUserPlus, 
  FiUserCheck, 
  FiUserX,
  FiMapPin, 
  FiGlobe, 
  FiUsers,
  FiArrowLeft,
  FiX,
  FiRefreshCw
} from 'react-icons/fi';
import { api } from '@/lib/api';
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { User } from '@/types';
import { socketService } from '@/lib/socket';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import styles from './RecommendationPage.module.css';

interface RecommendedUser {
  _id: string;
  fullName: string;
  username: string;
  profilePic: string;
  location: string;
  nativeLanguage: string;
  mutualFriendsCount: number;
  score: number;
  lastSeen?: string;
}

interface RecommendedFriendsResponse {
  page: number;
  limit: number;
  total: number;
  recommended: RecommendedUser[];
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

interface FriendRequest {
  _id: string;
  sender: string | {
    _id: string;
    fullName: string;
    username: string;
    profilePic: string;
  };
  receiver: string | {
    _id: string;
    fullName: string;
    username: string;
    profilePic: string;
  };
  status: string;
  createdAt: string;
}

interface FriendRequestsResponse {
  requests: FriendRequest[];
  total: number;
}

export default function RecommendedFriendsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [recommendedUsers, setRecommendedUsers] = useState<RecommendedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Use the friend requests hook
  const {
    pendingCount,
    getFriendState,
    setInitialFriendState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest,
    removeFriend
  } = useFriendRequests(currentUser?._id || null);

  // Check user relationships and sync with hook
  const checkUserRelationships = async (users: RecommendedUser[]): Promise<RecommendedUser[]> => {
    try {
      const [friendsResponse, sentRequestsResponse, receivedRequestsResponse] = await Promise.all([
        api.get('/users/friends').catch(() => ({ data: { friends: [] } })),
        api.get<FriendRequestsResponse>('/users/friend-requests/sent').catch(() => ({ data: { requests: [] } })),
        api.get<FriendRequestsResponse>('/users/friend-requests/received').catch(() => ({ data: { requests: [] } }))
      ]);

      const friends = friendsResponse.data?.friends || [];
      const sentRequests = sentRequestsResponse.data?.requests || [];
      const receivedRequests = receivedRequestsResponse.data?.requests || [];

      // Initialize friend states in the hook
      users.forEach(user => {
        let status: 'none' | 'pending-sent' | 'pending-received' | 'friends' = 'none';
        let requestId: string | undefined;

        if (friends.some((friend: User) => friend._id === user._id)) {
          status = 'friends';
        } else {
          const sentRequest = sentRequests.find((req: FriendRequest) => {
            const receiverId = typeof req.receiver === 'object' ? req.receiver._id : req.receiver;
            return receiverId === user._id;
          });
          
          const receivedRequest = receivedRequests.find((req: FriendRequest) => {
            const senderId = typeof req.sender === 'string' ? req.sender : req.sender?._id;
            return senderId === user._id;
          });

          if (sentRequest) {
            status = 'pending-sent';
            requestId = sentRequest._id;
          } else if (receivedRequest) {
            status = 'pending-received';
            requestId = receivedRequest._id;
          }
        }

        setInitialFriendState(user._id, { userId: user._id, status, requestId });
      });

      return users;
    } catch (error) {
      console.error('Error checking relationships:', error);
      return users;
    }
  };

  // Load recommended friends
  const loadRecommendedFriends = useCallback(async (pageNum: number = 1, search: string = '') => {
    try {
      if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const params = {
        page: pageNum,
        limit: 20,
        ...(search && { search })
      };

      const response = await api.get<RecommendedFriendsResponse>('/users/recommendation', { params });
      const data = response.data;

      await checkUserRelationships(data.recommended);

      if (pageNum === 1) {
        setRecommendedUsers(data.recommended);
      } else {
        setRecommendedUsers(prev => [...prev, ...data.recommended]);
      }
      setHasMore(data.recommended.length === 20);
      setPage(pageNum);
    } catch (error: unknown) {
      console.error('Error loading recommended friends:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to load recommended users'
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [addNotification, setInitialFriendState]);

  // Load current user and connect socket
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        let user: User;
        
        if (userData) {
          user = JSON.parse(userData);
          setCurrentUser(user);
        } else {
          const response = await api.get<User>('/users/me');
          user = response.data;
          setCurrentUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        }

        // Connect socket with current user
        if (user._id && user._id !== 'default') {
          setTimeout(() => {
            socketService.connect(user._id);
          }, 1000);
        }

      } catch (error) {
        console.error('Error loading current user:', error);
        const defaultUser = {
          _id: 'default',
          username: 'user',
          profilePic: '',
          fullName: 'User',
          unreadCount: 0,
          onboarded: true
        };
        setCurrentUser(defaultUser);
      }
    };

    loadCurrentUser();
  }, []);

 

  // Initial load
  useEffect(() => {
    loadRecommendedFriends();
  }, [loadRecommendedFriends]);

  // Search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(1);
      loadRecommendedFriends(1, searchQuery);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadRecommendedFriends]);

  // Action handlers
  const handleSendRequest = async (userId: string) => {
    try {
      setActionInProgress(userId);
      const response = await api.post(`/users/friend-request/${userId}`);
      const { requestId } = response.data;

      // Use the hook to update state
      sendFriendRequest(userId, requestId);

      addNotification({
        type: 'success',
        title: 'Request Sent',
        message: 'Friend request sent successfully'
      });
    } catch (error: unknown) {
      console.error('Error sending friend request:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to send friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleWithdrawRequest = async (userId: string) => {
    try {
      setActionInProgress(userId);
      const friendState = getFriendState(userId);
      
      if (!friendState.requestId) throw new Error('Friend request not found');

      await api.post(`/users/friend-request/${friendState.requestId}/withdraw`);

      // Use the hook to update state
      withdrawFriendRequest(userId, friendState.requestId);

      
    } catch (error: unknown) {
      console.error('Error withdrawing friend request:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to withdraw friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAcceptRequest = async (userId: string) => {
    try {
      setActionInProgress(userId);
      const friendState = getFriendState(userId);
      
      if (!friendState.requestId) throw new Error('Friend request not found');

      await api.post(`/users/friend-request/${friendState.requestId}/accept`);

      // Use the hook to update state
      acceptFriendRequest(userId, friendState.requestId);

      addNotification({
        type: 'success',
        title: 'Request Accepted',
        message: 'You are now friends!'
      });
    } catch (error: unknown) {
      console.error('Error accepting friend request:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to accept friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectRequest = async (userId: string) => {
    try {
      setActionInProgress(userId);
      const friendState = getFriendState(userId);
      
      if (!friendState.requestId) throw new Error('Friend request not found');

      await api.delete(`/users/friend-request/${friendState.requestId}`);

      // Hook expects (senderId, requestId)
      rejectFriendRequest(userId, friendState.requestId);

      addNotification({
        type: 'success',
        title: 'Request Rejected',
        message: 'Friend request rejected'
      });
    } catch (error: unknown) {
      console.error('Error rejecting friend request:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to reject friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveFriend = async (userId: string) => {
    try {
      setActionInProgress(userId);
      await api.patch(`/users/friends/${userId}`);

      // Use the hook to update state
      removeFriend(userId);

      addNotification({
        type: 'success',
        title: 'Friend Removed',
        message: 'User removed from friends'
      });
    } catch (error: unknown) {
      console.error('Error removing friend:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to remove friend'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const getActionButtons = (user: RecommendedUser) => {
    const isProcessing = actionInProgress === user._id;
    const friendState = getFriendState(user._id);

    if (friendState.status === 'friends') {
      return (
        <button
          className={`${styles.actionButton} ${styles.removeButton}`}
          onClick={() => handleRemoveFriend(user._id)}
          disabled={isProcessing}
        >
          <FiUserCheck />
          {isProcessing ? 'Removing...' : 'Friends'}
        </button>
      );
    }

    if (friendState.status === 'pending-received') {
      return (
        <div className={styles.dualButtons}>
          <button
            className={`${styles.actionButton} ${styles.acceptButton}`}
            onClick={() => handleAcceptRequest(user._id)}
            disabled={isProcessing}
          >
            <FiUserCheck />
            {isProcessing ? 'Accepting...' : 'Accept'}
          </button>
          <button
            className={`${styles.actionButton} ${styles.rejectButton}`}
            onClick={() => handleRejectRequest(user._id)}
            disabled={isProcessing}
          >
            <FiUserX />
            {isProcessing ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      );
    }

    if (friendState.status === 'pending-sent') {
      return (
        <button
          className={`${styles.actionButton} ${styles.withdrawButton}`}
          onClick={() => handleWithdrawRequest(user._id)}
          disabled={isProcessing}
        >
          <FiUserPlus />
          {isProcessing ? 'Withdrawing...' : 'Request Sent'}
        </button>
      );
    }

    return (
      <button
        className={`${styles.actionButton} ${styles.addButton}`}
        onClick={() => handleSendRequest(user._id)}
        disabled={isProcessing}
      >
        <FiUserPlus />
        {isProcessing ? 'Sending...' : 'Send Request'}
      </button>
    );
  };



  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadRecommendedFriends(page + 1, searchQuery);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 10) return styles.highScore;
    if (score >= 5) return styles.mediumScore;
    return styles.lowScore;
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

 

  return (
    <div className={styles.fullPage}>
      {/* Background elements */}
      <div className={`${styles.blob} ${styles.blobPurple}`}></div>
      <div className={`${styles.blob} ${styles.blobBlue}`}></div>
      <div className={`${styles.blob} ${styles.blobTeal}`}></div>
      
      {/* Floating particles */}
      <div className={styles.particlesContainer} id="particles"></div>

      <div className={styles.container}>
        {/* Header with UserProfile */}
        <div className={styles.headerWithProfile}>
          <div className={styles.headerMain}>
            <button 
              className={styles.backButton}
              onClick={() => router.back()}
              aria-label="Go back"
            >
              <FiArrowLeft />
            </button>
            
            <div className={styles.headerContent}>
              <h1 className={styles.title}>Find Friends</h1>
              <p className={styles.subtitle}>
                Discover people you might know and connect with them
              </p>
            </div>
          </div>

          {/* Integrated UserProfile */}
          <div className={styles.userProfileSection}>
            <UserProfile
              currentUser={currentUser || { 
                _id: 'default',
                username: 'user',
                profilePic: '',
                fullName: 'User',
                unreadCount: 0,
                isOnboarded: true
              }}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
              pendingFriendRequests={pendingCount}
              currentPage="recommendations"
            />
          </div>
        </div>

       

        {/* Centered Search Section */}
        <div className={styles.centeredSearchSection}>
          <div className={styles.centeredSearchContainer}>
            <div className={styles.searchWrapper}>
              <div className={styles.searchIconContainer}>
                <FiSearch className={styles.searchIcon} />
              </div>
              <input
                type="text"
                placeholder="Search by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
              {searchQuery && (
                <button 
                  className={styles.clearSearch}
                  onClick={clearSearch}
                  title="Clear search"
                >
                  <FiX />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className={styles.resultsSection}>
          {isLoading && page === 1 ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner}></div>
              <p>Finding recommended users...</p>
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className={styles.emptyState}>
              <FiUsers className={styles.emptyIcon} />
              <h3>No matches found</h3>
              <p>
                {searchQuery 
                  ? `No users match "${searchQuery}"`
                  : "No recommended users found. Try adjusting your search."
                }
              </p>
            </div>
          ) : (
            <>
              <div className={styles.resultsGrid}>
                {recommendedUsers.map((user) => (
                  <div key={user._id} className={styles.userCard}>
                    <div className={styles.cardHeader}>
                      <div className={styles.userAvatar}>
                        {user.profilePic ? (
                          <img src={user.profilePic} alt={user.fullName} />
                        ) : (
                          <div className={styles.defaultAvatar}>
                            {user.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                    
                      </div>
                      
                      <div className={styles.userInfo}>
                        <h3 className={styles.userName}>{user.fullName}</h3>
                        <p className={styles.username}>@{user.username}</p>
                        
                        <div className={styles.userStatus}>
                         
                        </div>
                        
                        <div className={styles.matchScore}>
                          <span className={`${styles.scoreBadge} ${getScoreColor(user.score)}`}>
                            Match: {user.score} pts
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.userDetails}>
                      {user.location && (
                        <div className={styles.detailItem}>
                          <FiMapPin className={styles.detailIcon} />
                          <span>{user.location}</span>
                        </div>
                      )}
                      
                      {user.nativeLanguage && (
                        <div className={styles.detailItem}>
                          <FiGlobe className={styles.detailIcon} />
                          <span>{user.nativeLanguage}</span>
                        </div>
                      )}
                      
                      {user.mutualFriendsCount > 0 && (
                        <div className={styles.detailItem}>
                          <FiUsers className={styles.detailIcon} />
                          <span>{user.mutualFriendsCount} mutual friends</span>
                        </div>
                      )}
                    </div>

                    <div className={styles.cardActions}>
                      {getActionButtons(user)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className={styles.loadMoreSection}>
                  {isLoadingMore ? (
                    <div className={styles.loadingMore}>
                      <div className={styles.loadingSpinner}></div>
                      <span>Loading more users...</span>
                    </div>
                  ) : (
                    <button
                      className={styles.loadMoreButton}
                      onClick={loadMore}
                    >
                      Load More
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}