'use client';

import { useRouter } from 'next/navigation';
import { FiUser, FiUsers, FiUserPlus, FiStar, FiSettings, FiLogOut, FiMessageCircle } from 'react-icons/fi';
import { IoEllipsisVertical } from 'react-icons/io5';
import { User } from '@/types';
import { useAuth } from '@/context/AuthContext';

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
  const { logout } = useAuth();

  const toggleUserMenu = () => setShowUserMenu(!showUserMenu);
  const totalBadgeCount = pendingFriendRequests;
  const isActivePage = (pageName: string) => currentPage === pageName;

  const handleLogout = async () => {
    try {
      setShowUserMenu(false);
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      router.push('/auth/login');
    }
  };

  const itemBase = "flex items-center gap-3 w-full px-3 py-3 bg-transparent border-0 text-white cursor-pointer rounded-lg text-[0.9rem] text-left relative transition-all hover:bg-white/10 hover:translate-x-0.5 disabled:opacity-60 disabled:cursor-default disabled:translate-x-0";
  const itemActive = "bg-white/15 border-l-[3px] border-blue-500 -ml-[3px]";

  return (
    <div className="flex items-center justify-between w-full">
      {/* Avatar + info */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/15 backdrop-blur-sm overflow-hidden shrink-0 sm:w-[45px] sm:h-[45px]">
          <div
            className="absolute inset-[-2px] rounded-full -z-[1] opacity-50 blur-[8px]"
            style={{ background: 'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #3b82f6)' }}
          />
          {currentUser?.profilePic ? (
            <img src={currentUser.profilePic} alt={currentUser.fullName} className="w-full h-full object-cover rounded-full" />
          ) : (
            <FiUser className="w-6 h-6 text-white/80" />
          )}
          {totalBadgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full min-w-5 h-5 flex items-center justify-center text-[0.7rem] font-semibold border-2 border-[#1a1a2e] px-1 z-[2]">
              {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
            </span>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <h3 className="text-white text-[1.05rem] font-semibold mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px] sm:max-w-[120px]">
            {currentUser?.fullName || 'User'}
          </h3>
          <span className="text-emerald-400 text-sm font-medium">Online</span>
        </div>
      </div>

      {/* Menu button */}
      <div className="relative" ref={userMenuRef}>
        <button
          className="relative bg-white/10 border border-white/20 text-white p-2 rounded-xl cursor-pointer flex items-center justify-center hover:bg-white/15 hover:scale-105 transition-all"
          onClick={toggleUserMenu}
          aria-label="User menu"
        >
          <IoEllipsisVertical />
          {pendingFriendRequests > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white/90 animate-pulse" />
          )}
        </button>

        {showUserMenu && (
          <div className="absolute top-full right-0 mt-2 bg-white/10 backdrop-blur-xl border border-white/15 rounded-xl p-2 w-[220px] max-w-[calc(100vw-1.5rem)] z-[1000] shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
            <button
              className={`${itemBase} ${isActivePage('messages') ? itemActive : ''}`}
              onClick={() => { setShowUserMenu(false); if (!isActivePage('messages')) router.push('/chat'); }}
              disabled={isActivePage('messages')}
            >
              <FiMessageCircle className="w-4 h-4 shrink-0 text-white/70" />
              <span>Messages</span>
              {isActivePage('messages') && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
            </button>

            <button
              className={`${itemBase} ${isActivePage('recommendations') ? itemActive : ''}`}
              onClick={() => { setShowUserMenu(false); if (!isActivePage('recommendations')) router.push('/recommendations'); }}
              disabled={isActivePage('recommendations')}
            >
              <FiStar className="w-4 h-4 shrink-0 text-white/70" />
              <span>Recommendations</span>
              {isActivePage('recommendations') && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
            </button>

            <button
              className={`${itemBase} ${isActivePage('my-friends') ? itemActive : ''}`}
              onClick={() => { setShowUserMenu(false); if (!isActivePage('my-friends')) router.push('/friends'); }}
              disabled={isActivePage('my-friends')}
            >
              <FiUsers className="w-4 h-4 shrink-0 text-white/70" />
              <span>My Friends</span>
              {isActivePage('my-friends') && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
            </button>

            <button
              className={`${itemBase} ${isActivePage('my-requests') ? itemActive : ''}`}
              onClick={() => { setShowUserMenu(false); router.push('/requests'); }}
            >
              <FiUserPlus className="w-4 h-4 shrink-0 text-white/70" />
              <span>Friend Requests</span>
              {pendingFriendRequests > 0 && (
                <span className="bg-red-500 text-white rounded-[10px] min-w-5 h-5 flex items-center justify-center text-[0.7rem] font-semibold px-1.5 ml-auto">
                  {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
                </span>
              )}
            </button>

            <button
              className={itemBase}
              onClick={() => { setShowUserMenu(false); router.push('/settings'); }}
            >
              <FiSettings className="w-4 h-4 shrink-0 text-white/70" />
              <span>Settings</span>
            </button>

            <div className="h-px bg-white/10 my-2" />

            <button className={itemBase} onClick={handleLogout}>
              <FiLogOut className="w-4 h-4 shrink-0 text-white/70" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
