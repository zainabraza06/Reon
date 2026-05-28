'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiSearch, FiUserPlus, FiUserCheck, FiUserX,
  FiMapPin, FiGlobe, FiUsers, FiArrowLeft, FiX
} from 'react-icons/fi';
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { socketService } from '@/lib/socket';
import { User } from '@/types';
import { useFriendRequests } from '@/hooks/useFriendRequest';

const actionBtn = "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border disabled:opacity-60 disabled:cursor-not-allowed";

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

  const {
    pendingCount, recommendedFriends: recommendedUsers, pagination, loading,
    getFriendState, sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
    withdrawFriendRequest, removeFriend, loadRecommendedFriends
  } = useFriendRequests(currentUser?._id || null);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        let user: User;
        if (userData) { user = JSON.parse(userData); setCurrentUser(user); }
        else {
          const response = await fetch('/api/users/me');
          user = await response.json();
          setCurrentUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        }
        if (user._id && user._id !== 'default') socketService.connect(user._id);
      } catch {
        setCurrentUser({ _id: 'default', username: 'user', profilePic: '', fullName: 'User', unreadCount: 0, isOnboarded: true });
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const loadData = async () => {
        try {
          await loadRecommendedFriends(searchQuery, 1, 20);
          setPage(1);
          setHasMore(pagination.total > pagination.page * pagination.limit);
        } catch {
          addNotification({ type: 'error', title: 'Error', message: 'Failed to load recommendations' });
        }
      };
      loadData();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadRecommendedFriends, pagination.total, pagination.page, pagination.limit, addNotification]);

  const handleLoadMore = useCallback(async () => {
    if (!loading.recommended && hasMore && currentUser) {
      try {
        await loadRecommendedFriends(searchQuery, page + 1, 20);
        setPage(prev => prev + 1);
        setHasMore(pagination.total > (page + 1) * pagination.limit);
      } catch {
        addNotification({ type: 'error', title: 'Error', message: 'Failed to load more users' });
      }
    }
  }, [loading.recommended, hasMore, currentUser, searchQuery, page, loadRecommendedFriends, pagination.total, pagination.limit, addNotification]);

  const handleSendRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'send' });
      const result = await sendFriendRequest(userId);
      if (result.success) addNotification({ type: 'success', title: 'Request Sent', message: 'Friend request sent successfully' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to send friend request' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to send friend request' });
    } finally { setActionInProgress(null); }
  };

  const handleWithdrawRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'withdraw' });
      const friendState = getFriendState(userId);
      if (!friendState.requestId) { addNotification({ type: 'error', title: 'Error', message: 'Friend request not found' }); return; }
      const result = await withdrawFriendRequest(friendState.requestId);
      if (result.success) addNotification({ type: 'success', title: 'Request Withdrawn', message: 'Friend request withdrawn successfully' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to withdraw friend request' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to withdraw friend request' });
    } finally { setActionInProgress(null); }
  };

  const handleAcceptRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'accept' });
      const friendState = getFriendState(userId);
      if (!friendState.requestId) { addNotification({ type: 'error', title: 'Error', message: 'Friend request not found' }); return; }
      const result = await acceptFriendRequest(friendState.requestId);
      if (result.success) addNotification({ type: 'success', title: 'Request Accepted', message: 'You are now friends!' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to accept friend request' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to accept friend request' });
    } finally { setActionInProgress(null); }
  };

  const handleRejectRequest = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'reject' });
      const friendState = getFriendState(userId);
      if (!friendState.requestId) { addNotification({ type: 'error', title: 'Error', message: 'Friend request not found' }); return; }
      const result = await rejectFriendRequest(friendState.requestId);
      if (result.success) addNotification({ type: 'success', title: 'Request Rejected', message: 'Friend request rejected' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to reject friend request' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to reject friend request' });
    } finally { setActionInProgress(null); }
  };

  const handleRemoveFriend = async (userId: string) => {
    try {
      setActionInProgress({ userId, action: 'remove' });
      const result = await removeFriend(userId);
      if (result.success) addNotification({ type: 'success', title: 'Friend Removed', message: 'User removed from friends' });
      else addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to remove friend' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to remove friend' });
    } finally { setActionInProgress(null); }
  };

  const getActionButtons = (user: User & { mutualFriendsCount: number; score: number }) => {
    const isSending = actionInProgress?.userId === user._id && actionInProgress?.action === 'send';
    const isWithdrawing = actionInProgress?.userId === user._id && actionInProgress?.action === 'withdraw';
    const isAccepting = actionInProgress?.userId === user._id && actionInProgress?.action === 'accept';
    const isRejecting = actionInProgress?.userId === user._id && actionInProgress?.action === 'reject';
    const isRemoving = actionInProgress?.userId === user._id && actionInProgress?.action === 'remove';
    const friendState = getFriendState(user._id);

    switch (friendState.status) {
      case 'friends': return (
        <button className={`${actionBtn} bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300`} onClick={() => handleRemoveFriend(user._id)} disabled={isRemoving}>
          <FiUserCheck size={12} /> {isRemoving ? 'Removing...' : 'Friends'}
        </button>
      );
      case 'pending-received': return (
        <div className="flex gap-2">
          <button className={`${actionBtn} bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25`} onClick={() => handleAcceptRequest(user._id)} disabled={isAccepting}>
            <FiUserCheck size={12} /> {isAccepting ? 'Accepting...' : 'Accept'}
          </button>
          <button className={`${actionBtn} bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20`} onClick={() => handleRejectRequest(user._id)} disabled={isRejecting}>
            <FiUserX size={12} /> {isRejecting ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      );
      case 'pending-sent': return (
        <button className={`${actionBtn} bg-white/10 border-white/20 text-white/70 hover:bg-white/15`} onClick={() => handleWithdrawRequest(user._id)} disabled={isWithdrawing}>
          <FiUserPlus size={12} /> {isWithdrawing ? 'Withdrawing...' : 'Request Sent'}
        </button>
      );
      case 'removed': return (
        <button className={`${actionBtn} bg-white/5 border-white/10 text-white/40`} disabled>Removed</button>
      );
      default: return (
        <button className={`${actionBtn} bg-gradient-to-r from-blue-500 to-purple-600 border-transparent text-white hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(59,130,246,0.3)]`} onClick={() => handleSendRequest(user._id)} disabled={isSending}>
          <FiUserPlus size={12} /> {isSending ? 'Sending...' : 'Send Request'}
        </button>
      );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 10) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (score >= 5) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-white/10 text-white/60 border-white/20';
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isLoadingInitial = loading.recommended && recommendedUsers.length === 0;
  const defaultUser = { _id: 'default', username: 'user', profilePic: '', fullName: 'User', unreadCount: 0, isOnboarded: true };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e1e2f] to-[#111117] relative overflow-x-hidden text-white">
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(128,90,213,0.3)] -top-32 -right-32 pointer-events-none" />
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(59,130,246,0.3)] -bottom-32 -left-32 [animation-delay:2s] pointer-events-none" />
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(45,212,191,0.25)] top-1/2 left-[60%] [animation-delay:4s] pointer-events-none" />

      <div className="relative z-[1] max-w-[1200px] mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:justify-between sm:items-start sm:mb-12 sm:gap-8">
          <div className="flex items-start gap-4 flex-1">
            <button
              className="bg-white/10 border border-white/20 text-white/80 rounded-[0.75rem] p-3 cursor-pointer transition-all flex items-center justify-center hover:bg-white/15 hover:-translate-x-0.5 shrink-0"
              onClick={() => router.back()}
              aria-label="Go back"
            >
              <FiArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-1 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent sm:text-3xl">
                Find Friends
              </h1>
              <p className="text-white/60 text-sm">Discover people you might know and connect with them</p>
            </div>
          </div>
          <div className="shrink-0" ref={userMenuRef}>
            <UserProfile
              currentUser={currentUser || defaultUser}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
              pendingFriendRequests={pendingCount}
              currentPage="recommendations"
            />
          </div>
        </div>

        {/* Search */}
        <div className="mb-8 sm:mb-4">
          <div className="max-w-xl mx-auto">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-white/50 z-10 pointer-events-none"><FiSearch size={16} /></div>
              <input
                type="text"
                placeholder="Search by name or username..."
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
              <p>Finding recommended users...</p>
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/50 text-center">
              <FiUsers size={48} className="opacity-30" />
              <h3 className="text-lg font-semibold">No matches found</h3>
              <p className="text-sm max-w-[300px]">
                {searchQuery ? `No users match "${searchQuery}"` : "No recommended users found. Try adjusting your search."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recommendedUsers.map((user) => {
                  const recommendedUser = user as User & { mutualFriendsCount: number; score: number; };
                  return (
                    <div key={user._id} className="bg-white/[0.08] backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:bg-white/[0.12] hover:border-white/20 transition-all flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/20 shrink-0">
                          {user.profilePic ? (
                            <img src={user.profilePic} alt={user.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-sm">
                              {user.fullName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase() || 'U'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white text-sm truncate">{user.fullName || 'Anonymous User'}</h3>
                          <p className="text-white/50 text-xs truncate">@{user.username || 'user'}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {'score' in recommendedUser && (
                              <span className={`px-2 py-0.5 text-[0.65rem] rounded-full border ${getScoreColor(recommendedUser.score)}`}>
                                Match: {recommendedUser.score} pts
                              </span>
                            )}
                            {'mutualFriendsCount' in recommendedUser && recommendedUser.mutualFriendsCount > 0 && (
                              <span className="px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[0.65rem] rounded-full">
                                {recommendedUser.mutualFriendsCount} mutual
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        {user.location && (
                          <div className="flex items-center gap-2 text-white/60 text-xs">
                            <FiMapPin size={12} className="shrink-0" />
                            <span className="truncate">{user.location}</span>
                          </div>
                        )}
                        {user.nativeLanguage && (
                          <div className="flex items-center gap-2 text-white/60 text-xs">
                            <FiGlobe size={12} className="shrink-0" />
                            <span className="truncate">{user.nativeLanguage}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto">{getActionButtons(recommendedUser)}</div>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  {loading.recommended ? (
                    <div className="flex items-center gap-3 text-white/50">
                      <div className="w-5 h-5 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring" />
                      <span>Loading more users...</span>
                    </div>
                  ) : (
                    <button
                      className="px-8 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-semibold cursor-pointer transition-all hover:bg-white/15 hover:-translate-y-0.5 disabled:opacity-60"
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
