'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { FiUserPlus, FiUserCheck, FiUserX, FiArrowLeft, FiSearch, FiUsers } from 'react-icons/fi';
import { useNotification } from '@/context/NotificationContext';
import { useFriendRequests } from '@/hooks/useFriendRequest';
import UserProfile from '@/components/chat/UserProfile';

type TabType = 'received' | 'sent';

const actionBtn = "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border disabled:opacity-60 disabled:cursor-not-allowed";

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

  const {
    friendStates, pendingCount, isInitialized, friendsList, recommendedFriends, loading,
    sendFriendRequest, acceptFriendRequest, rejectFriendRequest, withdrawFriendRequest, removeFriend,
    loadFriendsList, loadRecommendedFriends, loadReceivedRequests: loadReceivedRequestsFromHook,
    loadSentRequests: loadSentRequestsFromHook, loadPendingCount, refreshAll, getFriendState
  } = useFriendRequests(currentUser?._id || null);

  const getRequestsForCurrentTab = useCallback(() => {
    const allStates = Array.from(friendStates.values());
    return activeTab === 'received'
      ? allStates.filter(state => state.status === 'pending-received')
      : allStates.filter(state => state.status === 'pending-sent');
  }, [friendStates, activeTab]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (userData) setCurrentUser(JSON.parse(userData));
        else {
          const response = await fetch('/api/users/me');
          setCurrentUser(await response.json());
        }
      } catch {
        setCurrentUser({ _id: 'default', username: 'user', profilePic: '', fullName: 'User', unreadCount: 0, isOnboarded: true });
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      if (!currentUser || !isInitialized) return;
      setIsLoading(true);
      try {
        await Promise.all([loadReceivedRequestsFromHook(), loadSentRequestsFromHook(), loadPendingCount()]);
      } catch {
        addNotification({ type: 'error', title: 'Error', message: 'Failed to load friend requests' });
      } finally {
        setIsLoading(false);
      }
    };
    if (currentUser) loadInitialData();
  }, [currentUser, isInitialized, loadReceivedRequestsFromHook, loadSentRequestsFromHook, loadPendingCount, addNotification]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAcceptRequest = async (userId: string, requestId?: string) => {
    if (!requestId) { addNotification({ type: 'error', title: 'Error', message: 'Request ID not found' }); return; }
    try {
      setActionInProgress(userId);
      const result = await acceptFriendRequest(requestId);
      if (result.success) {
        addNotification({ type: 'success', title: 'Request Accepted', message: 'You are now friends!' });
        if (activeTab === 'received') await loadReceivedRequestsFromHook();
        await loadPendingCount();
      } else {
        addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to accept friend request' });
      }
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to accept friend request' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectRequest = async (userId: string, requestId?: string) => {
    if (!requestId) { addNotification({ type: 'error', title: 'Error', message: 'Request ID not found' }); return; }
    try {
      setActionInProgress(userId);
      const result = await rejectFriendRequest(requestId);
      if (result.success) {
        addNotification({ type: 'success', title: 'Request Rejected', message: 'Friend request rejected' });
        if (activeTab === 'received') await loadReceivedRequestsFromHook();
      } else {
        addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to reject friend request' });
      }
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to reject friend request' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleWithdrawRequest = async (userId: string, requestId?: string) => {
    if (!requestId) { addNotification({ type: 'error', title: 'Error', message: 'Request ID not found' }); return; }
    try {
      setActionInProgress(userId);
      const result = await withdrawFriendRequest(requestId);
      if (result.success) {
        addNotification({ type: 'success', title: 'Request Withdrawn', message: 'Friend request withdrawn successfully' });
        if (activeTab === 'sent') await loadSentRequestsFromHook();
      } else {
        addNotification({ type: 'error', title: 'Error', message: result.error || 'Failed to withdraw friend request' });
      }
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to withdraw friend request' });
    } finally {
      setActionInProgress(null);
    }
  };

  const getUserDetails = (userId: string): User | null => {
    return friendsList.find(f => f._id === userId) ||
      recommendedFriends.find(f => f._id === userId) ||
      { _id: userId, username: 'user', profilePic: '', fullName: 'Unknown User', unreadCount: 0, isOnboarded: true };
  };

  const filteredRequests = getRequestsForCurrentTab().filter(state => {
    const user = getUserDetails(state.userId);
    const matchesSearch = user?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user?.username?.toLowerCase().includes(searchQuery.toLowerCase());
    const isCorrectStatus = activeTab === 'received' ? state.status === 'pending-received' : state.status === 'pending-sent';
    return matchesSearch && isCorrectStatus;
  });

  const hasRequests = filteredRequests.length > 0;

  const getActionButtons = (state: { userId: string; status: string; requestId?: string }) => {
    const isProcessing = actionInProgress === state.userId;
    if (state.status === 'pending-received') {
      return (
        <div className="flex gap-2">
          <button className={`${actionBtn} bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25`} onClick={() => handleAcceptRequest(state.userId, state.requestId)} disabled={isProcessing}>
            <FiUserCheck size={12} /> {isProcessing ? 'Accepting...' : 'Accept'}
          </button>
          <button className={`${actionBtn} bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20`} onClick={() => handleRejectRequest(state.userId, state.requestId)} disabled={isProcessing}>
            <FiUserX size={12} /> {isProcessing ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      );
    } else if (state.status === 'pending-sent') {
      return (
        <button className={`${actionBtn} bg-white/10 border-white/20 text-white/80 hover:bg-white/15`} onClick={() => handleWithdrawRequest(state.userId, state.requestId)} disabled={isProcessing}>
          <FiUserX size={12} /> {isProcessing ? 'Withdrawing...' : 'Withdraw Request'}
        </button>
      );
    }
    return null;
  };

  const defaultUser = { _id: 'default', username: 'user', profilePic: '', fullName: 'User', unreadCount: 0, isOnboarded: true };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e1e2f] to-[#111117] relative overflow-x-hidden text-white">
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(128,90,213,0.3)] -top-32 -right-32 pointer-events-none" />
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(59,130,246,0.3)] -bottom-32 -left-32 [animation-delay:2s] pointer-events-none" />
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(45,212,191,0.25)] top-1/2 left-[60%] [animation-delay:4s] pointer-events-none" />

      <div className="relative z-[1] max-w-[1200px] mx-auto p-8 sm:p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 gap-8 sm:flex-col sm:mb-6 sm:gap-4">
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
                Friend Requests
              </h1>
              <p className="text-white/60 text-sm">
                Manage your incoming and outgoing friend requests
                {pendingCount > 0 && ` • ${pendingCount} pending`}
              </p>
            </div>
          </div>
          <div className="shrink-0" ref={userMenuRef}>
            <UserProfile
              currentUser={currentUser || defaultUser}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
              pendingFriendRequests={pendingCount}
              currentPage="my-requests"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 w-fit">
            {(['received', 'sent'] as TabType[]).map(tab => {
              const Icon = tab === 'received' ? FiUserPlus : FiUserCheck;
              const count = getRequestsForCurrentTab().filter(s =>
                tab === 'received' ? s.status === 'pending-received' : s.status === 'pending-sent'
              ).length;
              return (
                <button
                  key={tab}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border-0 capitalize ${
                    activeTab === tab ? 'bg-blue-500/20 text-white border border-blue-500/30' : 'text-white/60 bg-transparent hover:text-white hover:bg-white/10'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  <Icon size={14} />
                  {tab === 'received' ? 'Received' : 'Sent'}
                  <span className="ml-1 px-2 py-0.5 bg-white/10 rounded-full text-xs">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        {hasRequests && (
          <div className="mb-6">
            <div className="max-w-xl">
              <div className="relative flex items-center">
                <FiSearch className="absolute left-4 text-white/50 z-10 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder="Search by name or username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/50">
              <div className="w-8 h-8 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring" />
              <p>Loading friend requests...</p>
            </div>
          ) : !hasRequests ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-white/50 text-center">
              {activeTab === 'received' ? <FiUserPlus size={48} className="opacity-30" /> : <FiUserCheck size={48} className="opacity-30" />}
              <h3 className="text-lg font-semibold">{activeTab === 'received' ? 'No incoming requests' : 'No sent requests'}</h3>
              <p className="text-sm max-w-[300px]">
                {searchQuery
                  ? `No requests match "${searchQuery}"`
                  : activeTab === 'received' ? "You don't have any pending friend requests" : "You haven't sent any friend requests yet"
                }
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-2xl">
              {filteredRequests.map((state) => {
                const user = getUserDetails(state.userId);
                if (!user) return null;
                return (
                  <div key={state.userId} className="bg-white/[0.08] backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:bg-white/[0.12] hover:border-white/20 transition-all">
                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/20 shrink-0">
                          {user.profilePic ? (
                            <img src={user.profilePic} alt={user.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-sm">
                              {user.fullName?.charAt(0) || user.username?.charAt(0) || 'U'}
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-sm">{user.fullName || 'Unknown User'}</h4>
                          <p className="text-white/50 text-xs">@{user.username || 'user'}</p>
                        </div>
                      </div>
                      <div className="shrink-0">{getActionButtons(state)}</div>
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
