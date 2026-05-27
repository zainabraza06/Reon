'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiSearch, FiMapPin, FiGlobe, FiUsers, FiArrowLeft, FiX,
  FiMessageCircle, FiUserMinus, FiUserCheck
} from 'react-icons/fi';
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { socketService } from '@/lib/socket';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import Image from 'next/image';
import { User } from '@/types';

const pageBlobs = (
  <>
    <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(128,90,213,0.3)] -top-32 -right-32 pointer-events-none" />
    <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(59,130,246,0.3)] -bottom-32 -left-32 [animation-delay:2s] pointer-events-none" />
    <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(45,212,191,0.25)] top-1/2 left-[60%] [animation-delay:4s] pointer-events-none" />
  </>
);

export default function MyFriendsPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { pendingCount, friendsList, loading, getFriendState, removeFriend, loadFriendsList, sendFriendRequest } =
    useFriendRequests(currentUser?._id || null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        if (user._id && user._id !== 'default') socketService.connect(user._id);
      } catch {
        setCurrentUser({ _id: 'default', fullName: 'User', username: 'user', profilePic: '', isOnboarded: true, unreadCount: 0 });
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadFriendsList(searchQuery, 1, 20).catch(() => {
        addNotification({ type: 'error', title: 'Error', message: 'Failed to load friends' });
      });
    }
  }, [currentUser, addNotification, loadFriendsList]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentUser) loadFriendsList(searchQuery, 1, 20);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentUser, loadFriendsList]);

  const handleRemoveFriend = async (friendId: string) => {
    try {
      setActionInProgress(friendId);
      const result = await removeFriend(friendId);
      if (result.success) addNotification({ type: 'success', title: 'Friend Removed', message: 'Friend removed successfully' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to remove friend' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to remove friend' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSendRequest = async (userId: string) => {
    try {
      setActionInProgress(userId);
      const result = await sendFriendRequest(userId);
      if (result.success) addNotification({ type: 'success', title: 'Request Sent', message: 'Friend request sent successfully' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to send friend request' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to send friend request' });
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredFriends = friendsList.filter((friend: User) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (friend.fullName?.toLowerCase() || '').includes(q) ||
      (friend.username?.toLowerCase() || '').includes(q) ||
      (friend.location?.toLowerCase() || '').includes(q) ||
      (friend.nativeLanguage?.toLowerCase() || '').includes(q)
    );
  });

  const isLoadingInitial = loading.friends && friendsList.length === 0 && searchQuery === '';
  const defaultUser = { _id: 'default', fullName: 'User', username: 'user', profilePic: '', isOnboarded: true, unreadCount: 0 };

  const actionBtn = "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e1e2f] to-[#111117] relative overflow-x-hidden text-white">
      {pageBlobs}
      <div className="fixed inset-0 z-0 pointer-events-none" />

      <div className="relative z-[1] max-w-[1200px] mx-auto p-8 sm:p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-12 gap-8 sm:flex-col sm:mb-6 sm:gap-4">
          <div className="flex items-start gap-4 flex-1">
            <button
              className="bg-white/10 border border-white/20 text-white/80 rounded-[0.75rem] p-3 cursor-pointer transition-all flex items-center justify-center hover:bg-white/15 hover:-translate-x-0.5 shrink-0"
              onClick={() => router.back()}
              aria-label="Go back"
            >
              <FiArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent sm:text-2xl">
                My Friends
              </h1>
              <p className="text-white/60 text-sm">Connect and chat with your friends</p>
            </div>
          </div>
          <div className="shrink-0" ref={userMenuRef}>
            <UserProfile
              currentUser={currentUser || defaultUser}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
              pendingFriendRequests={pendingCount}
              currentPage="friends"
            />
          </div>
        </div>

        {/* Search */}
        <div className="mb-8 sm:mb-4">
          <div className="max-w-xl mx-auto">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-white/50 z-10 pointer-events-none">
                <FiSearch />
              </div>
              <input
                type="text"
                placeholder="Search friends by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
              {searchQuery && (
                <button className="absolute right-4 text-white/50 hover:text-white cursor-pointer transition-colors" onClick={() => setSearchQuery('')}>
                  <FiX size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {isLoadingInitial ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/50">
              <div className="w-8 h-8 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring" />
              <p>Loading your friends...</p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/50 text-center">
              <FiUsers size={48} className="opacity-30" />
              <h3 className="text-lg font-semibold">No friends found</h3>
              <p className="text-sm max-w-[300px]">
                {searchQuery ? `No friends match "${searchQuery}"` : "You haven't added any friends yet."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredFriends.map((friend: User) => {
                const isProcessing = actionInProgress === friend._id;
                const friendState = getFriendState(friend._id);
                const isFriendOrRemoved = friendState.status === 'friends' || friendState.status === 'removed';
                if (!isFriendOrRemoved) return null;

                return (
                  <div key={friend._id} className="bg-white/[0.08] backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:bg-white/[0.12] hover:border-white/20 transition-all flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/20 shrink-0">
                        {friend.profilePic ? (
                          <Image src={friend.profilePic} alt={friend.fullName || 'Friend'} width={40} height={40} className="w-full h-full object-cover" priority />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-sm">
                            {friend.fullName?.charAt(0)?.toUpperCase() || friend.username?.charAt(0)?.toUpperCase() || 'F'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm truncate">{friend.fullName || 'Anonymous User'}</h3>
                        <p className="text-white/50 text-xs truncate">@{friend.username || 'user'}</p>
                        <div className="mt-1">
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[0.65rem] rounded-full w-fit">
                            <FiUserCheck size={10} />
                            Friends
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      {friend.location && (
                        <div className="flex items-center gap-2 text-white/60 text-xs">
                          <FiMapPin size={12} className="shrink-0" />
                          <span className="truncate">{friend.location}</span>
                        </div>
                      )}
                      {friend.nativeLanguage && (
                        <div className="flex items-center gap-2 text-white/60 text-xs">
                          <FiGlobe size={12} className="shrink-0" />
                          <span className="truncate">{friend.nativeLanguage}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mt-auto">
                      {friendState.status === 'removed' ? (
                        <>
                          <button className={`${actionBtn} bg-red-500/10 border-red-500/20 text-red-400`} disabled>
                            <FiUserMinus size={12} /> Removed
                          </button>
                          <button
                            className={`${actionBtn} bg-blue-500/15 border-blue-500/30 text-blue-300 hover:bg-blue-500/25`}
                            onClick={() => handleSendRequest(friend._id)}
                            disabled={isProcessing}
                          >
                            <FiUserCheck size={12} /> {isProcessing ? 'Sending...' : 'Send Request'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={`${actionBtn} bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20`}
                            onClick={() => handleRemoveFriend(friend._id)}
                            disabled={isProcessing}
                          >
                            <FiUserMinus size={12} /> {isProcessing ? 'Removing...' : 'Remove'}
                          </button>
                          <button
                            className={`${actionBtn} bg-blue-500/15 border-blue-500/30 text-blue-300 hover:bg-blue-500/25`}
                            onClick={() => router.push(`/chat?userId=${friend._id}`)}
                          >
                            <FiMessageCircle size={12} /> Message
                          </button>
                        </>
                      )}
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
