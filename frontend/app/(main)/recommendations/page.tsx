"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Search, UserPlus, UserCheck, UserX, Users, MapPin, Globe } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import type { RecommendedUser, FriendRequest } from "@/types";

const PAGE_SIZE = 12;

export default function RecommendationsPage() {
  const [users, setUsers] = useState<RecommendedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchPage = useCallback(async (p: number, q: string, replace: boolean) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const [res, sentRes] = await Promise.all([
        api.friends.recommendations({ search: q, page: p, limit: PAGE_SIZE }),
        p === 1 ? api.friends.sent() : Promise.resolve(null),
      ]);
      if (replace) setUsers(res.recommended);
      else setUsers((prev) => [...prev, ...res.recommended]);
      setTotal(res.total);
      if (sentRes) setSentRequests(sentRes.requests);
    } catch (err) {
      console.error("Recommendations fetch error:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchPage(1, debouncedSearch, true);
  }, [debouncedSearch, fetchPage]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, debouncedSearch, false);
  };

  const sendRequest = async (userId: string) => {
    setPendingIds((p) => new Set(p).add(userId));
    try {
      await api.friends.send(userId);
      setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, friendRequestSent: true } : u));
      setSentRequests((prev) => [...prev, {
        _id: `temp-${userId}`,
        sender: {} as import("@/types").User,
        receiver: { _id: userId } as import("@/types").User,
        status: "pending",
        createdAt: new Date().toISOString(),
      }]);
    } catch (err) {
      console.error("Send request error:", err);
    } finally {
      setPendingIds((p) => { const n = new Set(p); n.delete(userId); return n; });
    }
  };

  const withdrawRequest = async (userId: string) => {
    const req = sentRequests.find((r) =>
      (typeof r.receiver === "object" ? r.receiver._id : r.receiver) === userId
    );
    if (!req) return;
    try {
      await api.friends.withdraw(req._id);
      setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, friendRequestSent: false } : u));
      setSentRequests((prev) => prev.filter((r) => r._id !== req._id));
    } catch {}
  };

  const acceptRequest = async (userId: string) => {
    const req = await api.friends.received()
      .then((r) => r.requests.find((rq) => (typeof rq.sender === "object" ? rq.sender._id : rq.sender) === userId))
      .catch(() => null);
    if (!req) return;
    try {
      await api.friends.accept(req._id);
      setUsers((prev) => prev.filter((u) => u._id !== userId));
    } catch {}
  };

  useEffect(() => {
    const onAccepted = (data: unknown) => {
      const { receiverId } = data as { receiverId: string };
      setUsers((prev) => prev.filter((u) => u._id !== receiverId));
    };
    socketService.on("friend-request-accepted", onAccepted);
    socketService.on("friend-request-accepted-realtime", onAccepted);
    return () => {
      socketService.off("friend-request-accepted", onAccepted);
      socketService.off("friend-request-accepted-realtime", onAccepted);
    };
  }, []);

  const hasMore = users.length < total;

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e]">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
            <Users size={18} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Discover People</h1>
            <p className="text-xs text-gray-400">
              {total > 0 ? `${total} people to connect with` : "Find new people to connect with"}
            </p>
          </div>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/6 bg-white dark:bg-[#12122e] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center mb-4">
              <UserPlus size={28} className="text-violet-500" />
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium">
              {debouncedSearch ? `No results for "${debouncedSearch}"` : "No suggestions right now"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {debouncedSearch ? "Try a different search term" : "Check back later"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.map((u) => (
                <UserCard
                  key={u._id}
                  user={u}
                  sentRequests={sentRequests}
                  isPending={pendingIds.has(u._id)}
                  onAdd={() => sendRequest(u._id)}
                  onWithdraw={() => withdrawRequest(u._id)}
                  onAccept={() => acceptRequest(u._id)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 text-sm font-semibold hover:bg-violet-100 dark:hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Loading…" : `Load more (${total - users.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UserCard({
  user, sentRequests, isPending, onAdd, onWithdraw, onAccept,
}: {
  user: RecommendedUser;
  sentRequests: FriendRequest[];
  isPending: boolean;
  onAdd: () => void;
  onWithdraw: () => void;
  onAccept: () => void;
}) {
  const hasSent     = user.friendRequestSent || sentRequests.some((r) =>
    (typeof r.receiver === "object" ? r.receiver._id : r.receiver) === user._id);
  const hasReceived = user.friendRequestReceived;

  return (
    <div className="flex items-center gap-3 bg-white dark:bg-[#1a1a3a] rounded-2xl p-3.5 hover:bg-gray-50 dark:hover:bg-[#1e1e42] transition-colors shadow-sm dark:shadow-none">
      <Avatar src={user.profilePic} name={user.fullName} size={46} />

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{user.fullName}</p>
        {user.username && <p className="text-xs text-gray-400 truncate">@{user.username}</p>}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {user.location && (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
              <MapPin size={10} />{user.location}
            </span>
          )}
          {user.nativeLanguage && (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
              <Globe size={10} />{user.nativeLanguage}
            </span>
          )}
          {(user.mutualFriendsCount ?? 0) > 0 && (
            <span className="text-[11px] text-violet-500 dark:text-violet-400 font-medium">
              {user.mutualFriendsCount} mutual
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {hasReceived ? (
          <button type="button" onClick={onAccept}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold">
            <UserCheck size={13} />Accept
          </button>
        ) : hasSent ? (
          <button type="button" onClick={onWithdraw}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors">
            Sent ✓
          </button>
        ) : (
          <button type="button" onClick={onAdd} disabled={isPending}
            className="btn-gradient flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-all font-semibold">
            {isPending
              ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin block" />
              : <UserPlus size={13} />}
            Add
          </button>
        )}
      </div>
    </div>
  );
}
