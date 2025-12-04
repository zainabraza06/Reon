// InputArea.tsx
import React, { useState, useRef } from 'react';
import { Send, Paperclip, Mic, X, FileText, Loader2 } from 'lucide-react';
import { generateAESKey, aesKeyToString } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import styles from './InputArea.module.css'; // Add this import

interface InputAreaProps {
  onSendMessage: (
    text: string,
    files: { file: File; aesKey: string }[]
  ) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
  isRecording?: boolean; // Optional prop for voice recording
}

const InputArea: React.FC<InputAreaProps> = ({ 
  onSendMessage, 
  onTyping, 
  disabled,
  isRecording = false 
}) => {
  const [text, setText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File, preview?: string, type: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    
    if (!typingTimeoutRef.current) {
      onTyping(true);
    } else {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((file: File) => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        type: file.type.split('/')[0]
      }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    const file = selectedFiles[index];
    if (file.preview) {
      URL.revokeObjectURL(file.preview);
    }
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && selectedFiles.length === 0) || isProcessing) return;

    setIsProcessing(true);

    try {
      const encryptedFiles = [];
      for (const item of selectedFiles) {
        const aesKey = await generateAESKey();
        const str = await aesKeyToString(aesKey);
        encryptedFiles.push({ 
          file: item.file, 
          aesKey: str
        });
      }

      await onSendMessage(text, encryptedFiles);
      
      setText('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onTyping(false);
    } catch (error) {
      console.error("Error sending:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={styles.container}>
      {selectedFiles.length > 0 && (
        <div className={styles.filePreviews}>
          {selectedFiles.map((item, idx) => (
            <div key={idx} className={styles.previewItem}>
              {item.preview ? (
                <img 
                  src={item.preview} 
                  alt="preview" 
                  className={styles.previewImage}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <div className={styles.previewIcon}>
                  <FileText size={24} />
                </div>
              )}
              <button 
                onClick={() => removeFile(idx)}
                className={styles.removeButton}
                aria-label="Remove file"
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.inputForm}>
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          className={cn(styles.iconButton, selectedFiles.length > 0 && 'ring-2 ring-blue-500/30')}
          aria-label="Attach file"
          disabled={disabled || isProcessing}
        >
          <Paperclip size={20} />
        </button>
        <input 
          type="file" 
          multiple 
          ref={fileInputRef} 
          className={styles.hiddenInput} 
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          disabled={disabled || isProcessing}
          aria-label='i'
        />

        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className={styles.textInput}
          disabled={disabled || isProcessing}
          aria-label="Message input"
        />

        {text || selectedFiles.length > 0 ? (
          <button 
            type="submit" 
            disabled={disabled || isProcessing}
            className={styles.sendButton}
            aria-label="Send message"
          >
            {isProcessing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} className={cn(isProcessing && styles.animatePulse)} />
            )}
          </button>
        ) : (
          <button 
            type="button"
            className={cn(styles.micButton, isRecording && styles.recording)}
            aria-label={isRecording ? "Stop recording" : "Start voice recording"}
            onClick={() => {
              // Add voice recording logic here
            }}
          >
            <Mic size={20} />
          </button>
        )}
      </form>

      {isProcessing && (
        <div className={styles.typingIndicator}>
          <div className={styles.typingBubble}>
            <span>Sending...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default InputArea;