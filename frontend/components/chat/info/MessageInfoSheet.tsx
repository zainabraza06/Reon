"use client";
import { useEffect, useState, useRef } from "react";
import { X, CheckCheck, Check, Clock } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import type { PersonalMessageInfo, GroupMessageInfo } from "@/types";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${date} at ${time}`;
}

function Row({ icon, label, sub, avatarSrc, avatarName }: {
  icon: React.ReactNode;
  label: string;
  sub?: string | null;
  avatarSrc?: string;
  avatarName?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      {avatarName !== undefined
        ? <Avatar src={avatarSrc} name={avatarName} size={38} />
        : <div className="w-9 h-9 flex items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/10 shrink-0">{icon}</div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {avatarName === undefined && sub && <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-2">{sub}</span>}
    </div>
  );
}

// ── Personal chat message info ─────────────────────────────────────────────────

function PersonalInfo({ messageId }: { messageId: string }) {
  const [info, setInfo] = useState<PersonalMessageInfo | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.messages.info(messageId)
      .then(setInfo)
      .catch(() => setErr("Could not load message info."));
  }, [messageId]);

  if (err) return <p className="text-sm text-red-500 py-4 text-center">{err}</p>;
  if (!info) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  );

  const sentFmt      = fmt(info.sentAt);
  const deliveredFmt = fmt(info.deliveredAt);
  const readFmt      = fmt(info.readAt);

  return (
    <div className="divide-y divide-gray-100 dark:divide-white/6">
      {/* Sent */}
      <Row icon={<Clock size={16} className="text-gray-400" />} label="Sent" sub={sentFmt} />

      {/* Delivered */}
      <div className="flex items-center gap-3 py-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/6 shrink-0">
          <CheckCheck size={16} className="text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Delivered</p>
          {deliveredFmt
            ? <p className="text-xs text-gray-400 mt-0.5">{deliveredFmt}</p>
            : <p className="text-xs text-gray-400 mt-0.5">Not delivered yet</p>}
        </div>
        <Avatar src={info.receiver.profilePic} name={info.receiver.fullName} size={32} />
      </div>

      {/* Read */}
      <div className="flex items-center gap-3 py-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-full bg-cyan-50 dark:bg-cyan-500/10 shrink-0">
          <CheckCheck size={16} className="text-cyan-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Read</p>
          {readFmt
            ? <p className="text-xs text-gray-400 mt-0.5">{readFmt}</p>
            : <p className="text-xs text-gray-400 mt-0.5">Not read yet</p>}
        </div>
        {info.read && <Avatar src={info.receiver.profilePic} name={info.receiver.fullName} size={32} />}
      </div>
    </div>
  );
}

// ── Group message info ─────────────────────────────────────────────────────────

function GroupInfo({ messageId }: { messageId: string }) {
  const [info, setInfo] = useState<GroupMessageInfo | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.groups.messageInfo(messageId)
      .then(setInfo)
      .catch(() => setErr("Could not load message info."));
  }, [messageId]);

  if (err) return <p className="text-sm text-red-500 py-4 text-center">{err}</p>;
  if (!info) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div>
      {info.readBy.length > 0 && (
        <section className="mb-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <CheckCheck size={12} className="text-cyan-400" /> Read by {info.readBy.length}
          </p>
          <div className="divide-y divide-gray-100 dark:divide-white/6">
            {info.readBy.map((r) => (
              <Row
                key={r.user._id}
                icon={<></>}
                label={r.user.fullName}
                sub={fmt(r.at)}
                avatarSrc={r.user.profilePic}
                avatarName={r.user.fullName}
              />
            ))}
          </div>
        </section>
      )}

      {info.deliveredTo.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5 mt-3">
            <Check size={12} className="text-gray-400" /> Delivered to {info.deliveredTo.length}
          </p>
          <div className="divide-y divide-gray-100 dark:divide-white/6">
            {info.deliveredTo.map((d) => (
              <Row
                key={d.user._id}
                icon={<></>}
                label={d.user.fullName}
                sub={fmt(d.at)}
                avatarSrc={d.user.profilePic}
                avatarName={d.user.fullName}
              />
            ))}
          </div>
        </section>
      )}

      {info.readBy.length === 0 && info.deliveredTo.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">Not delivered to anyone yet</p>
      )}
    </div>
  );
}

// ── Sheet shell (slide-up panel) ───────────────────────────────────────────────

interface Props {
  messageId: string;
  type: "personal" | "group";
  onClose: () => void;
}

export default function MessageInfoSheet({ messageId, type, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#12122e] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/6 shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">Message Info</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-2">
          {type === "personal"
            ? <PersonalInfo messageId={messageId} />
            : <GroupInfo    messageId={messageId} />
          }
        </div>
      </div>
    </div>
  );
}
