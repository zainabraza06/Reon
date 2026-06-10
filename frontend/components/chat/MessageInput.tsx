"use client";
import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react";
import { Mic, Paperclip, Send, X, Smile } from "lucide-react";

const EMOJIS = [
  '😀','😂','😍','🥰','😊','😎','🤔','😭','😡','🥺',
  '👍','👎','❤️','💯','🔥','✨','🎉','👀','💪','🙏',
  '😅','😆','🤩','🥳','😴','🤒','🤗','😏','🫠','🫡',
  '🐶','🐱','🦁','🐼','🦊','🐸','🌸','🌟','⭐','💎',
  '🍕','🍔','🍣','🍦','🎂','🍩','☕','🎮','🎵','🏆',
];

function bestAudioMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
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
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef  = useRef(0);
  const fileRef       = useRef<HTMLInputElement>(null);
  const typingTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleType = (val: string) => {
    setText(val);
    if (onTyping) {
      onTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => onTyping(false), 2000);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? text.length;
      const end   = el.selectionEnd   ?? text.length;
      const next  = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      });
    } else {
      setText((t) => t + emoji);
    }
  };

  const send = async () => {
    if ((!text.trim() && files.length === 0) || sending || disabled) return;
    setSending(true);
    setShowEmoji(false);
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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev: File[]) => [...prev, ...selected].slice(0, 5));
    e.target.value = "";
  };

  const startRecording = async () => {
    if (!onVoiceNote) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = bestAudioMime();
      const mr     = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current    = [];
      startTimeRef.current = Date.now();
      setRecordSec(0);

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        const blob     = new Blob(chunksRef.current, { type: mime });
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
      mediaRecRef.current.stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      mediaRecRef.current.stop();
      mediaRecRef.current = null;
    }
    chunksRef.current = [];
    setRecording(false);
    setRecordSec(0);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* ── Recording UI ─────────────────────────────────── */
  if (recording) {
    return (
      <div className="msg-input-bar px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button type="button" onClick={cancelRecording} title="Cancel recording"
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <X size={20} />
          </button>
          <div className="flex-1 flex items-center gap-2.5 bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">Recording {fmt(recordSec)}</span>
          </div>
          <button type="button" onClick={stopRecording} title="Send voice note"
            className="p-2.5 rounded-xl btn-gradient text-white shadow-md shadow-violet-500/25">
            <Send size={17} />
          </button>
        </div>
      </div>
    );
  }

  /* ── Normal UI ────────────────────────────────────── */
  return (
    <div className="msg-input-bar px-4 py-3 shrink-0">
      {/* Emoji panel */}
      {showEmoji && (
        <div className="mb-2 p-2 bg-gray-50 dark:bg-white/[0.04] rounded-2xl border border-gray-200 dark:border-white/[0.06]">
          <div className="grid grid-cols-10 gap-0.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                className="text-xl p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors leading-none"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-lg px-2.5 py-1 text-xs">
              <span className="max-w-[120px] truncate text-violet-700 dark:text-violet-300 font-medium">{f.name}</span>
              <button
                type="button"
                title={`Remove ${f.name}`}
                onClick={() => setFiles((prev: File[]) => prev.filter((_, j) => j !== i))}
                className="text-violet-400 hover:text-red-500 ml-0.5 transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled}
          title="Attach file"
          className="p-2 rounded-xl text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all disabled:opacity-40">
          <Paperclip size={20} />
        </button>
        <button type="button" onClick={() => setShowEmoji((v) => !v)} disabled={disabled}
          title="Emoji"
          className={`p-2 rounded-xl transition-all disabled:opacity-40 ${showEmoji ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" : "text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"}`}>
          <Smile size={20} />
        </button>
        <input ref={fileRef} type="file" multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.xlsx,.pptx,.csv"
          className="hidden" onChange={onFileChange} />

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => handleType(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={disabled || sending}
          className="flex-1 resize-none bg-gray-100 dark:bg-white/[0.06] rounded-2xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white dark:focus:bg-white/[0.09] max-h-32 overflow-y-auto transition-all leading-[1.5]"
        />

        {!text.trim() && files.length === 0 && onVoiceNote ? (
          <button type="button" onClick={startRecording} disabled={disabled}
            title="Record voice note"
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 hover:bg-violet-100 dark:hover:bg-violet-500/15 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 transition-all">
            <Mic size={18} />
          </button>
        ) : (
          <button type="button" onClick={() => { void send(); }}
            disabled={disabled || sending || (!text.trim() && files.length === 0)}
            title="Send message"
            className="p-2.5 rounded-xl btn-gradient text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-violet-500/25 transition-all">
            <Send size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
