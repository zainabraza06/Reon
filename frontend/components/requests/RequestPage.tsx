'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { 
  FiUserPlus, 
  FiUserCheck, 
  FiUserX,
  FiArrowLeft,
  FiMessageCircle,
  FiClock,
  FiSearch,
  FiUsers
} from 'react-icons/fi';
import { useNotification } from '@/context/NotificationContext';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import UserProfile from '@/components/chat/UserProfile';
import styles from './RequestPage.module.css';

type TabType = 'received' | 'sent';

export default function FriendRequestsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use the custom hook
  const {
    friendStates,
    pendingCount,
    isInitialized,
    friendsList,
    recommendedFriends,
    loading,
    
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest,
    removeFriend,
    
    loadFriendsList,
    loadRecommendedFriends,
    loadReceivedRequests: loadReceivedRequestsFromHook,
    loadSentRequests: loadSentRequestsFromHook,
    loadPendingCount,
    refreshAll,
    getFriendState
  } = useFriendRequests(currentUser?._id || null);

  // Filter friend states based on current tab - ONLY show sent and received requests
  const getRequestsForCurrentTab = useCallback(() => {
    const allStates = Array.from(friendStates.values());
    
    if (activeTab === 'received') {
      return allStates.filter(state => state.status === 'pending-received');
    } else {
      return allStates.filter(state => state.status === 'pending-sent');
    }
  }, [friendStates, activeTab]);

  // Load current user data
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setCurrentUser(parsedUser);
        } else {
          const response = await fetch('/api/users/me');
          const user = await response.json();
          setCurrentUser(user);
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

  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      if (!currentUser || !isInitialized) return;
      
      setIsLoading(true);
      try {
        await Promise.all([
          loadReceivedRequestsFromHook(),
          loadSentRequestsFromHook(),
          loadPendingCount()
        ]);
      } catch (error) {
        console.error('Error loading initial data:', error);
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Failed to load friend requests'
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (currentUser) {
      loadInitialData();
    }
  }, [currentUser, isInitialized, loadReceivedRequestsFromHook, loadSentRequestsFromHook, loadPendingCount, addNotification]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle accept request
  const handleAcceptRequest = async (userId: string, requestId?: string) => {
    if (!requestId) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Request ID not found'
      });
      return;
    }

    try {
      setActionInProgress(userId);
      const result = await acceptFriendRequest(requestId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Accepted',
          message: 'You are now friends!'
        });
        
        // Refresh the requests list
        if (activeTab === 'received') {
          await loadReceivedRequestsFromHook();
        }
        await loadPendingCount();
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
    }
    finally {
      setActionInProgress(null);
    }
  };

  // Handle reject request
  const handleRejectRequest = async (userId: string, requestId?: string) => {
    if (!requestId) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Request ID not found'
      });
      return;
    }

    try {
      setActionInProgress(userId);
      const result = await rejectFriendRequest(requestId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Rejected',
          message: 'Friend request rejected'
        });
        
        // Refresh the requests list
        if (activeTab === 'received') {
          await loadReceivedRequestsFromHook();
        }
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
    }
    finally {
      setActionInProgress(null);
    }
  };

  // Handle withdraw request
  const handleWithdrawRequest = async (userId: string, requestId?: string) => {
    if (!requestId) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Request ID not found'
      });
      return;
    }

    try {
      setActionInProgress(userId);
      const result = await withdrawFriendRequest(requestId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Request Withdrawn',
          message: 'Friend request withdrawn successfully'
        });
        
        // Refresh the requests list
        if (activeTab === 'sent') {
          await loadSentRequestsFromHook();
        }
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
    }
    finally {
      setActionInProgress(null);
    }
  };

  // Get user details for a friend state
  const getUserDetails = (userId: string): User | null => {
    // Check in friends list
    const friend = friendsList.find(f => f._id === userId);
    if (friend) return friend;
    
    // Check in recommended friends
    const recommended = recommendedFriends.find(f => f._id === userId);
    if (recommended) return recommended;
    
    // Return minimal user object
    return {
      _id: userId,
      username: 'user',
      profilePic: '',
      fullName: 'Unknown User',
      unreadCount: 0,
      isOnboarded: true
    };
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Recently';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // Filter requests based on search - only show pending-sent or pending-received
  const filteredRequests = getRequestsForCurrentTab().filter(state => {
    const user = getUserDetails(state.userId);
    const matchesSearch = user?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user?.username?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Only include if it's either pending-sent or pending-received
    const isCorrectStatus = activeTab === 'received' 
      ? state.status === 'pending-received'
      : state.status === 'pending-sent';
      
    return matchesSearch && isCorrectStatus;
  });

  const hasRequests = filteredRequests.length > 0;

  // Get action buttons based on state - only for pending requests
  const getActionButtons = (state: { userId: string; status: string; requestId?: string }) => {
    const isProcessing = actionInProgress === state.userId;
    
    if (state.status === 'pending-received') {
      return (
        <div className={styles.dualButtons}>
            <button
              className={`${styles.actionButton} ${styles.acceptButton}`}
              onClick={() => handleAcceptRequest(state.userId, state.requestId)}
              disabled={isProcessing}
            >
              <FiUserCheck />
              {isProcessing ? 'Accepting...' : 'Accept'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.rejectButton}`}
              onClick={() => handleRejectRequest(state.userId, state.requestId)}
              disabled={isProcessing}
            >
              <FiUserX />
              {isProcessing ? 'Rejecting...' : 'Reject'}
            </button>
        </div>
      );
    } else if (state.status === 'pending-sent') {
      return (
        <button
          className={`${styles.actionButton} ${styles.withdrawButton}`}
          onClick={() => handleWithdrawRequest(state.userId, state.requestId)}
            disabled={isProcessing}
        >
          <FiUserX />
          {isProcessing ? 'Withdrawing...' : 'Withdraw Request'}
        </button>
      );
    }
    
    return null;
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
              <h1 className={styles.title}>Friend Requests</h1>
              <p className={styles.subtitle}>
                Manage your incoming and outgoing friend requests
                {pendingCount > 0 && ` • ${pendingCount} pending`}
              </p>
            </div>
          </div>

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
              currentPage="my-requests"
            />
          </div>
        </div>

        <div className={styles.tabsContainer}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'received' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('received')}
            >
              <FiUserPlus />
              Received
              <span className={styles.tabBadge}>
                {getRequestsForCurrentTab().filter(s => s.status === 'pending-received').length}
              </span>
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'sent' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('sent')}
            >
              <FiUserCheck />
              Sent
              <span className={styles.tabBadge}>
                {getRequestsForCurrentTab().filter(s => s.status === 'pending-sent').length}
              </span>
            </button>
           
          </div>
        </div>
        
        {hasRequests && (
          <div className={styles.searchSection}>
            <div className={styles.searchWrapper}>
              <FiSearch className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        )}

        <div className={styles.resultsSection}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner}></div>
              <p>Loading friend requests...</p>
            </div>
          ) : !hasRequests ? (
            <div className={styles.emptyState}>
              {activeTab === 'received' ? (
                <>
                  <FiUserPlus className={styles.emptyIcon} />
                  <h3>No incoming requests</h3>
                  <p>
                    {searchQuery 
                      ? `No requests match "${searchQuery}"`
                      : "You don't have any pending friend requests"
                    }
                  </p>
                </>
              ) : (
                <>
                  <FiUserCheck className={styles.emptyIcon} />
                  <h3>No sent requests</h3>
                  <p>
                    {searchQuery 
                      ? `No requests match "${searchQuery}"`
                      : "You haven't sent any friend requests yet"
                    }
                  </p>
                  
                </>
              )}
            </div>
          ) : (
            <div className={styles.requestsList}>
              {filteredRequests.map((state) => {
                const user = getUserDetails(state.userId);
                if (!user) return null;

                return (
                  <div key={state.userId} className={styles.requestCard}>
                    <div className={styles.requestHeader}>
                      <div className={styles.userInfo}>
                        <div className={styles.avatarWrapper}>
                          {user.profilePic ? (
                            <img 
                              src={user.profilePic} 
                              alt={user.fullName}
                              className={styles.avatar}
                            />
                          ) : (
                            <div className={styles.avatarPlaceholder}>
                              {user.fullName?.charAt(0) || user.username?.charAt(0) || 'U'}
                            </div>
                          )}
                        </div>
                        <div className={styles.userDetails}>
                          <h4 className={styles.userName}>
                            {user.fullName || 'Unknown User'}
                          </h4>
                          <p className={styles.userUsername}>
                            @{user.username || 'user'}
                          </p>
                        
                        </div>
                      </div>
                    </div>
                    
                    <div className={styles.requestActions}>
                      {getActionButtons(state)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}