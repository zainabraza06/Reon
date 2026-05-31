"use client";
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Mic, Paperclip, Send, X } from "lucide-react";

function bestAudioMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

interface Props {
  onSend: (text: string, files: File[]) => Promise<void>;
  onVoiceNote?: (blob: Blob, durationSec: number) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageInput({
  onSend,
  onVoiceNote,
  onTyping,
  disabled,
  placeholder = "Message…",
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleType = (val: string) => {
    setText(val);
    if (onTyping) {
      onTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => onTyping(false), 2000);
    }
  };

  const send = async () => {
    if ((!text.trim() && files.length === 0) || sending || disabled) return;
    setSending(true);
    try {
      await onSend(text.trim(), files);
      setText("");
      setFiles([]);
      if (onTyping) onTyping(false);
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected].slice(0, 5));
    e.target.value = "";
  };

  // ── Voice recording ────────────────────────────────────────────────────────

  const startRecording = async () => {
    if (!onVoiceNote) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = bestAudioMime();
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setRecordSec(0);

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        if (blob.size > 0) await onVoiceNote(blob, duration);
        chunksRef.current = [];
      };

      mr.start(250);
      mediaRecRef.current = mr;
      setRecording(true);
      timerRef.current = setInterval(() => {
        setRecordSec(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch {
      alert("Microphone access denied. Please allow mic permissions.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
    setRecording(false);
    setRecordSec(0);
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecRef.current) {
      mediaRecRef.current.ondataavailable = null;
      mediaRecRef.current.onstop = null;
      mediaRecRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecRef.current.stop();
      mediaRecRef.current = null;
    }
    chunksRef.current = [];
    setRecording(false);
    setRecordSec(0);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Recording UI ───────────────────────────────────────────────────────────
  if (recording) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={cancelRecording} className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Cancel">
            <X size={20} />
          </button>
          <div className="flex-1 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">Recording {fmt(recordSec)}</span>
          </div>
          <button onClick={stopRecording} className="p-2.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors" title="Send voice note">
            <Send size={18} />
          </button>
        </div>
      </div>
    );
  }

  // ── Normal UI ──────────────────────────────────────────────────────────────
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 shrink-0">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1 text-xs">
              <span className="max-w-[120px] truncate text-gray-700 dark:text-gray-300">{f.name}</span>
              <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button onClick={() => fileRef.current?.click()} disabled={disabled} className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40" title="Attach file">
          <Paperclip size={20} />
        </button>
        <input ref={fileRef} type="file" multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.xlsx,.pptx,.csv"
          className="hidden" onChange={onFileChange} />

        <textarea
          rows={1}
          value={text}
          onChange={(e) => handleType(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={disabled || sending}
          className="flex-1 resize-none bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-h-32 overflow-y-auto"
          style={{ lineHeight: "1.5" }}
        />

        {/* Show mic when idle, send when there's content */}
        {!text.trim() && files.length === 0 && onVoiceNote ? (
          <button onClick={startRecording} disabled={disabled} className="p-2.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 disabled:opacity-40 transition-colors" title="Record voice note">
            <Mic size={18} />
          </button>
        ) : (
          <button onClick={send} disabled={disabled || sending || (!text.trim() && files.length === 0)} className="p-2.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
