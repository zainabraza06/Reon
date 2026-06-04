"use client";
import { useState, useEffect } from "react";
import { UserPlus, UserCheck, UserX, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { User, FriendRequest } from "@/types";

type Tab = "friends" | "requests";

export default function FriendsPage() {
  const router = useRouter();
  const [tab, setTab]         = useState<Tab>("friends");
  const [friends, setFriends] = useState<User[]>([]);
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [sent, setSent]         = useState<FriendRequest[]>([]);
  const [loading, setLoading]   = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fr, reqs, sentReqs] = await Promise.all([
        api.friends.list(),
        api.friends.received(),
        api.friends.sent(),
      ]);
      setFriends(fr.friends);
      setReceived(reqs.requests);
      setSent(sentReqs.requests);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const accept = async (id: string) => {
    setPendingIds((p) => new Set(p).add(id));
    await api.friends.accept(id).catch(() => {});
    await loadAll();
    setPendingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };
  const reject       = async (id: string) => { await api.friends.reject(id).catch(() => {}); loadAll(); };
  const withdraw     = async (id: string) => { await api.friends.withdraw(id).catch(() => {}); loadAll(); };
  const removeFriend = async (id: string) => { await api.friends.remove(id).catch(() => {}); loadAll(); };

  const requestCount = received.length;

  const cardCls = "flex items-center gap-3 bg-white dark:bg-[#1a1a3a] rounded-2xl p-3.5 shadow-sm dark:shadow-none";

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e]">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1">Friends</h1>
          <Link href="/recommendations"
            className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline">
            <UserPlus size={15} />Discover
          </Link>
        </div>
        <div className="flex gap-1.5">
          {(["friends", "requests"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                t === tab
                  ? "btn-gradient text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/6"
              }`}>
              {t === "friends" ? `Friends (${friends.length})` : "Requests"}
              {t === "requests" && requestCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] rounded-full min-w-4 h-4 flex items-center justify-center px-0.5 font-bold">
                  {requestCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {/* Friends */}
        {!loading && tab === "friends" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {friends.length === 0 ? (
              <div className="col-span-full flex flex-col items-center py-16 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
                  <Users size={26} className="text-violet-500" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No friends yet</p>
                <Link href="/recommendations" className="text-sm text-violet-600 dark:text-violet-400 font-semibold hover:underline">
                  Discover people to add →
                </Link>
              </div>
            ) : (
              friends.map((f) => (
                <div key={f._id} className={cardCls}>
                  <Avatar src={f.profilePic} name={f.fullName} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{f.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">@{f.username || f.email}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => router.push(`/chat/${f._id}`)} title="Message"
                      className="p-2 rounded-xl text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
                      <MessageSquare size={16} />
                    </button>
                    <button type="button" onClick={() => removeFriend(f._id)} title="Remove friend"
                      className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                      <UserX size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Requests */}
        {!loading && tab === "requests" && (
          <div className="space-y-6 max-w-lg mx-auto w-full">
            {received.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Received ({received.length})
                </h3>
                <div className="space-y-2">
                  {received.map((r) => (
                    <div key={r._id} className={cardCls}>
                      <Avatar src={r.sender.profilePic} name={r.sender.fullName} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{r.sender.fullName}</p>
                        <p className="text-xs text-gray-400">Wants to connect</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={() => accept(r._id)} disabled={pendingIds.has(r._id)}
                          className="btn-gradient flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50 font-semibold">
                          {pendingIds.has(r._id)
                            ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin block" />
                            : <UserCheck size={13} />}
                          <span className="hidden sm:inline">Accept</span>
                        </button>
                        <button type="button" onClick={() => reject(r._id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors">
                          <UserX size={13} />
                          <span className="hidden sm:inline">Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sent.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Sent ({sent.length})
                </h3>
                <div className="space-y-2">
                  {sent.map((r) => (
                    <div key={r._id} className={cardCls}>
                      <Avatar src={r.receiver.profilePic} name={r.receiver.fullName} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{r.receiver.fullName}</p>
                        <p className="text-xs text-gray-400">Pending…</p>
                      </div>
                      <button type="button" onClick={() => withdraw(r._id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors shrink-0">
                        Withdraw
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {received.length === 0 && sent.length === 0 && (
              <div className="flex flex-col items-center py-16 gap-2">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
                  <UserPlus size={26} className="text-violet-500" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No pending requests</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
