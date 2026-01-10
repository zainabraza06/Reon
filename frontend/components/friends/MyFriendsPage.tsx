'use client';
import { useState, useEffect,  useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiSearch, 

  FiMapPin, 
  FiGlobe, 
  FiUsers,
  FiArrowLeft,
  FiX,
  FiMessageCircle,
  FiUserMinus,
  
  FiUserCheck
} from 'react-icons/fi';
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { socketService } from '@/lib/socket';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import styles from './MyFriendsPage.module.css';
import Image from 'next/image';
import { User } from '@/types';

export default function MyFriendsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // UserProfile states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Use the friend requests hook
  const {
    pendingCount,
    friendsList,
    loading,
    getFriendState,
    removeFriend,
    loadFriendsList,
    sendFriendRequest
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
          fullName: 'User',
          username: 'user',
          profilePic: '',
          isOnboarded: true,
          unreadCount: 0
        };
        setCurrentUser(defaultUser);
      }
    };

    loadCurrentUser();
  }, []);

  // Load friends when currentUser is available
  useEffect(() => {
    const loadFriendsData = async () => {
      if (!currentUser) return;

      try {
        await loadFriendsList(searchQuery, 1, 20);
      } catch (error) {
        console.error('Error loading friends:', error);
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Failed to load friends'
        });
      }
    };

    if (currentUser) {
      loadFriendsData();
    }
  }, [currentUser, addNotification, loadFriendsList]);

  // Search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentUser) {
        loadFriendsList(searchQuery, 1, 20);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentUser, loadFriendsList]);

  // Handle Remove Friend using hook
  const handleRemoveFriend = async (friendId: string) => {
    try {
      setActionInProgress(friendId);
      
      const result = await removeFriend(friendId);
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Friend Removed',
          message: 'Friend removed successfully'
        });
        // Real-time: Friend will temporarily show "Removed" then disappear from list
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

  // Allow sending a friend request from this page (after removal)
  const handleSendRequest = async (userId: string) => {
    try {
      setActionInProgress(userId);
      const result = await sendFriendRequest(userId);
      if (result.success) {
        addNotification({ type: 'success', title: 'Request Sent', message: 'Friend request sent successfully' });
      } else {
        addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to send friend request' });
      }
    } catch (err) {
      console.error('Error sending request from friends page:', err);
      addNotification({ type: 'error', title: 'Error', message: 'Failed to send friend request' });
      setActionInProgress(null);
    } finally {
      setActionInProgress(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

 

  // Filter friends based on search query
  const filteredFriends = friendsList.filter((friend: User) => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    const fullName = friend.fullName?.toLowerCase() || '';
    const username = friend.username?.toLowerCase() || '';
    const location = friend.location?.toLowerCase() || '';
    const nativeLanguage = friend.nativeLanguage?.toLowerCase() || '';
    
    return (
      fullName.includes(query) ||
      username.includes(query) ||
      location.includes(query) ||
      nativeLanguage.includes(query)
    );
  });

  // Check if we should show loading state
  const isLoadingInitial = loading.friends && friendsList.length === 0 && searchQuery === '';

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
                fullName: 'User',
                username: 'user',
                profilePic: '',
                isOnboarded: true,
                unreadCount: 0
              }}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
              pendingFriendRequests={pendingCount}
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
          {isLoadingInitial ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner}></div>
              <p>Loading your friends...</p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className={styles.emptyState}>
              <FiUsers className={styles.emptyIcon} />
              <h3>No friends found</h3>
              <p>
                {searchQuery 
                  ? `No friends match "${searchQuery}"`
                  : "You haven't added any friends yet."
                }
              </p>
            </div>
          ) : (
            <>
              <div className={styles.resultsGrid}>
                {filteredFriends.map((friend: User) => {
                  const isProcessing = actionInProgress === friend._id;
                  const friendState = getFriendState(friend._id);

                  // Show both actual friends and recently-removed entries so user can re-send requests
                  const isFriendOrRemoved = friendState.status === 'friends' || friendState.status === 'removed';
                  if (!isFriendOrRemoved) return null;

                  return (
                    <div key={friend._id} className={styles.friendCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.userAvatar}>
                          {friend.profilePic ? (
                            <Image
                              src={friend.profilePic}
                              alt={friend.fullName || 'Friend'}
                              width={40}
                              height={40}
                              className={styles.avatarImage}
                              priority
                            />
                          ) : (
                            <div className={styles.defaultAvatar}>
                              {friend.fullName?.charAt(0)?.toUpperCase() || friend.username?.charAt(0)?.toUpperCase() || 'F'}
                            </div>
                          )}
                        </div>
                        
                        <div className={styles.userInfo}>
                          <h3 className={styles.userName}>{friend.fullName || 'Anonymous User'}</h3>
                          <p className={styles.username}>@{friend.username || 'user'}</p>
                          
                          <div className={styles.friendBadge}>
                            <span className={styles.badge}>
                              <FiUserCheck />
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
                      </div>

                      <div className={styles.cardActions}>
                        {friendState.status === 'removed' ? (
                          <>
                            <button className={`${styles.actionButton} ${styles.removeButton}`} disabled>
                              <FiUserMinus />
                              Removed
                            </button>
                            <button
                              className={`${styles.actionButton} ${styles.sendButton}`}
                              onClick={() => handleSendRequest(friend._id)}
                              disabled={isProcessing}
                            >
                              <FiUserCheck />
                              {isProcessing ? 'Sending...' : 'Send Request'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={`${styles.actionButton} ${styles.removeButton}`}
                              onClick={() => handleRemoveFriend(friend._id)}
                              disabled={isProcessing}
                            >
                              <FiUserMinus />
                              {isProcessing ? 'Removing...' : 'Remove Friend'}
                            </button>

                            <button
                              className={`${styles.actionButton} ${styles.messageButton}`}
                              onClick={() => {
                                router.push(`/chat?userId=${friend._id}`);
                              }}
                            >
                              <FiMessageCircle />
                              Message
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}