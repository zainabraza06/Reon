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
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { socketService } from '@/lib/socket';
import { User } from '@/types';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import styles from './RecommendationPage.module.css';

export default function RecommendedFriendsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [actionInProgress, setActionInProgress] = useState<{ userId: string; action: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Use the friend requests hook
  const {
    pendingCount,
    recommendedFriends: recommendedUsers,
    pagination,
    loading,
    getFriendState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest,
    removeFriend,
    loadRecommendedFriends,
    refreshAll
  } = useFriendRequests(currentUser?._id || null);

  // Load current user and initialize socket
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        let user: User;
        
        if (userData) {
          user = JSON.parse(userData);
          setCurrentUser(user);
        } else {
          const response = await fetch('/api/users/me');
          user = await response.json();
          setCurrentUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        }

        // Connect socket with current user
        if (user._id && user._id !== 'default') {
          socketService.connect(user._id);
        }

      } catch (error) {
        console.error('Error loading current user:', error);
        const defaultUser: User = {
          _id: 'default',
          username: 'user',
          profilePic: '',
          fullName: 'User',
          unreadCount: 0,
          isOnboarded: true
        };
        setCurrentUser(defaultUser);
      }
    };

    loadCurrentUser();
  }, []);

  // Initial load and search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const loadData = async () => {
        try {
          await loadRecommendedFriends(searchQuery, 1, 20);
          setPage(1);
          setHasMore(pagination.total > pagination.page * pagination.limit);
        } catch (error) {
          console.error('Error loading recommended friends:', error);
          addNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to load recommendations'
          });
        }
      };
      
      loadData();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadRecommendedFriends, pagination.total, pagination.page, pagination.limit, addNotification]);

  // Load more function
  const handleLoadMore = useCallback(async () => {
    if (!loading.recommended && hasMore && currentUser) {
      try {
        await loadRecommendedFriends(searchQuery, page + 1, 20);
        setPage(prev => prev + 1);
        setHasMore(pagination.total > (page + 1) * pagination.limit);
      } catch (error) {
        console.error('Error loading more friends:', error);
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Failed to load more users'
        });
      }
    }
  }, [loading.recommended, hasMore, currentUser, searchQuery, page, loadRecommendedFriends, pagination.total, pagination.limit, addNotification]);

  // Action handlers using the hook
  const handleSendRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'send' });
      
      const result = await sendFriendRequest(userId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Sent',
          message: 'Friend request sent successfully'
        });
        // Real-time update: Button will change to "Request Sent" via hook
      } else {
        addNotification({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to send friend request'
        });
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to send friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleWithdrawRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'withdraw' });
      const friendState = getFriendState(userId);
      
      if (!friendState.requestId) {
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Friend request not found'
        });
        return;
      }

      const result = await withdrawFriendRequest(friendState.requestId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Withdrawn',
          message: 'Friend request withdrawn successfully'
        });
        // Real-time update: Button will change back to "Send Request"
      } else {
        addNotification({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to withdraw friend request'
        });
      }
    } catch (error) {
      console.error('Error withdrawing friend request:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to withdraw friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAcceptRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'accept' });
      const friendState = getFriendState(userId);
      
      if (!friendState.requestId) {
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Friend request not found'
        });
        return;
      }

      const result = await acceptFriendRequest(friendState.requestId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Accepted',
          message: 'You are now friends!'
        });
        // Real-time update: Button will change to "Friends"
      } else {
        addNotification({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to accept friend request'
        });
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to accept friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'reject' });
      const friendState = getFriendState(userId);
      
      if (!friendState.requestId) {
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Friend request not found'
        });
        return;
      }

      const result = await rejectFriendRequest(friendState.requestId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Rejected',
          message: 'Friend request rejected'
        });
        // Real-time update: Button will change to "Send Request"
      } else {
        addNotification({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to reject friend request'
        });
      }
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to reject friend request'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveFriend = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'remove' });
      
      const result = await removeFriend(userId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Friend Removed',
          message: 'User removed from friends'
        });
        // Real-time update: Button will change to "Removed" temporarily, then "Send Request"
      } else {
        addNotification({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to remove friend'
        });
      }
    } catch (error) {
      console.error('Error removing friend:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to remove friend'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const getActionButtons = (user: User & { mutualFriendsCount: number; score: number; }) => {
    const isSending = actionInProgress?.userId === user._id && actionInProgress?.action === 'send';
    const isWithdrawing = actionInProgress?.userId === user._id && actionInProgress?.action === 'withdraw';
    const isAccepting = actionInProgress?.userId === user._id && actionInProgress?.action === 'accept';
    const isRejecting = actionInProgress?.userId === user._id && actionInProgress?.action === 'reject';
    const isRemoving = actionInProgress?.userId === user._id && actionInProgress?.action === 'remove';
    const friendState = getFriendState(user._id);

    switch (friendState.status) {
      case 'friends':
        return (
          <button
            className={`${styles.actionButton} ${styles.removeButton}`}
            onClick={() => handleRemoveFriend(user._id)}
            disabled={isRemoving || loading.action}
          >
            <FiUserCheck />
            {isRemoving || loading.action ? 'Accepting...' : 'Friends'}
          </button>
        );

      case 'pending-received':
        return (
          <div className={styles.dualButtons}>
            <button
              className={`${styles.actionButton} ${styles.acceptButton}`}
              onClick={() => handleAcceptRequest(user._id)}
              disabled={isAccepting || loading.action}
            >
              <FiUserCheck />
              {isAccepting || loading.action ? 'Accepting...' : 'Accept'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.rejectButton}`}
              onClick={() => handleRejectRequest(user._id)}
              disabled={isRejecting || loading.action}
            >
              <FiUserX />
              {isRejecting || loading.action ? 'Rejecting...' : 'Reject'}
            </button>
          </div>
        );

      case 'pending-sent':
        return (
          <button
            className={`${styles.actionButton} ${styles.withdrawButton}`}
            onClick={() => handleWithdrawRequest(user._id)}
            disabled={isWithdrawing || loading.action}
          >
            <FiUserPlus />
            {isWithdrawing || loading.action ? 'Sending...' : 'Request Sent'}
          </button>
        );

      case 'removed':
        return (
          <button
            className={`${styles.actionButton} ${styles.removedButton}`}
            disabled
          >
            Removed
          </button>
        );

      default: // 'none' status
        return (
          <button
            className={`${styles.actionButton} ${styles.addButton}`}
            onClick={() => handleSendRequest(user._id)}
            disabled={isSending || loading.action}
          >
            <FiUserPlus />
            {isSending || loading.action ? 'Sending...' : 'Send Request'}
          </button>
        );
    }
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

  const getScoreColor = (score: number) => {
    if (score >= 10) return styles.highScore;
    if (score >= 5) return styles.mediumScore;
    return styles.lowScore;
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  
  // Calculate if we should show loading state
  const isLoadingInitial = loading.recommended && recommendedUsers.length === 0;

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
          {isLoadingInitial ? (
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
                {recommendedUsers.map((user) => {
                  // Type assertion to include recommendation properties
                  const recommendedUser = user as User & { 
                    mutualFriendsCount: number; 
                    score: number;
                    friendRequestSent?: boolean;
                    friendRequestReceived?: boolean;
                    isFriend?: boolean;
                  };
                  
                  const friendState = getFriendState(user._id);
                  
                  return (
                    <div key={user._id} className={styles.userCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.userAvatar}>
                          {user.profilePic ? (
                            <img src={user.profilePic} alt={user.fullName} />
                          ) : (
                            <div className={styles.defaultAvatar}>
                              {user.fullName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase() || 'U'}
                            </div>
                          )}
                        </div>
                        
                        <div className={styles.userInfo}>
                          <h3 className={styles.userName}>{user.fullName || 'Anonymous User'}</h3>
                          <p className={styles.username}>@{user.username || 'user'}</p>
                         
                          
                          <div className={styles.matchScore}>
                            {'score' in recommendedUser && (
                              <span className={`${styles.scoreBadge} ${getScoreColor(recommendedUser.score)}`}>
                                Match: {recommendedUser.score} pts
                              </span>
                            )}
                            {'mutualFriendsCount' in recommendedUser && recommendedUser.mutualFriendsCount > 0 && (
                              <span className={styles.mutualBadge}>
                                {recommendedUser.mutualFriendsCount} mutual friends
                              </span>
                            )}
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
                      </div>

                      <div className={styles.cardActions}>
                        {getActionButtons(recommendedUser)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className={styles.loadMoreSection}>
                  {loading.recommended ? (
                    <div className={styles.loadingMore}>
                      <div className={styles.loadingSpinner}></div>
                      <span>Loading more users...</span>
                    </div>
                  ) : (
                    <button
                      className={styles.loadMoreButton}
                      onClick={handleLoadMore}
                      disabled={loading.recommended}
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