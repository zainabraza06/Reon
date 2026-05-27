// InputArea.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Mic, X, FileText, Loader2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputAreaProps {
  onSendMessage: (text: string, files: File[]) => Promise<void> | void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({
  onSendMessage,
  onTyping,
  disabled
}) => {
  const [text, setText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File, preview?: string, type: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingPermission, setRecordingPermission] = useState<boolean>(false);
  
  // Typing management refs
  const isCurrentlyTypingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  // FIX: Use ReturnType<typeof setTimeout> for typing debounce
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop typing if we were typing
      if (isCurrentlyTypingRef.current) {
        onTyping(false);
        isCurrentlyTypingRef.current = false;
      }
      
      // Clean up typing debounce timeout
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      
      // Clean up any active recording
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Clean up recording timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Clean up file preview URLs
      selectedFiles.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [onTyping, selectedFiles]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const newText = e.target.value;
  setText(newText);

  const hasText = newText.trim().length > 0;
  
  // Simple logic: typing if there's text, not typing if empty
  if (hasText && !isCurrentlyTypingRef.current) {
    // Start typing
    isCurrentlyTypingRef.current = true;
    console.log('⌨️ [InputArea] Typing: ON (text entered)');
    onTyping(true);
  } else if (!hasText && isCurrentlyTypingRef.current) {
    // Stop typing
    isCurrentlyTypingRef.current = false;
    console.log('⌨️ [InputArea] Typing: OFF (text cleared)');
    onTyping(false);
  }
  // If state hasn't changed (typing with text OR not typing without text), do nothing
}, [onTyping]);
  // Handle input blur
  const handleBlur = useCallback(() => {
    // Clear any pending typing timeout
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }
    
    // Only stop typing if we were actually typing
    if (isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = false;
      console.log('⌨️ [InputArea] Stopping typing (input blur)');
      onTyping(false);
    }
  }, [onTyping]);

  // Handle input focus
  const handleFocus = useCallback(() => {
    // Clear any pending typing timeout
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }
    
    // Only start typing if there's text and we're not already typing
    if (text.trim() && !isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = true;
      console.log('⌨️ [InputArea] Starting typing (input focus)');
      onTyping(true);
    }
  }, [onTyping, text]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        type: file.type.split('/')[0]
      }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
      e.target.value = '';
      textInputRef.current?.focus();
    }
  };

  const removeFile = (index: number) => {
    const file = selectedFiles[index];
    if (file.preview) URL.revokeObjectURL(file.preview);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!text.trim() && selectedFiles.length === 0) || isProcessing || disabled) return;

    setIsProcessing(true);

    try {
      const filesArray = selectedFiles.map(item => item.file);
      await Promise.resolve(onSendMessage(text, filesArray));

      // Clear text and files
      setText('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Clear typing timeout
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      
      // Stop typing when message is sent
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        console.log('⌨️ [InputArea] Stopping typing (message sent)');
        onTyping(false);
      }
      
      textInputRef.current?.focus();
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isProcessing && !disabled) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <span aria-hidden="true" className="text-2xl">🖼️</span>;
      case 'video': return <span aria-hidden="true" className="text-2xl">🎬</span>;
      case 'audio': return <span aria-hidden="true" className="text-2xl">🎵</span>;
      default: return <FileText size={24} aria-hidden="true" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAttachClick = () => {
    if (fileInputRef.current && !disabled && !isProcessing && !isRecording) {
      fileInputRef.current.click();
    }
  };

  // --- Enhanced Voice Recording Logic ---
  const handleVoiceRecording = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorder?.stop();
      setIsRecording(false);
      
      // Stop all tracks
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support audio recording.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        audioStreamRef.current = stream;
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm') 
            ? 'audio/webm;codecs=opus' 
            : 'audio/mp4'
        });
        
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = async () => {
          try {
            if (chunks.length === 0) {
              console.warn("No audio data recorded");
              return;
            }
            
            const blob = new Blob(chunks, { 
              type: recorder.mimeType || 'audio/webm' 
            });
            
            const file = new File([blob], `voice-${Date.now()}.${recorder.mimeType.includes('webm') ? 'webm' : 'mp4'}`, { 
              type: recorder.mimeType || 'audio/webm' 
            });
            
            setIsProcessing(true);
            await Promise.resolve(onSendMessage('Voice message', [file]));
            setIsProcessing(false);
            
          } catch (err) {
            console.error("Error processing audio recording:", err);
            setIsProcessing(false);
          } finally {
            setAudioChunks([]);
          }
        };

        recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          setIsRecording(false);
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
            audioStreamRef.current = null;
          }
        };

        setAudioChunks(chunks);
        setMediaRecorder(recorder);
        recorder.start();
        setIsRecording(true);
        setRecordingPermission(true);
        setRecordingTime(0);
        
      } catch (err) {
        console.error("Error accessing microphone:", err);
        setRecordingPermission(false);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          alert("Please allow microphone access to record voice messages.");
        } else {
          alert("Could not access microphone. Please check your microphone settings.");
        }
      }
    }
  };

  const iconBtn = "p-3 text-white/80 rounded-full transition-all bg-white/5 border border-white/10 cursor-pointer flex items-center justify-center shrink-0 hover:text-white hover:bg-white/10 hover:border-white/20 hover:-translate-y-px active:translate-y-0";

  return (
    <div className="p-4 bg-slate-900/80 backdrop-blur-xl border-t border-white/10 shrink-0 relative z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] sm:p-3">
      {selectedFiles.length > 0 && (
        <div className="flex gap-3 mb-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
          {selectedFiles.map((item, idx) => (
            <div key={idx} className="group relative w-20 h-20 shrink-0 bg-white/5 rounded-xl overflow-hidden border border-white/15 hover:border-blue-400/50 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all">
              {item.preview ? (
                <img
                  src={item.preview}
                  alt={`Preview of ${item.file.name}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400/10 to-purple-500/10" aria-hidden="true">
                  {getFileIcon(item.type)}
                </div>
              )}
              <button
                onClick={() => removeFile(idx)}
                className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 border-0 cursor-pointer flex items-center justify-center w-5 h-5 opacity-0 scale-[0.8] group-hover:opacity-100 group-hover:scale-100 hover:bg-red-500/90 transition-all"
                type="button"
                disabled={isProcessing}
                title={`Remove ${item.file.name}`}
                aria-label={`Remove file ${item.file.name}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isRecording && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-red-500/10 border border-red-500/20 rounded-xl" role="status" aria-live="polite">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
          <span className="text-sm text-red-400 font-medium flex-1">
            Recording: {formatRecordingTime(recordingTime)}
          </span>
          <button
            onClick={handleVoiceRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-xs cursor-pointer hover:bg-red-500/30 transition-all"
            type="button"
            title="Stop recording"
            aria-label="Stop voice recording"
          >
            <Square size={16} aria-hidden="true" />
            <span>Stop</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-3 sm:gap-2">
        <button
          type="button"
          onClick={handleAttachClick}
          className={cn(iconBtn, (isRecording) && "opacity-50 cursor-not-allowed")}
          disabled={disabled || isProcessing || isRecording}
          title="Attach files"
          aria-label="Attach files"
        >
          <Paperclip size={20} aria-hidden="true" />
          <span className="sr-only">Attach files</span>
        </button>

        <input
          type="file"
          multiple
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          aria-label="Attach files"
          disabled={disabled || isProcessing || isRecording}
        />

        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={isRecording ? "Recording in progress..." : "Type a message..."}
          className={cn(
            "flex-1 bg-white/5 border border-white/15 rounded-full py-3.5 px-5 text-white text-[0.9375rem] transition-all outline-none min-w-0 placeholder:text-white/40 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]",
            isRecording && "opacity-50 cursor-not-allowed"
          )}
          ref={textInputRef}
          disabled={disabled || isProcessing || isRecording}
          aria-label="Message input"
          aria-describedby={isRecording ? "recording-status" : undefined}
        />

        <div className="flex items-center shrink-0">
          {(text.trim() || selectedFiles.length > 0) && !isRecording ? (
            <button
              type="submit"
              className="p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full text-white shadow-[0_4px_15px_rgba(59,130,246,0.3)] transition-all border-0 cursor-pointer flex items-center justify-center shrink-0 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(59,130,246,0.4)] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              disabled={disabled || isProcessing}
              title="Send message"
              aria-label="Send message"
            >
              {isProcessing ? (
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={20} aria-hidden="true" />
              )}
              <span className="sr-only">Send</span>
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                iconBtn,
                isRecording && "bg-red-500 text-white border-red-500 hover:bg-red-600 hover:border-red-600",
                (disabled || isProcessing) && "opacity-50 cursor-not-allowed"
              )}
              onClick={handleVoiceRecording}
              disabled={disabled || isProcessing}
              title={isRecording ? "Stop recording" : "Start voice recording"}
              aria-label={isRecording ? "Stop recording" : "Start voice recording"}
              aria-pressed={isRecording}
            >
              {isRecording ? (
                <Square size={20} aria-hidden="true" />
              ) : (
                <Mic size={20} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </form>
      
      {/* Hidden element for screen readers during recording */}
      {isRecording && (
        <div id="recording-status" className="sr-only" aria-live="assertive" aria-atomic="true">
          Recording in progress. {formatRecordingTime(recordingTime)} elapsed.
        </div>
      )}
    </div>
  );
};

export default InputArea;