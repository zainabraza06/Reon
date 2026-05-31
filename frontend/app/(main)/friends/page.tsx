"use client";
import { useState, useEffect } from "react";
import { UserPlus, UserCheck, UserX, MessageSquare, Users } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { User, FriendRequest } from "@/types";

type Tab = "friends" | "discover" | "requests";

export default function FriendsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<User[]>([]);
  const [recommendations, setRecommendations] = useState<User[]>([]);
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fr, rec, reqs, sentReqs] = await Promise.all([
        api.friends.list(),
        api.friends.recommendations(),
        api.friends.received(),
        api.friends.sent(),
      ]);
      setFriends(fr.friends);
      setRecommendations(rec.users);
      setReceived(reqs.requests);
      setSent(sentReqs.requests);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const sendRequest = async (id: string) => {
    setPendingIds((p) => new Set(p).add(id));
    try {
      await api.friends.send(id);
      await loadAll();
    } catch {}
    setPendingIds((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const accept = async (id: string) => {
    await api.friends.accept(id).catch(() => {});
    loadAll();
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

  const TabBtn = ({ t, label, badge }: { t: Tab; label: string; badge?: number }) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5 ${
        tab === t
          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
          : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      {label}
      {badge ? (
        <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Friends</h1>
        <div className="flex gap-2 flex-wrap">
          <TabBtn t="friends" label={`Friends (${friends.length})`} />
          <TabBtn t="discover" label="Discover" />
          <TabBtn t="requests" label="Requests" badge={received.length || undefined} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && <div className="text-center text-gray-400 py-12">Loading…</div>}

        {/* Friends */}
        {!loading && tab === "friends" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {friends.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Users size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No friends yet. Discover people!</p>
              </div>
            )}
            {friends.map((f) => (
              <div key={f._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                <Avatar src={f.profilePic} name={f.fullName} size={44} />
                <div className="flex-1 overflow-hidden">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{f.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">@{f.username || f.email}</p>
                </div>
                <div className="flex gap-1">
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
                    title="Remove friend"
                  >
                    <UserX size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discover */}
        {!loading && tab === "discover" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recommendations.length === 0 && (
              <div className="col-span-full text-center py-16">
                <UserPlus size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No suggestions right now</p>
              </div>
            )}
            {recommendations.map((u) => {
              const hasSent = sent.find((r) => r.receiver._id === u._id || r.receiver === (u._id as unknown as typeof r.receiver));
              return (
                <div key={u._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                  <Avatar src={u.profilePic} name={u.fullName} size={44} />
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{u.fullName}</p>
                    <p className="text-xs text-gray-500 truncate">@{u.username || u.email}</p>
                  </div>
                  {hasSent ? (
                    <button
                      onClick={() => withdraw(hasSent._id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Withdraw
                    </button>
                  ) : (
                    <button
                      onClick={() => sendRequest(u._id)}
                      disabled={pendingIds.has(u._id)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <UserPlus size={13} />
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Requests */}
        {!loading && tab === "requests" && (
          <div className="space-y-6">
            {received.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Received ({received.length})</h3>
                <div className="space-y-2">
                  {received.map((r) => (
                    <div key={r._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                      <Avatar src={r.sender.profilePic} name={r.sender.fullName} size={44} />
                      <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{r.sender.fullName}</p>
                        <p className="text-xs text-gray-500">Sent you a friend request</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => accept(r._id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                        >
                          <UserCheck size={13} />
                          Accept
                        </button>
                        <button
                          onClick={() => reject(r._id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <UserX size={13} />
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sent.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Sent ({sent.length})</h3>
                <div className="space-y-2">
                  {sent.map((r) => (
                    <div key={r._id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                      <Avatar src={r.receiver.profilePic} name={r.receiver.fullName} size={44} />
                      <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{r.receiver.fullName}</p>
                        <p className="text-xs text-gray-500">Pending…</p>
                      </div>
                      <button
                        onClick={() => withdraw(r._id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Withdraw
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {received.length === 0 && sent.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-500 dark:text-gray-400">No pending requests</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
