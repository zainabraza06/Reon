"use client";
import { useState, useRef, useCallback } from "react";
import { Check, CheckCheck, Download, FileText, Play, Pause, RotateCcw, Phone, Video, PhoneMissed, Clock, AlertCircle } from "lucide-react";
import type { Message, MediaFile } from "@/types";
import { decryptFile, getStoredPrivateKey } from "@/lib/crypto";
import MessageInfoSheet from "@/components/chat/info/MessageInfoSheet";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001/api").replace(/\/api$/, "");

interface Props {
  message: Message;
  isMine: boolean;
  onRetry?: () => void;
}

function Tick({ status, deliveredAt, readAt, sentAt }: {
  status?: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  sentAt?: string;
}) {
  const fmt = (d?: string | null) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  let title = "";
  if (status === "read" && readAt)           title = `Read at ${fmt(readAt)}`;
  else if (status === "delivered" && deliveredAt) title = `Delivered at ${fmt(deliveredAt)}`;
  else if (sentAt)                            title = `Sent at ${fmt(sentAt)}`;

  let icon: React.ReactNode;
  if (status === "sending")   icon = <Clock       size={12} className="text-white/50 animate-pulse" />;
  else if (status === "failed") icon = <AlertCircle size={12} className="text-red-300" />;
  else if (status === "read") icon = <CheckCheck  size={12} className="text-cyan-300" />;
  else if (status === "delivered") icon = <CheckCheck size={12} className="text-white/60" />;
  else                        icon = <Check size={12} className="text-white/50" />;

  return <span title={title} className="cursor-default">{icon}</span>;
}

async function fetchAndDecrypt(url: string, key?: string, iv?: string): Promise<string | null> {
  try {
    const pk = await getStoredPrivateKey();
    if (!pk) return null;
    const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
    const res = await fetch(fullUrl, { credentials: "include" });
    if (!res.ok) return null;
    const encIv = res.headers.get("X-Encryption-IV") ?? iv ?? "";
    const buf = await res.arrayBuffer();
    if (key && encIv) {
      const plain = await decryptFile(buf, key, encIv, pk);
      return URL.createObjectURL(new Blob([plain]));
    }
    return URL.createObjectURL(new Blob([buf]));
  } catch { return null; }
}

function VoiceNote({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(
    file.isEncrypted === false || !file.encryptedKey ? file.url : null
  );
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement>(null);

  const toggle = async () => {
    let src = url;
    if (!src) {
      setBusy(true);
      src = await fetchAndDecrypt(file.url, file.encryptedKey, file.encryptionIV);
      setBusy(false);
      if (!src) return;
      setUrl(src);
    }
    const a = ref.current!;
    if (!a.src) a.src = src;
    if (a.paused) { a.play(); setPlaying(true); }
    else          { a.pause(); setPlaying(false); }
  };

  const BAR_H: Record<number, string> = {
    5: "h-[5px]", 6: "h-[6px]", 7: "h-[7px]", 8: "h-[8px]",
    9: "h-[9px]", 10: "h-[10px]", 11: "h-[11px]", 12: "h-[12px]",
    13: "h-[13px]", 14: "h-[14px]", 16: "h-[16px]",
  };
  const BAR_DELAY: Record<number, string> = {
    0: "", 1: "[animation-delay:50ms]", 2: "[animation-delay:100ms]",
    3: "[animation-delay:150ms]", 4: "[animation-delay:200ms]",
    5: "[animation-delay:250ms]", 6: "[animation-delay:300ms]",
    7: "[animation-delay:350ms]", 8: "[animation-delay:400ms]",
    9: "[animation-delay:450ms]", 10: "[animation-delay:500ms]",
    11: "[animation-delay:550ms]", 12: "[animation-delay:600ms]",
    13: "[animation-delay:650ms]", 14: "[animation-delay:700ms]",
    15: "[animation-delay:750ms]", 16: "[animation-delay:800ms]",
    17: "[animation-delay:850ms]", 18: "[animation-delay:900ms]",
    19: "[animation-delay:950ms]",
  };
  const bars = [5, 9, 14, 10, 16, 11, 7, 13, 9, 6, 12, 14, 8, 11, 6, 10, 8, 14, 9, 6];

  return (
    <div className="flex items-center gap-3 min-w-[190px] py-0.5">
      <button type="button" onClick={toggle} disabled={busy}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 ${
          isMine ? "bg-white/20 hover:bg-white/30" : "bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-500/25"
        }`}>
        {busy
          ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin block" />
          : playing ? <Pause size={16} /> : <Play size={16} />
        }
      </button>
      <div className="flex items-end gap-[2px] flex-1 h-7">
        {bars.map((h, i) => (
          <div key={i} className={`w-[2.5px] rounded-full transition-all ${BAR_H[h]} ${BAR_DELAY[i]} ${
            playing
              ? isMine ? "bg-white/80 animate-pulse" : "bg-violet-500 animate-pulse"
              : isMine ? "bg-white/45" : "bg-violet-400/60 dark:bg-violet-500/60"
          }`} />
        ))}
      </div>
      <audio ref={ref} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}

function Media({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(
    file.isEncrypted === false || !file.encryptedKey ? file.url : null
  );
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (url || busy) return url;
    setBusy(true);
    const u = await fetchAndDecrypt(file.url, file.encryptedKey, file.encryptionIV);
    setBusy(false);
    if (u) setUrl(u);
    return u;
  };

  const download = async () => {
    const u = url ?? await load();
    if (!u) return;
    const a = document.createElement("a");
    a.href = u; a.download = file.originalName || file.fileName || "file"; a.click();
  };

  const Placeholder = ({ icon }: { icon: React.ReactNode }) => (
    <button type="button"
      className={`flex flex-col items-center justify-center gap-2 p-8 rounded-xl min-w-[160px] min-h-[100px] transition-colors ${
        isMine ? "bg-white/15 hover:bg-white/20" : "bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/10"
      }`}
      onClick={load}>
      {busy
        ? <span className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin opacity-60 block" />
        : <>{icon}<span className="text-[11px] opacity-60">Tap to reveal</span></>
      }
    </button>
  );

  if (file.type === "image") return url
    ? (
      <div className="relative group/media max-w-[260px] max-h-[320px] rounded-xl overflow-hidden">
        <img src={url} alt={file.originalName} className="max-w-full max-h-[320px] rounded-xl object-cover block cursor-zoom-in" />
        <button
          type="button"
          onClick={download}
          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover/media:opacity-100 shadow-md"
          title="Download Image"
        >
          <Download size={14} />
        </button>
      </div>
    )
    : <Placeholder icon={<span className="text-3xl">🔒</span>} />;

  if (file.type === "video") return url
    ? (
      <div className="relative group/media max-w-[260px] rounded-xl overflow-hidden">
        <video controls src={url} className="max-w-full rounded-xl block" />
        <button
          type="button"
          onClick={download}
          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover/media:opacity-100 shadow-md z-10"
          title="Download Video"
        >
          <Download size={14} />
        </button>
      </div>
    )
    : <Placeholder icon={<span className="text-3xl">▶️</span>} />;

  if (file.type === "audio") return url
    ? <audio controls src={url} className="max-w-[220px]" />
    : <button type="button" onClick={load}
        className={`text-xs px-3 py-1.5 rounded-xl transition-colors ${
          isMine ? "bg-white/15 hover:bg-white/25" : "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100"
        }`}>
        {busy ? "Decrypting…" : "Load audio"}
      </button>;

  const sz = file.fileSize ? `${(file.fileSize / 1024).toFixed(0)} KB` : "";
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 max-w-[240px] ${
      isMine ? "bg-white/15" : "bg-gray-100 dark:bg-white/[0.06]"
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        isMine ? "bg-white/20" : "bg-violet-100 dark:bg-violet-900/40"
      }`}>
        <FileText size={17} className={isMine ? "text-white/80" : "text-violet-600 dark:text-violet-300"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-tight">{file.originalName || file.fileName || "Document"}</p>
        {sz && <p className={`text-xs ${isMine ? "text-white/55" : "text-gray-400"}`}>{sz}</p>}
      </div>
      <button type="button" onClick={download} disabled={busy}
        className={`p-1.5 rounded-full shrink-0 hover:bg-black/10 transition-colors ${isMine ? "text-white/70" : "text-gray-500"}`}>
        {busy
          ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin block" />
          : <Download size={14} />
        }
      </button>
    </div>
  );
}

function CallLogBubble({ message, isMine }: { message: Message; isMine: boolean }) {
  const log = message.callLog;
  const isVideo = log?.callType === "video";
  const missed  = log?.outcome === "missed" || log?.outcome === "declined";
  const dur     = log?.duration;
  const label   =
    log?.outcome === "completed" ? `${isVideo ? "Video" : "Voice"} call${dur ? ` · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : ""}` :
    log?.outcome === "missed"    ? `Missed ${isVideo ? "video" : "voice"} call` :
    log?.outcome === "declined"  ? `Declined ${isVideo ? "video" : "voice"} call` :
    log?.outcome === "busy"      ? "Busy" :
    `${isVideo ? "Video" : "Voice"} call`;

  const Icon = missed ? PhoneMissed : isVideo ? Video : Phone;

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1 px-1`}>
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
        missed
          ? isMine ? "bg-red-500/15 text-red-300" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
          : isMine ? "bubble-gradient text-white"  : "bg-white dark:bg-[#1a1a3a] text-gray-900 dark:text-gray-100"
      }`}>
        <Icon size={15} className={missed ? "text-red-400" : ""} />
        <span className="font-medium">{label}</span>
        <span className={`text-[11px] ${isMine ? "text-white/50" : "text-gray-400"}`}>
          {new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

export default function MessageBubble({ message, isMine, onRetry }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (message.contentType === "call-log") {
    return <CallLogBubble message={message} isMine={isMine} />;
  }

  const time    = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text    = message.plaintext || (!message.media?.length ? message.ciphertext : undefined);
  const isVoice = !!(message.isVoiceMessage || (message.contentType === "audio" && message.media?.length));
  const isFailed  = message.status === "failed";
  const isSending = message.status === "sending";
  const canInfo   = isMine && !isSending && !isFailed && !message._id.startsWith("temp");

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!canInfo) return;
    e.preventDefault();
    setShowInfo(true);
  };

  const handleTouchStart = () => {
    if (!canInfo) return;
    longPressTimer.current = setTimeout(() => setShowInfo(true), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return (
    <>
    {showInfo && (
      <MessageInfoSheet
        messageId={message._id}
        type="personal"
        onClose={() => setShowInfo(false)}
      />
    )}
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-0.5 px-2 group`}>
      <div className="flex flex-col items-end gap-1 max-w-[74%]">
        <div
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          className={`relative rounded-2xl px-3.5 py-2 shadow-md transition-opacity select-none ${
            isMine ? "cursor-context-menu" : ""
          } ${
            isSending ? "opacity-65" : ""
          } ${
            isMine
              ? "bubble-gradient text-white rounded-br-[4px] shadow-violet-500/20"
              : "bg-white dark:bg-[#1a1a3a] text-gray-900 dark:text-gray-100 rounded-bl-[4px] shadow-black/5 dark:shadow-black/30"
          }`}>

          {isVoice && message.media?.[0] && <VoiceNote file={message.media[0]} isMine={isMine} />}

          {!isVoice && message.media && message.media.length > 0 && (
            <div className={`space-y-1 ${text ? "mb-2" : ""}`}>
              {message.media.map((f, i) => <Media key={i} file={f} isMine={isMine} />)}
            </div>
          )}

          {text && !isVoice && (
            <p className="text-[14.5px] leading-[1.5] whitespace-pre-wrap break-words">{text}</p>
          )}

          <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMine ? "text-white/55" : "text-gray-400"}`}>
            <span className="text-[11px]">{time}</span>
            {isMine && <Tick status={message.status} deliveredAt={message.deliveredAt} readAt={message.readAt} sentAt={message.sentAt} />}
          </div>
        </div>

        {isFailed && onRetry && (
          <button type="button" onClick={onRetry}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 rounded-full transition-colors">
            <RotateCcw size={11} />
            Retry
          </button>
        )}
      </div>
    </div>
    </>
  );
}
