"use client";
import { use, useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import {
  ArrowLeft, Info, Users, Check, CheckCheck, X,
  Crown, Shield, ShieldOff, UserMinus, UserPlus, Pencil, Trash2, LogOut, Loader, AlertTriangle,
  Clock, AlertCircle, RotateCcw, Camera,
} from "lucide-react";

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a1a3a] rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${danger ? "bg-rose-100 dark:bg-rose-900/30" : "bg-violet-100 dark:bg-violet-900/30"}`}>
            <AlertTriangle size={18} className={danger ? "text-rose-500" : "text-violet-500"} />
          </div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm">{title}</p>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${
              danger ? "bg-rose-500 hover:bg-rose-600" : "btn-gradient"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import MessageInput from "@/components/chat/MessageInput";
import MessageInfoSheet from "@/components/chat/info/MessageInfoSheet";
import { useGroupMessages } from "@/hooks/useGroupMessages";
import { useAuth } from "@/context/AuthContext";
import { socketService } from "@/lib/socket";
import { api } from "@/lib/api";
import { encryptGroupText } from "@/lib/crypto";
import type { GroupChat, GroupMessage } from "@/types";

// ── Tick ───────────────────────────────────────────────────────────────────────

function GroupTick({ senderId, readBy, deliveredTo, memberCount }: {
  senderId: string;
  readBy?: { userId: string; at: string }[];
  deliveredTo?: { userId: string; at: string }[];
  memberCount: number;
}) {
  const others      = memberCount;
  const otherRead   = (readBy ?? []).filter((r) => r.userId !== senderId).length;
  const otherDel    = (deliveredTo ?? []).filter((r) => r.userId !== senderId).length;
  const allRead     = others > 0 && otherRead >= others;
  const anyDel      = otherDel > 0;

  if (allRead) return <CheckCheck size={13} className="text-cyan-300" />;
  if (anyDel)  return <CheckCheck size={13} className="text-white/60" />;
  return              <Check      size={13} className="text-white/45" />;
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function GroupMessageBubble({ message, isMine, memberCount, onInfoPress, onRetry }: {
  message: GroupMessage; isMine: boolean; memberCount: number; onInfoPress?: () => void; onRetry?: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // System messages render as centered pills
  if (message.contentType === "system") {
    return (
      <div className="flex justify-center my-1.5">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/6 px-3 py-1 rounded-full select-none">
          {message.plaintext || message.ciphertext}
        </span>
      </div>
    );
  }

  const time       = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text       = message.plaintext || message.ciphertext;
  const senderName = typeof message.sender === "object" ? message.sender.fullName : "";
  const senderId   = typeof message.sender === "object" ? message.sender._id : message.sender;
  const isSending  = message.status === "sending";
  const isFailed   = message.status === "failed";
  const canInfo    = isMine && !isSending && !isFailed;

  const handleTouchStart = () => {
    if (!canInfo || !onInfoPress) return;
    longPressTimer.current = setTimeout(() => onInfoPress(), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} mb-1`}>
      {!isMine && (
        <div className="flex items-center gap-2 mb-0.5 ml-2">
          <Avatar
            src={typeof message.sender === "object" ? message.sender.profilePic : ""}
            name={senderName} size={20}
          />
          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">{senderName}</span>
        </div>
      )}
      <div
        onContextMenu={(e) => { if (!canInfo || !onInfoPress) return; e.preventDefault(); onInfoPress(); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        className={`relative max-w-[70%] rounded-2xl px-4 py-2 shadow-sm select-none transition-opacity ${
          isSending ? "opacity-60" : ""
        } ${isMine ? "cursor-context-menu" : ""} ${
          isMine
            ? "bubble-gradient text-white rounded-br-sm shadow-violet-500/20"
            : "bg-white dark:bg-[#1a1a3a] text-gray-900 dark:text-gray-100 rounded-bl-sm"
        }`}
      >
        {text && <p className="text-sm whitespace-pre-wrap wrap-break-word leading-normal">{text}</p>}
        {message.media && message.media.length > 0 && (
          <p className="text-xs italic opacity-70">[{message.media[0].type} attachment]</p>
        )}
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMine ? "text-white/55" : "text-gray-400"}`}>
          <span className="text-[11px]">{time}</span>
          {isMine && (
            isSending ? <Clock size={12} className="text-white/40 animate-pulse" /> :
            isFailed  ? <AlertCircle size={12} className="text-rose-300" /> :
            <GroupTick senderId={senderId} readBy={message.readBy} deliveredTo={message.deliveredTo} memberCount={memberCount} />
          )}
        </div>
      </div>
      {isFailed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-500 mt-0.5 mr-1 transition-colors"
        >
          <RotateCcw size={11} /> Retry
        </button>
      )}
    </div>
  );
}

// ── Info panel ─────────────────────────────────────────────────────────────────

function GroupInfoPanel({
  group, myId, onClose, onGroupUpdated, onGroupLeft,
}: {
  group: GroupChat | null;
  myId: string;
  onClose: () => void;
  onGroupUpdated: (g: GroupChat) => void;
  onGroupLeft: () => void;
}) {
  const router = useRouter();
  const amAdmin   = group ? group.admins.some((a) => a._id === myId) : false;
  const amCreator = group ? group.creator._id === myId : false;

  // Edit mode
  const [editing, setEditing]   = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr]   = useState("");

  // Add members
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [friends, setFriends]               = useState<import("@/types").User[]>([]);
  const [addSelected, setAddSelected]       = useState<Set<string>>(new Set());
  const [addSaving, setAddSaving]           = useState(false);

  // Busy state per member action
  const [busyMember, setBusyMember] = useState<string | null>(null);

  // Avatar upload
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !group) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const { group: updated } = await api.groups.updateAvatar(group._id, fd);
      onGroupUpdated(updated);
    } catch (err) {
      console.error("updateGroupAvatar error:", err);
    } finally {
      setAvatarUploading(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };

  // Confirm dialog
  const [confirm, setConfirm] = useState<{
    title: string; message: string; confirmLabel: string; danger: boolean; onConfirm: () => void;
  } | null>(null);

  const askConfirm = (opts: typeof confirm) => setConfirm(opts);

  const openEdit = () => {
    if (!group) return;
    setEditName(group.name);
    setEditDesc(group.description ?? "");
    setEditErr("");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!group || !editName.trim()) { setEditErr("Name cannot be empty"); return; }
    setEditSaving(true);
    setEditErr("");
    try {
      const { group: updated } = await api.groups.update(group._id, { name: editName.trim(), description: editDesc.trim() });
      onGroupUpdated(updated);
      setEditing(false);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  };

  const loadFriends = useCallback(async () => {
    if (!group) return;
    const { friends: all } = await api.friends.list({ limit: 1000 });
    const memberIds = new Set(group.members.map((m) => m.user._id));
    setFriends(all.filter((f) => !memberIds.has(f._id)));
  }, [group]);

  const openAddMembers = () => {
    setAddSelected(new Set());
    loadFriends().catch(() => {});
    setShowAddMembers(true);
  };

  const saveAddMembers = async () => {
    if (!group || addSelected.size === 0) return;
    setAddSaving(true);
    try {
      const { group: updated } = await api.groups.addMembers(group._id, Array.from(addSelected));
      onGroupUpdated(updated);
      setShowAddMembers(false);
    } catch (err) {
      console.error("addMembers error:", err);
    } finally {
      setAddSaving(false);
    }
  };

  const removeMember = (memberId: string, isSelf: boolean) => {
    if (!group) return;
    askConfirm({
      title: isSelf ? "Leave Group" : "Remove Member",
      message: isSelf ? "Are you sure you want to leave this group?" : "Remove this member from the group?",
      confirmLabel: isSelf ? "Leave" : "Remove",
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        setBusyMember(memberId);
        try {
          await api.groups.removeMember(group._id, memberId);
          if (isSelf) { onGroupLeft(); return; }
          const { group: updated } = await api.groups.get(group._id);
          onGroupUpdated(updated);
        } catch (err) {
          console.error("removeMember error:", err);
        } finally {
          setBusyMember(null);
        }
      },
    });
  };

  const promoteAdmin = async (memberId: string) => {
    if (!group) return;
    setBusyMember(memberId);
    try {
      const { group: updated } = await api.groups.promoteAdmin(group._id, memberId);
      onGroupUpdated(updated);
    } catch (err) {
      console.error("promoteAdmin error:", err);
    } finally {
      setBusyMember(null);
    }
  };

  const deleteGroup = () => {
    if (!group) return;
    askConfirm({
      title: "Delete Group",
      message: `Delete "${group.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.groups.delete(group._id);
          router.replace("/chat");
        } catch (err) {
          console.error("deleteGroup error:", err);
        }
      },
    });
  };

  const confirmDialog = confirm && (
    <ConfirmDialog
      title={confirm.title}
      message={confirm.message}
      confirmLabel={confirm.confirmLabel}
      danger={confirm.danger}
      onConfirm={confirm.onConfirm}
      onCancel={() => setConfirm(null)}
    />
  );

  // Loading skeleton
  if (!group) {
    return (
      <div className="fixed inset-0 z-30 md:static md:z-auto md:h-full md:w-72 border-l border-gray-200 dark:border-white/6 bg-white dark:bg-[#0f0f28] flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-white/6">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Group Info</span>
          <button type="button" title="Close" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader size={24} className="text-violet-500 animate-spin" />
        </div>
      </div>
    );
  }

  // Add-members sheet
  if (showAddMembers) {
    return (
      <div className="fixed inset-0 z-30 md:static md:z-auto md:h-full md:w-72 border-l border-gray-200 dark:border-white/6 bg-white dark:bg-[#0f0f28] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100 dark:border-white/6">
          <button type="button" title="Back" onClick={() => setShowAddMembers(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Add Members</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {friends.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">All your friends are already in this group</p>
          )}
          {friends.map((f) => (
            <button
              key={f._id}
              type="button"
              onClick={() => setAddSelected((prev) => {
                const next = new Set(prev);
                next.has(f._id) ? next.delete(f._id) : next.add(f._id);
                return next;
              })}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <Avatar src={f.profilePic} name={f.fullName} size={32} />
              <span className="flex-1 text-left text-sm text-gray-900 dark:text-white">{f.fullName}</span>
              {addSelected.has(f._id) && <Check size={14} className="text-violet-500" />}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-100 dark:border-white/6">
          <button
            type="button"
            onClick={saveAddMembers}
            disabled={addSelected.size === 0 || addSaving}
            className="w-full btn-gradient py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
          >
            {addSaving ? "Adding…" : `Add ${addSelected.size > 0 ? addSelected.size : ""} Member${addSelected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    {confirmDialog}
    <div className="fixed inset-0 z-30 md:static md:z-auto md:h-full md:w-72 border-l border-gray-200 dark:border-white/6 bg-white dark:bg-[#0f0f28] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/6 shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Group Info</span>
        <button type="button" title="Close" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group identity */}
        <div className="px-4 py-5 border-b border-gray-100 dark:border-white/6">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar src={group.avatar} name={group.name} size={64} />
              {amAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => avatarFileRef.current?.click()}
                    disabled={avatarUploading}
                    title="Change group picture"
                    className="absolute -bottom-1 -right-1 w-6 h-6 btn-gradient rounded-full flex items-center justify-center text-white shadow-md disabled:opacity-50"
                  >
                    {avatarUploading ? <Loader size={10} className="animate-spin" /> : <Camera size={10} />}
                  </button>
                  <input ref={avatarFileRef} type="file" accept="image/*" aria-label="Change group picture" className="hidden" onChange={handleAvatarChange} />
                </>
              )}
            </div>
            {editing ? (
              <div className="w-full space-y-2">
                <input
                  aria-label="Group name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Group name"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a3a] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <textarea
                  aria-label="Group description"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a3a] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                {editErr && <p className="text-xs text-rose-500 dark:text-rose-400">{editErr}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={saveEdit} disabled={editSaving}
                    className="flex-1 btn-gradient py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)}
                    className="flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs text-gray-600 dark:text-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="font-semibold text-gray-900 dark:text-white">{group.name}</p>
                  {group.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>
                  )}
                </div>
                {amAdmin && (
                  <button type="button" onClick={openEdit}
                    className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline">
                    <Pencil size={12} /> Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Members */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {group.members.length} Members
              </span>
            </div>
            {amAdmin && (
              <button type="button" onClick={openAddMembers}
                className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline">
                <UserPlus size={12} /> Add
              </button>
            )}
          </div>

          <ul className="space-y-0.5">
            {group.members.map((m) => {
              const isThisAdmin   = group.admins.some((a) => a._id === m.user._id);
              const isThisCreator = group.creator._id === m.user._id;
              const isSelf        = m.user._id === myId;
              const busy          = busyMember === m.user._id;

              // What actions are available?
              const canRemove  = amAdmin   && !isSelf && !isThisCreator;
              const canPromote = amCreator && !isThisAdmin && !isSelf;
              const canDemote  = amCreator && isThisAdmin  && !isThisCreator && !isSelf;

              return (
                <li key={m.user._id} className="flex items-center gap-2 px-1 py-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/4 group/member">
                  <Avatar src={m.user.profilePic} name={m.user.fullName} size={30} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {m.user.fullName}{isSelf ? " (you)" : ""}
                    </p>
                  </div>
                  {(isThisCreator || isThisAdmin) && (
                    <span className="flex items-center gap-0.5 text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                      {isThisCreator ? <><Crown size={9}/> Creator</> : <><Shield size={9}/> Admin</>}
                    </span>
                  )}
                  {busy && <Loader size={14} className="text-violet-400 animate-spin shrink-0" />}
                  {!busy && (canRemove || canPromote || canDemote) && (
                    <div className="hidden group-hover/member:flex items-center gap-1 shrink-0">
                      {canPromote && (
                        <button type="button" onClick={() => promoteAdmin(m.user._id)}
                          title="Make admin"
                          className="p-1 rounded-lg text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">
                          <Shield size={13} />
                        </button>
                      )}
                      {canDemote && (
                        <button type="button" onClick={() => promoteAdmin(m.user._id)}
                          title="Remove admin"
                          className="p-1 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors">
                          <ShieldOff size={13} />
                        </button>
                      )}
                      {canRemove && (
                        <button type="button" onClick={() => removeMember(m.user._id, false)}
                          title="Remove from group"
                          className="p-1 rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-400/10 transition-colors">
                          <UserMinus size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-white/6 space-y-2 shrink-0">
        {/* Leave group — everyone including creator can leave */}
        <button
          type="button"
          onClick={() => removeMember(myId, true)}
          disabled={!!busyMember}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-rose-200 dark:border-rose-400/20 text-rose-500 dark:text-rose-400 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-400/10 disabled:opacity-50 transition-colors"
        >
          <LogOut size={15} />
          Leave Group
        </button>

        {/* Delete group — creator only */}
        {amCreator && (
          <button
            type="button"
            onClick={deleteGroup}
            disabled={!!busyMember}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Trash2 size={15} />
            Delete Group
          </button>
        )}
      </div>
    </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId }     = use(params);
  const { user: me }    = useAuth();
  const router          = useRouter();
  const { messages, loading, hasMore, loadMore, setMessages } = useGroupMessages(groupId, me?._id ?? null);
  const [group, setGroup]       = useState<GroupChat | null>(null);
  const [groupErr, setGroupErr] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [infoMsgId, setInfoMsgId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchGroup = useCallback(() => {
    setGroupErr(false);
    api.groups.get(groupId)
      .then(({ group: g }) => setGroup(g))
      .catch(() => setGroupErr(true));
  }, [groupId]);

  useEffect(() => { void fetchGroup(); }, [fetchGroup]);

  useEffect(() => {
    const onTyping = (data: unknown) => {
      const { groupId: gid, userId: uid, isTyping } = data as { groupId: string; userId: string; isTyping: boolean };
      if (gid !== groupId || uid === me?._id) return;
      setTypingUsers((prev) => isTyping ? [...new Set([...prev, uid])] : prev.filter((u) => u !== uid));
    };
    const onUpdated = (data: unknown) => {
      const { group: g } = data as { group: GroupChat };
      if (g._id === groupId) setGroup(g);
    };
    const onMemberLeft = (data: unknown) => {
      const { groupId: gid } = data as { groupId: string };
      if (gid === groupId) fetchGroup();
    };
    socketService.on("group-user-typing",   onTyping);
    socketService.on("group-updated",       onUpdated);
    socketService.on("group-member-left",   onMemberLeft);
    socketService.on("group-removed",       onMemberLeft);
    return () => {
      socketService.off("group-user-typing",  onTyping);
      socketService.off("group-updated",      onUpdated);
      socketService.off("group-member-left",  onMemberLeft);
      socketService.off("group-removed",      onMemberLeft);
    };
  }, [groupId, me?._id, fetchGroup]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string, files: File[]) => {
    if (!me || !group) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    // Add optimistic bubble immediately so user sees their message right away
    setMessages((prev) => [
      ...prev,
      {
        _id: tempId,
        tempId,
        groupId,
        sender: me,
        plaintext: text || undefined,
        contentType: (files.length > 0 ? "document" : "text") as GroupMessage["contentType"],
        sentAt: now,
        status: "sending" as const,
        readBy:      [{ userId: me._id, at: now }],
        deliveredTo: [{ userId: me._id, at: now }],
      },
    ]);

    // Fire the actual API call in the background so the input re-enables immediately
    void (async () => {
      try {
        const memberKeys: { userId: string; publicKey: JsonWebKey }[] = [];
        for (const m of group.members) {
          try {
            const { publicKey } = await api.keys.get(m.user._id);
            memberKeys.push({ userId: m.user._id, publicKey: publicKey as JsonWebKey });
          } catch {}
        }

        const fd = new FormData();
        const msgData: Record<string, unknown> = { contentType: files.length > 0 ? "document" : "text" };

        if (text && memberKeys.length > 0) {
          const enc = await encryptGroupText(text, memberKeys);
          msgData.ciphertext = enc.ciphertext;
          msgData.memberKeys = enc.memberKeys;
        } else if (text) {
          msgData.ciphertext = text;
          msgData.memberKeys = [];
        }
        msgData.mediaKeys = files.map(() => ({}));
        for (const file of files) fd.append("files", file, file.name);
        fd.append("data", JSON.stringify(msgData));

        const { message } = await api.groups.sendMessage(groupId, fd) as { message: GroupMessage };

        // Replace optimistic with confirmed message (plaintext already known from local `text`)
        setMessages((prev) => {
          const without = prev.filter((m) => m.tempId !== tempId && m._id !== message._id);
          return [...without, { ...message, plaintext: text || undefined }];
        });
      } catch (err) {
        console.error("sendGroupMessage error:", err);
        setMessages((prev) =>
          prev.map((m) => m.tempId === tempId ? { ...m, status: "failed" as const } : m)
        );
      }
    })();
  };

  const handleRetry = (msg: GroupMessage) => {
    setMessages((prev) => prev.filter((m) => m.tempId !== msg.tempId && m._id !== msg._id));
    if (msg.plaintext) void sendMessage(msg.plaintext, []);
  };

  const handleTyping = (t: boolean) => {
    if (t) socketService.emit("group-typing-start", { groupId });
    else   socketService.emit("group-typing-stop",  { groupId });
  };

  if (!me) return null;

  return (
    <div className="flex flex-col h-full bg-[#eef2ff] dark:bg-[#080816]">
      {/* Header */}
      <div className="chat-header flex items-center gap-3 px-4 py-2.5 shrink-0 shadow-sm">
        <Link href="/chat" className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-white/6 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <Avatar src={group?.avatar} name={group?.name ?? "…"} size={40} />
        <div className="flex-1 min-w-0">
          {group ? (
            <>
              <p className="font-semibold text-gray-900 dark:text-white text-[15px] truncate">{group.name}</p>
              <p className="text-xs text-gray-400">{group.members.length} members</p>
            </>
          ) : groupErr ? (
            <>
              <p className="font-semibold text-gray-900 dark:text-white text-[15px]">Group</p>
              <button type="button" onClick={fetchGroup} className="text-xs text-rose-400 dark:text-rose-500 hover:underline">Failed to load · retry</button>
            </>
          ) : (
            <>
              <div className="h-4 w-28 bg-gray-200 dark:bg-white/10 rounded animate-pulse mb-1" />
              <div className="h-3 w-16 bg-gray-200 dark:bg-white/10 rounded animate-pulse" />
            </>
          )}
        </div>
        <button
          type="button"
          title="Group info"
          onClick={() => setShowInfo((v) => !v)}
          className={`p-2.5 sm:p-2 rounded-xl transition-colors touch-manipulation ${showInfo ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" : "text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"}`}
        >
          <Info size={20} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-1 chat-bg">
            {hasMore && (
              <div className="text-center mb-3">
                <button type="button" onClick={loadMore} disabled={loading}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline bg-white dark:bg-[#1a1a3a] px-3 py-1.5 rounded-full shadow-sm disabled:opacity-50 transition-colors">
                  {loading ? "Loading…" : "Load earlier"}
                </button>
              </div>
            )}

            {infoMsgId && (
              <MessageInfoSheet messageId={infoMsgId} type="group" onClose={() => setInfoMsgId(null)} />
            )}

            {messages.map((msg) => {
              const isMine = typeof msg.sender === "object" ? msg.sender._id === me._id : msg.sender === me._id;
              return (
                <GroupMessageBubble
                  key={msg.tempId ?? msg._id}
                  message={msg}
                  isMine={isMine}
                  memberCount={(group?.members.length ?? 2) - 1}
                  onInfoPress={isMine && !msg.status ? () => setInfoMsgId(msg._id) : undefined}
                  onRetry={isMine && msg.status === "failed" ? () => handleRetry(msg) : undefined}
                />
              );
            })}

            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-1 pl-1">
                <div className="bg-white dark:bg-[#1a1a3a] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <MessageInput
            onSend={sendMessage}
            onTyping={handleTyping}
            placeholder={`Message ${group?.name ?? "group"}`}
          />
        </div>

        {/* Info panel — slides in from the right */}
        {showInfo && (
          <>
            {/* Mobile backdrop — tap to close */}
            <div
              className="fixed inset-0 z-20 md:hidden bg-black/40 backdrop-blur-[2px]"
              onClick={() => setShowInfo(false)}
            />
            <GroupInfoPanel
              group={group}
              myId={me._id}
              onClose={() => setShowInfo(false)}
              onGroupUpdated={(g) => setGroup(g)}
              onGroupLeft={() => router.replace("/chat")}
            />
          </>
        )}
      </div>
    </div>
  );
}
