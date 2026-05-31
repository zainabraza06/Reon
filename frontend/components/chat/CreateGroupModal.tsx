"use client";
import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import type { User } from "@/types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateGroupModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [friends, setFriends] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.friends.list().then(({ friends }) => setFriends(friends)).catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim()) { setError("Group name is required"); return; }
    if (selected.size === 0) { setError("Select at least one member"); return; }
    setLoading(true);
    setError("");
    try {
      await api.groups.create({ name: name.trim(), description, memberIds: Array.from(selected) });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Group</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dev Team"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Add Members ({selected.size} selected)
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-gray-200 dark:border-gray-700 p-2">
              {friends.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">No friends to add</p>
              )}
              {friends.map((f) => (
                <button
                  key={f._id}
                  onClick={() => toggle(f._id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Avatar src={f.profilePic} name={f.fullName} size={32} />
                  <span className="flex-1 text-left text-sm text-gray-900 dark:text-gray-100">{f.fullName}</span>
                  {selected.has(f._id) && <Check size={16} className="text-indigo-600" />}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating…" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
