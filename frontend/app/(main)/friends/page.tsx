"use client";
import { useState, useEffect } from "react";
import { UserPlus, UserCheck, UserX, MessageSquare, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { User, FriendRequest } from "@/types";

type Tab = "friends" | "requests";

export default function FriendsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<User[]>([]);
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
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

  const reject = async (id: string) => {
    await api.friends.reject(id).catch(() => {});
    loadAll();
  };

  const withdraw = async (id: string) => {
    await api.friends.withdraw(id).catch(() => {});
    loadAll();
  };

  const removeFriend = async (id: string) => {
    await api.friends.remove(id).catch(() => {});
    loadAll();
  };

  const requestCount = received.length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1">Friends</h1>
          <Link
            href="/recommendations"
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <UserPlus size={15} />
            Discover
          </Link>
        </div>
        <div className="flex gap-2">
          {(["friends", "requests"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === t
                  ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {t === "friends" ? `Friends (${friends.length})` : "Requests"}
              {t === "requests" && requestCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 font-bold">
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
              <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {/* Friends list */}
        {!loading && tab === "friends" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {friends.length === 0 ? (
              <div className="col-span-full flex flex-col items-center py-16 gap-3">
                <Users size={40} className="text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No friends yet</p>
                <Link href="/recommendations" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                  Discover people to add →
                </Link>
              </div>
            ) : (
              friends.map((f) => (
                <div key={f._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3.5">
                  <Avatar src={f.profilePic} name={f.fullName} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{f.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">@{f.username || f.email}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => router.push(`/chat/${f._id}`)}
                      className="p-2 rounded-full text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                      title="Message"
                    >
                      <MessageSquare size={16} />
                    </button>
                    <button
                      onClick={() => removeFriend(f._id)}
                      className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Remove"
                    >
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
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Received ({received.length})
                </h3>
                <div className="space-y-2">
                  {received.map((r) => (
                    <div key={r._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3.5">
                      <Avatar src={r.sender.profilePic} name={r.sender.fullName} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{r.sender.fullName}</p>
                        <p className="text-xs text-gray-400">Wants to connect</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => accept(r._id)}
                          disabled={pendingIds.has(r._id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
                        >
                          {pendingIds.has(r._id) ? (
                            <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin block" />
                          ) : (
                            <UserCheck size={13} />
                          )}
                          <span className="hidden sm:inline">Accept</span>
                        </button>
                        <button
                          onClick={() => reject(r._id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors"
                        >
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
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Sent ({sent.length})
                </h3>
                <div className="space-y-2">
                  {sent.map((r) => (
                    <div key={r._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3.5">
                      <Avatar src={r.receiver.profilePic} name={r.receiver.fullName} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{r.receiver.fullName}</p>
                        <p className="text-xs text-gray-400">Pending…</p>
                      </div>
                      <button
                        onClick={() => withdraw(r._id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        Withdraw
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {received.length === 0 && sent.length === 0 && (
              <div className="flex flex-col items-center py-16 gap-3">
                <p className="text-gray-500 dark:text-gray-400 text-sm">No pending requests</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
