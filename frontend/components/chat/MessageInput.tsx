"use client";
import { useState, useRef, KeyboardEvent } from "react";
import { Paperclip, Send, Smile, X } from "lucide-react";

interface Props {
  onSend: (text: string, files: File[]) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageInput({ onSend, onTyping, disabled, placeholder = "Message…" }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected].slice(0, 5));
    e.target.value = "";
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1 text-xs">
              <span className="max-w-[120px] truncate text-gray-700 dark:text-gray-300">{f.name}</span>
              <button
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 ml-1"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File attach */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.xlsx,.pptx"
          className="hidden"
          onChange={onFileChange}
        />

        {/* Text area */}
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

        {/* Send */}
        <button
          onClick={send}
          disabled={disabled || sending || (!text.trim() && files.length === 0)}
          className="p-2.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
