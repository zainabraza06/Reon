"use client";
import { useState, useRef } from "react";
import { Check, CheckCheck, Download, FileText, Play, Pause, RotateCcw, Phone, Video, PhoneMissed, Clock, AlertCircle } from "lucide-react";
import type { Message, MediaFile } from "@/types";
import { decryptFile, getStoredPrivateKey } from "@/lib/crypto";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001/api").replace(/\/api$/, "");

interface Props {
  message: Message;
  isMine: boolean;
  onRetry?: () => void;
}

// ── Tick icon ─────────────────────────────────────────────────────────────────
function Tick({ status }: { status?: string }) {
  if (status === "sending") return <Clock size={13} className="text-white/50 animate-pulse" />;
  if (status === "failed")  return <AlertCircle size={13} className="text-red-300" />;
  if (status === "read")    return <CheckCheck size={13} className="text-blue-300" />;
  if (status === "delivered") return <CheckCheck size={13} className="text-white/60" />;
  return <Check size={13} className="text-white/50" />;
}

// ── Decrypt helper ────────────────────────────────────────────────────────────
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

// ── Voice note ────────────────────────────────────────────────────────────────
function VoiceNote({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
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

  const bars = [5, 9, 14, 10, 16, 11, 7, 13, 9, 6, 12, 14, 8, 11, 6, 10, 8, 14, 9, 6];

  return (
    <div className="flex items-center gap-3 min-w-[190px] py-0.5">
      <button onClick={toggle} disabled={busy}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 ${
          isMine ? "bg-white/25 hover:bg-white/35" : "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-300"
        }`}>
        {busy
          ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin block" />
          : playing ? <Pause size={17} /> : <Play size={17} />
        }
      </button>
      <div className="flex items-end gap-[2px] flex-1 h-8">
        {bars.map((h, i) => (
          <div key={i} className={`rounded-full transition-all ${
            playing ? (isMine ? "bg-white/80 animate-pulse" : "bg-indigo-500 animate-pulse") : (isMine ? "bg-white/45" : "bg-indigo-400/60 dark:bg-indigo-500/60")
          }`} style={{ width: 2.5, height: h, animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
      <audio ref={ref} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}

// ── Media ─────────────────────────────────────────────────────────────────────
function Media({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
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
    <div className={`flex flex-col items-center justify-center gap-2 p-8 rounded-xl min-w-[160px] min-h-[100px] cursor-pointer ${isMine ? "bg-white/10" : "bg-gray-200/70 dark:bg-gray-700/50"}`} onClick={load}>
      {busy ? <span className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin opacity-60 block" /> : <>{icon}<span className="text-[11px] opacity-60">Tap to reveal</span></>}
    </div>
  );

  if (file.type === "image") return url
    ? <img src={url} alt={file.originalName} className="max-w-[260px] max-h-[320px] rounded-xl object-cover block cursor-zoom-in" /> // eslint-disable-line
    : <Placeholder icon={<span className="text-3xl">🔒</span>} />;

  if (file.type === "video") return url
    ? <video controls src={url} className="max-w-[260px] rounded-xl block" />
    : <Placeholder icon={<span className="text-3xl">▶️</span>} />;

  if (file.type === "audio") return url
    ? <audio controls src={url} className="max-w-[220px]" />
    : <button onClick={load} className={`text-xs px-3 py-1.5 rounded-xl ${isMine ? "bg-white/15" : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"}`}>{busy ? "Decrypting…" : "Load audio"}</button>;

  const sz = file.fileSize ? `${(file.fileSize / 1024).toFixed(0)} KB` : "";
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 max-w-[240px] ${isMine ? "bg-white/10" : "bg-gray-100 dark:bg-gray-700/60"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isMine ? "bg-white/20" : "bg-indigo-100 dark:bg-indigo-900/40"}`}>
        <FileText size={18} className={isMine ? "text-white/80" : "text-indigo-600 dark:text-indigo-300"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-tight">{file.originalName || file.fileName || "Document"}</p>
        {sz && <p className={`text-xs ${isMine ? "text-white/50" : "text-gray-400"}`}>{sz}</p>}
      </div>
      <button onClick={download} disabled={busy} className={`p-1.5 rounded-full shrink-0 hover:bg-black/10 ${isMine ? "text-white/70" : "text-gray-500"}`}>
        {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin block" /> : <Download size={15} />}
      </button>
    </div>
  );
}

// ── Call-log bubble ───────────────────────────────────────────────────────────
function CallLogBubble({ message, isMine }: { message: Message; isMine: boolean }) {
  const log = message.callLog;
  const isVideo   = log?.callType === "video";
  const missed    = log?.outcome === "missed" || log?.outcome === "declined";
  const duration  = log?.duration;
  const label     =
    log?.outcome === "completed" ? `${isVideo ? "Video" : "Voice"} call${duration ? ` · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : ""}` :
    log?.outcome === "missed"    ? `Missed ${isVideo ? "video" : "voice"} call` :
    log?.outcome === "declined"  ? `Declined ${isVideo ? "video" : "voice"} call` :
    log?.outcome === "busy"      ? "Busy" :
    `${isVideo ? "Video" : "Voice"} call`;

  const Icon = missed ? PhoneMissed : isVideo ? Video : Phone;

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1 px-1`}>
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
        missed
          ? isMine
            ? "bg-red-500/15 text-red-300 dark:text-red-400"
            : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
          : isMine
            ? "bg-indigo-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      }`}>
        <Icon size={16} className={missed ? "text-red-400" : ""} />
        <span className="font-medium text-sm">{label}</span>
        <span className={`text-[11px] ${isMine ? "text-white/50" : "text-gray-400"}`}>
          {new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ── Main bubble ───────────────────────────────────────────────────────────────
export default function MessageBubble({ message, isMine, onRetry }: Props) {
  if (message.contentType === "call-log") {
    return <CallLogBubble message={message} isMine={isMine} />;
  }

  const time  = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text  = message.plaintext || (!message.media?.length ? message.ciphertext : undefined);
  const isVoice = !!(message.isVoiceMessage || (message.contentType === "audio" && message.media?.length));
  const isFailed  = message.status === "failed";
  const isSending = message.status === "sending";

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-0.5 px-1 group`}>
      <div className="flex flex-col items-end gap-1 max-w-[74%]">
        <div className={`relative rounded-2xl px-3.5 py-2 shadow-sm transition-opacity ${
          isSending ? "opacity-70" : ""
        } ${
          isMine
            ? "bg-indigo-600 text-white rounded-br-[4px]"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-[4px]"
        }`}>
          {/* Voice note */}
          {isVoice && message.media?.[0] && <VoiceNote file={message.media[0]} isMine={isMine} />}

          {/* Media */}
          {!isVoice && message.media && message.media.length > 0 && (
            <div className={`space-y-1 ${text ? "mb-2" : ""}`}>
              {message.media.map((f, i) => <Media key={i} file={f} isMine={isMine} />)}
            </div>
          )}

          {/* Text */}
          {text && !isVoice && (
            <p className="text-[14.5px] leading-[1.45] whitespace-pre-wrap break-words">{text}</p>
          )}

          {/* Footer */}
          <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMine ? "text-white/55" : "text-gray-400"}`}>
            <span className="text-[11px]">{time}</span>
            {isMine && <Tick status={message.status} />}
          </div>
        </div>

        {/* Retry button for failed messages */}
        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 rounded-full"
          >
            <RotateCcw size={11} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
