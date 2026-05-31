"use client";
import { useState, useRef } from "react";
import { Check, CheckCheck, Download, FileText, Play, Pause } from "lucide-react";
import type { Message, MediaFile } from "@/types";
import { decryptFile, getStoredPrivateKey } from "@/lib/crypto";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001/api").replace(/\/api$/, "");

interface Props { message: Message; isMine: boolean }

function StatusTick({ status }: { status?: string }) {
  if (status === "read")      return <CheckCheck size={14} className="text-blue-400" />;
  if (status === "delivered") return <CheckCheck size={14} className="text-gray-400" />;
  return <Check size={14} className="text-gray-400" />;
}

async function fetchAndDecrypt(
  mediaUrl: string,
  encryptedKey?: string,
  encryptionIV?: string
): Promise<string | null> {
  try {
    const privateKey = await getStoredPrivateKey();
    if (!privateKey) return null;
    const url = mediaUrl.startsWith("http") ? mediaUrl : `${API_BASE}${mediaUrl}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const iv = res.headers.get("X-Encryption-IV") ?? encryptionIV ?? "";
    const buf = await res.arrayBuffer();
    if (encryptedKey && iv) {
      const plain = await decryptFile(buf, encryptedKey, iv, privateKey);
      return URL.createObjectURL(new Blob([plain]));
    }
    return URL.createObjectURL(new Blob([buf]));
  } catch (err) {
    console.error("fetchAndDecrypt:", err);
    return null;
  }
}

// ── Voice note ────────────────────────────────────────────────────────────────
function VoiceNote({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    if (objectUrl || decrypting) return;
    setDecrypting(true);
    const url = await fetchAndDecrypt(file.url, file.encryptedKey, file.encryptionIV);
    setDecrypting(false);
    setObjectUrl(url);
    return url;
  };

  const togglePlay = async () => {
    const url = objectUrl ?? await load();
    if (!url) return;
    const a = audioRef.current;
    if (!a) return;
    if (!a.src || a.src === window.location.href) a.src = url;
    if (a.paused) { a.play(); setPlaying(true); }
    else           { a.pause(); setPlaying(false); }
  };

  const bars = [4, 7, 10, 8, 12, 9, 6, 11, 8, 5, 9, 11, 7, 10, 6, 9, 7, 11, 8, 5];

  return (
    <div className="flex items-center gap-2 py-1 min-w-[180px]">
      <button
        onClick={togglePlay}
        disabled={decrypting}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isMine
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 hover:bg-indigo-200"
        }`}
      >
        {decrypting ? (
          <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin block" />
        ) : playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div className="flex items-center gap-px flex-1">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ width: 2, height: h, borderRadius: 2 }}
            className={isMine ? "bg-white/50" : "bg-indigo-300 dark:bg-indigo-600"}
          />
        ))}
      </div>

      <audio
        ref={audioRef}
        src={objectUrl ?? undefined}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

// ── Media attachment ───────────────────────────────────────────────────────────
function MediaAttachment({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const decrypt = async () => {
    if (objectUrl || decrypting) return;
    setDecrypting(true);
    const url = await fetchAndDecrypt(file.url, file.encryptedKey, file.encryptionIV);
    setDecrypting(false);
    if (url) setObjectUrl(url);
  };

  const download = async () => {
    const url = objectUrl ?? (await fetchAndDecrypt(file.url, file.encryptedKey, file.encryptionIV));
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = file.originalName || file.fileName || "download";
    a.click();
  };

  const Lock = () => (
    <div className="flex flex-col items-center gap-2 p-6">
      {decrypting ? (
        <span className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin block opacity-70" />
      ) : (
        <>
          <span className="text-3xl">🔒</span>
          <span className="text-xs opacity-60">Tap to reveal</span>
        </>
      )}
    </div>
  );

  if (file.type === "image") {
    return (
      <div className="rounded-xl overflow-hidden cursor-pointer max-w-xs" onClick={decrypt}>
        {objectUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={objectUrl} alt={file.originalName} className="max-w-full block rounded-xl" />
          : <div className={`flex items-center justify-center ${isMine ? "bg-white/10" : "bg-gray-100 dark:bg-gray-700"} rounded-xl min-w-[160px] min-h-[100px]`}><Lock /></div>
        }
      </div>
    );
  }

  if (file.type === "video") {
    return (
      <div className="rounded-xl overflow-hidden cursor-pointer max-w-xs" onClick={decrypt}>
        {objectUrl
          ? <video controls src={objectUrl} className="max-w-full block rounded-xl" />
          : <div className={`flex items-center justify-center ${isMine ? "bg-white/10" : "bg-gray-100 dark:bg-gray-700"} rounded-xl min-w-[160px] min-h-[100px]`}><Lock /></div>
        }
      </div>
    );
  }

  if (file.type === "audio") {
    return objectUrl
      ? <audio controls src={objectUrl} className="max-w-[220px]" />
      : (
        <button onClick={decrypt} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl ${isMine ? "bg-white/10 text-white" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"}`}>
          {decrypting ? "Decrypting…" : "Load audio"}
        </button>
      );
  }

  // Document / blob
  const sizeKB = file.fileSize ? `${(file.fileSize / 1024).toFixed(0)} KB` : "";
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2 max-w-xs ${isMine ? "bg-white/10" : "bg-gray-100 dark:bg-gray-700"}`}>
      <FileText size={22} className={`shrink-0 ${isMine ? "text-white/70" : "text-gray-500"}`} />
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium truncate">{file.originalName || file.fileName || "Document"}</p>
        {sizeKB && <p className={`text-xs ${isMine ? "text-white/60" : "text-gray-400"}`}>{sizeKB}</p>}
      </div>
      <button
        onClick={download}
        disabled={decrypting}
        className={`p-1.5 rounded-full shrink-0 hover:bg-black/10 transition-colors ${isMine ? "text-white/70" : "text-gray-500"}`}
        title="Download"
      >
        {decrypting
          ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin block" />
          : <Download size={15} />
        }
      </button>
    </div>
  );
}

// ── Bubble ────────────────────────────────────────────────────────────────────
export default function MessageBubble({ message, isMine }: Props) {
  const time = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text = message.plaintext || message.ciphertext;
  const isVoice = !!(message.isVoiceMessage || (message.contentType === "audio" && message.media?.length));

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1 px-1`}>
      <div className={`relative max-w-[72%] rounded-2xl px-4 py-2 shadow-sm ${
        isMine
          ? "bg-indigo-600 text-white rounded-br-sm"
          : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
      }`}>
        {/* Voice note */}
        {isVoice && message.media?.[0] && (
          <VoiceNote file={message.media[0]} isMine={isMine} />
        )}

        {/* Regular media */}
        {!isVoice && message.media && message.media.length > 0 && (
          <div className="mb-1 space-y-1">
            {message.media.map((f, i) => <MediaAttachment key={i} file={f} isMine={isMine} />)}
          </div>
        )}

        {/* Text */}
        {text && !isVoice && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{text}</p>
        )}

        {/* Footer */}
        <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMine ? "text-white/60" : "text-gray-400"}`}>
          <span className="text-[11px]">{time}</span>
          {isMine && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}
