"use client";
import { useState } from "react";
import { Check, CheckCheck, Download, FileText, Image as ImgIcon, Music, Video } from "lucide-react";
import type { Message, MediaFile } from "@/types";
import { decryptFile, getStoredPrivateKey } from "@/lib/crypto";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Props {
  message: Message;
  isMine: boolean;
}

function StatusTick({ status }: { status?: string }) {
  if (status === "read") return <CheckCheck size={14} className="text-blue-400" />;
  if (status === "delivered") return <CheckCheck size={14} className="text-gray-400" />;
  return <Check size={14} className="text-gray-400" />;
}

function MediaAttachment({ file, isMine }: { file: MediaFile; isMine: boolean }) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const decrypt = async () => {
    if (decryptedUrl || !file.encryptionIV || !file.encryptedKey) return;
    setLoading(true);
    try {
      const privateKey = await getStoredPrivateKey();
      if (!privateKey) return;
      const res = await fetch(`${API}${file.url.replace("/api", "")}`, { credentials: "include" });
      const iv = res.headers.get("X-Encryption-IV") || file.encryptionIV;
      const buf = await res.arrayBuffer();
      const plain = await decryptFile(buf, file.encryptedKey!, iv, privateKey);
      const blob = new Blob([plain], { type: "application/octet-stream" });
      setDecryptedUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Decrypt error:", err);
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    await decrypt();
    if (!decryptedUrl) return;
    const a = document.createElement("a");
    a.href = decryptedUrl;
    a.download = file.originalName || file.fileName || "file";
    a.click();
  };

  if (file.type === "image") {
    return (
      <div className="relative max-w-xs rounded-lg overflow-hidden cursor-pointer" onClick={decrypt}>
        {decryptedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={decryptedUrl} alt={file.originalName} className="max-w-full rounded-lg" />
        ) : (
          <div
            className="flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg"
            style={{ width: 200, height: 150 }}
          >
            {loading ? (
              <span className="text-xs text-gray-500">Decrypting…</span>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ImgIcon size={32} className="text-gray-400" />
                <span className="text-xs text-gray-500">Click to view</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (file.type === "audio") {
    return (
      <div className="flex items-center gap-2">
        <button onClick={decrypt} className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900">
          <Music size={18} className="text-indigo-600 dark:text-indigo-300" />
        </button>
        {decryptedUrl ? (
          <audio controls src={decryptedUrl} className="max-w-[200px]" />
        ) : (
          <span className="text-xs text-gray-500">{loading ? "Decrypting…" : "Audio message"}</span>
        )}
      </div>
    );
  }

  if (file.type === "video") {
    return (
      <div className="relative max-w-xs rounded-lg overflow-hidden" onClick={decrypt}>
        {decryptedUrl ? (
          <video controls src={decryptedUrl} className="max-w-full rounded-lg" />
        ) : (
          <div
            className="flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer"
            style={{ width: 200, height: 150 }}
          >
            {loading ? (
              <span className="text-xs text-gray-500">Decrypting…</span>
            ) : (
              <Video size={32} className="text-gray-400" />
            )}
          </div>
        )}
      </div>
    );
  }

  // document / blob
  return (
    <div className="flex items-center gap-3 bg-white/10 rounded-lg px-3 py-2 min-w-[180px]">
      <FileText size={24} className={isMine ? "text-white/70" : "text-gray-500"} />
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium truncate">{file.originalName || "Document"}</p>
        {file.fileSize && (
          <p className={`text-xs ${isMine ? "text-white/60" : "text-gray-400"}`}>
            {(file.fileSize / 1024).toFixed(1)} KB
          </p>
        )}
      </div>
      <button
        onClick={download}
        disabled={loading}
        className={`p-1 rounded-full hover:bg-white/10 ${isMine ? "text-white/70" : "text-gray-500"}`}
        title="Download"
      >
        {loading ? (
          <span className="text-xs">…</span>
        ) : (
          <Download size={16} />
        )}
      </button>
    </div>
  );
}

export default function MessageBubble({ message, isMine }: Props) {
  const time = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text = message.plaintext || message.ciphertext;

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`relative max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
          isMine
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
        }`}
      >
        {/* Media */}
        {message.media && message.media.length > 0 && (
          <div className="mb-1 space-y-1">
            {message.media.map((f, i) => (
              <MediaAttachment key={i} file={f} isMine={isMine} />
            ))}
          </div>
        )}

        {/* Text */}
        {text && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {text}
          </p>
        )}

        {/* Meta row */}
        <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMine ? "text-white/60" : "text-gray-400"}`}>
          <span className="text-[11px]">{time}</span>
          {isMine && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}
