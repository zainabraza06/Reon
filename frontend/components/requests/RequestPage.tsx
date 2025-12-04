
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { User, FriendRequest } from '@/types';
import { 
  FiUserPlus, 
  FiUserCheck, 
  FiUserX,
  FiArrowLeft,
  FiMessageCircle,
  FiClock,
  FiSearch
} from 'react-icons/fi';
import { api } from '@/lib/api';
import UserProfile from '@/components/chat/UserProfile';
import { useNotification } from '@/context/NotificationContext';
import { 
  socketService, 
  FriendRequestReceivedData,
  FriendRequestAcceptedData,
  FriendRequestWithdrawnData
} from '@/lib/socket';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import styles from './RequestPage.module.css';

interface RequestsResponse {
  total: number;
  requests: FriendRequest[];
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

type TabType = 'received' | 'sent';

export default function FriendRequestsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // UserProfile states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Initialize hook
  const {
    pendingCount,
    setInitialFriendState,
    acceptFriendRequest,
    rejectFriendRequest,
    withdrawFriendRequest
  } = useFriendRequests(currentUser?._id || null);

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

  // Socket listeners for Real-time List Updates
  useEffect(() => {
    if (!currentUser) return;

    // 1. New Request Received
    const handleFriendRequestReceived = (data: FriendRequestReceivedData) => {
      console.log('🔔 [Page] New friend request received:', data);
      
      // Update hook state
      setInitialFriendState(data.sender._id, {
        userId: data.sender._id,
        status: 'pending-received',
        requestId: data.requestId
      });

      // Update List
      const newRequest: FriendRequest = {
        _id: data.requestId,
        sender: {
          _id: data.sender._id,
          fullName: data.sender.fullName,
          username: data.sender.username,
          profilePic: data.sender.profilePic,
          unreadCount: 0,
          isOnboarded: true
        },
        receiver: currentUser, 
        status: 'pending',
        createdAt: data.timestamp || new Date().toISOString()
      };

      setReceivedRequests(prev => {
        if (prev.some(req => req._id === newRequest._id)) return prev;
        return [newRequest, ...prev];
      });
    };

    // 2. Request Accepted
    const handleFriendRequestAccepted = (data: FriendRequestAcceptedData) => {
      console.log('🤝 [Page] Request Accepted Event:', data);
      
      // Remove from Received List (If I accepted it)
      if (data.receiverId === currentUser._id) {
        setReceivedRequests(prev => prev.filter(req => req._id !== data.requestId));
      }
      
      // Remove from Sent List (If they accepted my request)
      if (data.senderId === currentUser._id) {
        setSentRequests(prev => prev.filter(req => req._id !== data.requestId));
      }
    };

    // 3. Request Withdrawn
    const handleFriendRequestWithdrawn = (data: FriendRequestWithdrawnData) => {
      console.log('↩️ [Page] Request Withdrawn Event:', data);
      // Remove from both lists to be safe
      setReceivedRequests(prev => prev.filter(req => req._id !== data.requestId));
      setSentRequests(prev => prev.filter(req => req._id !== data.requestId));
    };

    // 4. Request Rejected
    const handleFriendRequestRejected = (data: FriendRequestWithdrawnData) => {
      console.log('❌ [Page] Request Rejected Event:', data);
      // Remove from both lists
      setReceivedRequests(prev => prev.filter(req => req._id !== data.requestId));
      setSentRequests(prev => prev.filter(req => req._id !== data.requestId));
    };

    // Register Listeners
    socketService.onFriendRequestReceived(handleFriendRequestReceived);
    socketService.onFriendRequestAcceptedRealtime(handleFriendRequestAccepted);
    socketService.onFriendRequestWithdrawn(handleFriendRequestWithdrawn);
    socketService.onFriendRequestRejected(handleFriendRequestRejected);

    return () => {
      socketService.removeListener('friend-request-received', handleFriendRequestReceived);
      socketService.removeListener('friend-request-accepted-realtime', handleFriendRequestAccepted);
      socketService.removeListener('friend-request-withdrawn', handleFriendRequestWithdrawn);
      socketService.removeListener('friend-request-rejected', handleFriendRequestRejected);
    };
  }, [currentUser, setInitialFriendState]);

  // Load current user data
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setCurrentUser(parsedUser);
          await loadUserStats();
        } else {
          const response = await api.get<User>('/users/me');
          setCurrentUser(response.data);
          await loadUserStats();
        }
      } catch (error) {
        console.error('Error loading current user:', error);
        setCurrentUser({
          _id: 'default',
          username: 'user',
          profilePic: '',
          fullName: 'User',
          unreadCount: 0,
        });
      }
    };

    loadCurrentUser();
  }, []);

  // Load user statistics
  const loadUserStats = async () => {
   
  };

  // Load received requests
  const loadReceivedRequests = useCallback(async () => {
    try {
      const response = await api.get<RequestsResponse>('/users/friend-requests/received');
      setReceivedRequests(response.data.requests);
      
      // Sync with hook state
      response.data.requests.forEach(req => {
        const senderId = typeof req.sender === 'string' ? req.sender : req.sender._id;
        setInitialFriendState(senderId, {
          userId: senderId,
          status: 'pending-received',
          requestId: req._id
        });
      });
    } catch (error: unknown) {
      console.error('Error loading received requests:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to load received requests'
      });
    }
  }, [addNotification, setInitialFriendState]);

  // Load sent requests
  const loadSentRequests = useCallback(async () => {
    try {
      const response = await api.get<RequestsResponse>('/users/friend-requests/sent');
      setSentRequests(response.data.requests);

      // Sync with hook state
      response.data.requests.forEach(req => {
        const receiverId = typeof req.receiver === 'string' ? req.receiver : req.receiver._id;
        setInitialFriendState(receiverId, {
          userId: receiverId,
          status: 'pending-sent',
          requestId: req._id
        });
      });
    } catch (error: unknown) {
      console.error('Error loading sent requests:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to load sent requests'
      });
    }
  }, [addNotification, setInitialFriendState]);

  // Load all requests
  const loadAllRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadReceivedRequests(), loadSentRequests()]);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadReceivedRequests, loadSentRequests]);

  // Initial load
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadAllRequests();
    }
  }, [loadAllRequests]);

  // Handlers
  const handleAcceptRequest = async (requestId: string, userId: string) => {
    try {
      setActionInProgress(requestId);
      
      await api.post(`/users/friend-request/${requestId}/accept`);
      
      // Update Hook State (for Badge)
      acceptFriendRequest(userId, requestId);

      // Update Local List immediately
      setReceivedRequests(prev => prev.filter(req => req._id !== requestId));
      
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

  const handleRejectRequest = async (requestId: string, userId: string) => {
    try {
      setActionInProgress(requestId);
      
      await api.delete(`/users/friend-request/${requestId}`);
      
      // Update Hook State
      rejectFriendRequest(userId, requestId);

      // Update Local List immediately
      setReceivedRequests(prev => prev.filter(req => req._id !== requestId));
      
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

  const handleWithdrawRequest = async (requestId: string, userId: string) => {
    try {
      setActionInProgress(requestId);
      
      await api.post(`/users/friend-request/${requestId}/withdraw`);
      
      // Update Hook State
      withdrawFriendRequest(userId, requestId);

      // Update Local List immediately
      setSentRequests(prev => prev.filter(req => req._id !== requestId));
      
      addNotification({
        type: 'success',
        title: 'Request Withdrawn',
        message: 'Friend request withdrawn successfully'
      });
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

  const handleMessageUser = (user: User) => {
    localStorage.setItem('selectedChatUser', JSON.stringify(user));
    router.push('/chat');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // Filter Logic
  const filteredReceivedRequests = receivedRequests.filter(req => {
    const user = req.sender as User;
    return user.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           user.username?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredSentRequests = sentRequests.filter(req => {
    const user = req.receiver as User;
    return user.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           user.username?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const currentRequests = activeTab === 'received' ? filteredReceivedRequests : filteredSentRequests;
  const hasRequests = currentRequests.length > 0;

  const getActionButtons = (request: FriendRequest) => {
    const isProcessing = actionInProgress === request._id;

    if (activeTab === 'received') {
      const senderId = typeof request.sender === 'string' ? request.sender : request.sender._id;
      return (
        <div className={styles.dualButtons}>
          <button
            className={`${styles.actionButton} ${styles.acceptButton}`}
            onClick={() => handleAcceptRequest(request._id, senderId)}
            disabled={isProcessing}
          >
            <FiUserCheck />
            {isProcessing ? 'Accepting...' : 'Accept'}
          </button>
          <button
            className={`${styles.actionButton} ${styles.rejectButton}`}
            onClick={() => handleRejectRequest(request._id, senderId)}
            disabled={isProcessing}
          >
            <FiUserX />
            {isProcessing ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      );
    } else {
      const receiverId = typeof request.receiver === 'string' ? request.receiver : request.receiver._id;
      return (
        <div className={styles.dualButtons}>
          <button
            className={`${styles.actionButton} ${styles.withdrawButton}`}
            onClick={() => handleWithdrawRequest(request._id, receiverId)}
            disabled={isProcessing}
          >
            <FiUserX />
            {isProcessing ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>
      );
    }
  };

  // UserProfile handlers
  const handleUserProfileLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    socketService.disconnect();
    router.push('/login');
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
              Received Requests
              {filteredReceivedRequests.length > 0 && (
                <span className={styles.tabBadge}>{filteredReceivedRequests.length}</span>
              )}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'sent' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('sent')}
            >
              <FiUserCheck />
              Sent Requests
              {filteredSentRequests.length > 0 && (
                <span className={styles.tabBadge}>{filteredSentRequests.length}</span>
              )}
            </button>
          </div>
        </div>
        
        {hasRequests && (
          <div className={styles.searchSection}>
             <div className={styles.searchWrapper}>
                <FiSearch className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search..."
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
            <div className={styles.requestsGrid}>
              {currentRequests.map((request) => {
                const user = activeTab === 'received' ? request.sender : request.receiver;
                const userObj = user as User;

                return (
                  <div key={request._id} className={styles.requestCard}>
                    <div className={styles.cardHeader}>
                      <div className={styles.userAvatar}>
                        {userObj.profilePic ? (
                          <img src={userObj.profilePic} alt={userObj.fullName} />
                        ) : (
                          <div className={styles.defaultAvatar}>
                            {userObj.fullName?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      
                      <div className={styles.userInfo}>
                        <h3 className={styles.userName}>{userObj.fullName}</h3>
                        <p className={styles.username}>@{userObj.username}</p>
                        
                        <div className={styles.requestMeta}>
                          <FiClock className={styles.clockIcon} />
                          <span className={styles.requestDate}>
                            {formatDate(request.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.cardActions}>
                      {getActionButtons(request)}
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
