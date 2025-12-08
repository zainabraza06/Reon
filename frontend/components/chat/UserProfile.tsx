// components/ChatSidebar/UserProfile.tsx
'use client';

import { useRouter } from 'next/navigation';
import { 
  FiUser, 
  FiUsers, 
  FiUserPlus, 
  FiStar, 
  FiSettings, 
  FiLogOut,
  FiMessageCircle,
} from 'react-icons/fi';
import { IoEllipsisVertical } from 'react-icons/io5';
import { User } from '@/types';
import { useAuth } from '@/context/AuthContext'; // Import the auth context
import styles from './UserProfile.module.css';

interface UserProfileProps {
  currentUser: User;
  showUserMenu: boolean;
  setShowUserMenu: (show: boolean) => void;
  userMenuRef: React.RefObject<HTMLDivElement | null>;
  pendingFriendRequests?: number;
  currentPage?: string;
}

export default function UserProfile({
  currentUser,
  showUserMenu,
  setShowUserMenu,
  userMenuRef,
  pendingFriendRequests = 0,
  currentPage = ''
}: UserProfileProps) {
  const router = useRouter();
  const { logout } = useAuth(); // Get logout function from auth context

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  // Total badge count on avatar
  const totalBadgeCount = pendingFriendRequests;

  // Determine if menu item is active
  const isActivePage = (pageName: string) => currentPage === pageName;

  // Handle logout using the auth context
  const handleLogout = async () => {
    try {
      setShowUserMenu(false); // Close the menu first
      await logout(); // This handles both backend logout and frontend cleanup
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: manually clear local storage and redirect
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      router.push('/auth/login');
    }
  };

  return (
    <div className={styles.sidebarHeader}>
      <div className={styles.userProfile}>
        <div className={styles.userAvatar}>
          <div className={styles.avatarGlow}></div>
          {currentUser?.profilePic ? (
            <img 
              src={currentUser.profilePic} 
              alt={currentUser.fullName} 
              className={styles.avatarImage}
            />
          ) : (
            <FiUser className={styles.avatarIcon} />
          )}
          {totalBadgeCount > 0 && (
            <span className={styles.totalBadge}>
              {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
            </span>
          )}
        </div>
        <div className={styles.userInfo}>
          <h3>{currentUser?.fullName || 'User'}</h3>
          <span className={styles.status}>Online</span>
        </div>
      </div>

      <div className={styles.headerActions}>
        <div className={styles.userMenuContainer} ref={userMenuRef}>
          <button 
            className={styles.userMenuButton} 
            onClick={toggleUserMenu}
            aria-label="User menu"
          >
            <IoEllipsisVertical />
            {( pendingFriendRequests > 0) && (
              <span className={styles.menuNotificationIndicator}></span>
            )}
          </button>

          {showUserMenu && (
            <div className={styles.userMenu}>
              {/* Messages */}
              <button
                className={`${styles.menuItem} ${isActivePage('messages') ? styles.activeMenuItem : ''}`}
                onClick={() => {
                  setShowUserMenu(false);
                  if (!isActivePage('messages')) {
                    router.push('/chat');
                  }
                }}
                disabled={isActivePage('messages')}
              >
                <FiMessageCircle className={styles.menuIcon} />
                <span>Messages</span>
                {isActivePage('messages') && <div className={styles.activeIndicator}></div>}
              </button>

              {/* Recommendations */}
              <button
                className={`${styles.menuItem} ${isActivePage('recommendations') ? styles.activeMenuItem : ''}`}
                onClick={() => {
                  setShowUserMenu(false);
                  if (!isActivePage('recommendations')) {
                    router.push('/recommendations');
                  }
                }}
                disabled={isActivePage('recommendations')}
              >
                <FiStar className={styles.menuIcon} />
                <span>Recommendations</span>
                {isActivePage('recommendations') && <div className={styles.activeIndicator}></div>}
              </button>

              {/* My Friends */}
              <button
                className={`${styles.menuItem} ${isActivePage('my-friends') ? styles.activeMenuItem : ''}`}
                onClick={() => {
                  setShowUserMenu(false);
                  if (!isActivePage('my-friends')) {
                    router.push('/friends');
                  }
                }}
                disabled={isActivePage('my-friends')}
              >
                <FiUsers className={styles.menuIcon} />
                <span>My Friends</span>
                {isActivePage('my-friends') && <div className={styles.activeIndicator}></div>}
              </button>

              {/* Create Group
              <button 
                className={styles.menuItem} 
                onClick={() => {
                  setShowUserMenu(false);
                  router.push('/groups/create');
                }}
              >
                <FiUsers className={styles.menuIcon} />
                <span>Create Group</span>
              </button> */}

              {/* Friend Requests */}
              <button 
                className={`${styles.menuItem} ${isActivePage('my-requests') ? styles.activeMenuItem : ''}`} 
                onClick={() => {
                  setShowUserMenu(false);
                  router.push('/requests');
                }}
              >
                <FiUserPlus className={styles.menuIcon} />
                <span>Friend Requests</span>
                {pendingFriendRequests > 0 && (
                  <span className={styles.menuItemBadge}>
                    {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
                  </span>
                )}
              </button>

              {/* Settings */}
              <button 
                className={styles.menuItem} 
                onClick={() => {
                  setShowUserMenu(false);
                  router.push('/settings');
                }}
              >
                <FiSettings className={styles.menuIcon} />
                <span>Settings</span>
              </button>

              <div className={styles.menuDivider}></div>

              {/* Logout - Now using the proper logout function */}
              <button 
                className={styles.menuItem} 
                onClick={handleLogout}
              >
                <FiLogOut className={styles.menuIcon} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}