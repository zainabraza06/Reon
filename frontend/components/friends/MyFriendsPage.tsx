'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiSearch, 
  FiUser, 
  FiMapPin, 
  FiGlobe, 
  FiUsers,
  FiArrowLeft,
  FiX,
  FiMessageCircle,
  FiUserMinus,

} from 'react-icons/fi';
import { api } from '@/lib/api';
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { User } from '@/types';
import { socketService } from '@/lib/socket';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import styles from './MyFriendsPage.module.css';
import Image from 'next/image';

interface Friend {
  _id: string;
  fullName: string;
  username: string;
  profilePic: string;
  location: string;
  nativeLanguage: string;
  mutualFriendsCount: number;
}

interface FriendsResponse {
  page: number;
  limit: number;
  total: number;
  friends: Friend[];
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

export default function MyFriendsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // UserProfile states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
 
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Initialize hook with current user ID
  const {
    pendingCount,
    getFriendState,
    setInitialFriendState,
    removeFriend
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

  // Load current user data and connect socket
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
          unreadCount: 0
        };
        setCurrentUser(defaultUser);
      }
    };

    loadCurrentUser();
  }, []);

  

  // Load friends
  const loadFriends = useCallback(async (pageNum: number = 1, search: string = '') => {
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

      const response = await api.get<FriendsResponse>('/users/friends', { params });
      const data = response.data;

      // Sync hook state: Everyone in this list is a 'friend'
      data.friends.forEach(friend => {
        setInitialFriendState(friend._id, { userId: friend._id, status: 'friends' });
      });

      if (pageNum === 1) {
        setFriends(data.friends);
      } else {
        setFriends(prev => [...prev, ...data.friends]);
      }
      setHasMore(data.friends.length === 20);
      setPage(pageNum);
    } catch (error: unknown) {
      console.error('Error loading friends:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to load friends'
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [addNotification, setInitialFriendState]);

  // Initial load
  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(1);
      loadFriends(1, searchQuery);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadFriends]);

  // Handle Remove Friend
  const handleRemoveFriend = async (friendId: string) => {
    try {
      setActionInProgress(friendId);
      
      // Use the standard endpoint consistent with RecommendationPage and Controller
      await api.patch(`/users/friends/${friendId}`);

      // Use the hook to update state and emit socket event
      removeFriend(friendId);
      
      addNotification({
        type: 'success',
        title: 'Friend Removed',
        message: 'Friend removed successfully'
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



  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadFriends(page + 1, searchQuery);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

 

  
  const visibleFriends = friends.filter(friend => {
    const state = getFriendState(friend._id);
    
    return state.status === 'friends';
  });

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
              <h1 className={styles.title}>My Friends</h1>
              <p className={styles.subtitle}>
                Connect and chat with your friends
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
              pendingFriendRequests={pendingCount} // Use real-time count from hook
              currentPage="friends"
              
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
                placeholder="Search friends by name or username..."
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
              <p>Loading your friends...</p>
            </div>
          ) : visibleFriends.length === 0 ? (
            <div className={styles.emptyState}>
              <FiUsers className={styles.emptyIcon} />
              <h3>No friends found</h3>
              <p>
                {searchQuery 
                  ? `No friends match "${searchQuery}"`
                  : "You haven't added any friends yet or they have been removed."
                }
              </p>
            </div>
          ) : (
            <>
              <div className={styles.resultsGrid}>
                {visibleFriends.map((friend) => (
                  <div key={friend._id} className={styles.friendCard}>
                    <div className={styles.cardHeader}>
                 <div className={styles.userAvatar}>
                  {friend.profilePic ? (
                    <Image
                      src={friend.profilePic}
                      alt={friend.fullName}
                      width={40}       // adjust size as needed
                      height={40}      // adjust size as needed
                      className={styles.avatarImage}
                      priority          // optional: marks image as high-priority for LCP
                    />
                  ) : (
                    <div className={styles.defaultAvatar}>
                      {friend.fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                      
                      <div className={styles.userInfo}>
                        <h3 className={styles.userName}>{friend.fullName}</h3>
                        <p className={styles.username}>@{friend.username}</p>
                        
                        <div className={styles.friendBadge}>
                          <span className={styles.badge}>
                            <FiUser />
                            Friends
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.userDetails}>
                      {friend.location && (
                        <div className={styles.detailItem}>
                          <FiMapPin className={styles.detailIcon} />
                          <span>{friend.location}</span>
                        </div>
                      )}
                      
                      {friend.nativeLanguage && (
                        <div className={styles.detailItem}>
                          <FiGlobe className={styles.detailIcon} />
                          <span>{friend.nativeLanguage}</span>
                        </div>
                      )}
                      
                      {friend.mutualFriendsCount > 0 && (
                        <div className={styles.detailItem}>
                          <FiUsers className={styles.detailIcon} />
                          <span>{friend.mutualFriendsCount} mutual friends</span>
                        </div>
                      )}
                    </div>

                    <div className={styles.cardActions}>
                      <button
                        className={`${styles.actionButton} ${styles.removeButton}`}
                        onClick={() => handleRemoveFriend(friend._id)}
                        disabled={actionInProgress === friend._id}
                      >
                        <FiUserMinus />
                        {actionInProgress === friend._id ? 'Removing...' : 'Remove Friend'}
                      </button>
                      
                    
                            <button
                                className={`${styles.actionButton} ${styles.messageButton}`}
                                onClick={() => {
                                  // Navigate to chat with user ID in URL
                                  router.push(`/chat?userId=${friend._id}`);
                                }}
                              >
                                <FiMessageCircle />
                                Message
                              </button>
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
                      <span>Loading more friends...</span>
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