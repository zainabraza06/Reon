// InputArea.tsx
import React, { useState, useRef } from 'react';
import { Send, Paperclip, Mic, X, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './InputArea.module.css';

interface InputAreaProps {
  onSendMessage: (
    text: string,
    files: File[] 
  ) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
  isRecording?: boolean;
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
      // Convert selected files to plain File array
      const filesArray = selectedFiles.map(item => item.file);
      
      await onSendMessage(text, filesArray);
      
      // Clear state after successful send
      setText('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onTyping(false);
    } catch (error) {
      console.error("Error sending message:", error);
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

  // Get file icon based on type
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <div className={styles.imageIcon}>🖼️</div>;
      case 'video':
        return <div className={styles.videoIcon}>🎬</div>;
      case 'audio':
        return <div className={styles.audioIcon}>🎵</div>;
      default:
        return <FileText size={24} />;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={styles.container}>
      {selectedFiles.length > 0 && (
        <div className={styles.filePreviews}>
          {selectedFiles.map((item, idx) => (
            <div key={idx} className={styles.previewItem}>
              {item.preview ? (
                <div className={styles.previewContainer}>
                  <img 
                    src={item.preview} 
                    alt="preview" 
                    className={styles.previewImage}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.parentElement!.classList.add(styles.previewError);
                    }}
                  />
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName}>{item.file.name}</span>
                    <span className={styles.fileSize}>{formatFileSize(item.file.size)}</span>
                  </div>
                </div>
              ) : (
                <div className={styles.previewContainer}>
                  <div className={styles.previewIcon}>
                    {getFileIcon(item.type)}
                  </div>
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName}>{item.file.name}</span>
                    <span className={styles.fileSize}>{formatFileSize(item.file.size)}</span>
                  </div>
                </div>
              )}
              <button 
                onClick={() => removeFile(idx)}
                className={styles.removeButton}
                aria-label="Remove file"
                type="button"
                disabled={disabled || isProcessing}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.inputForm}>
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            styles.iconButton, 
            selectedFiles.length > 0 && styles.hasFiles,
            disabled && styles.disabled,
            isProcessing && styles.processing
          )}
          aria-label="Attach file"
          disabled={disabled || isProcessing}
  
        >
          <Paperclip size={20} />
          {selectedFiles.length > 0 && (
            <span className={styles.fileCountBadge}>{selectedFiles.length}</span>
          )}
        </button>
        
        <input 
          type="file" 
          multiple 
          ref={fileInputRef} 
          className={styles.hiddenInput} 
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          disabled={disabled || isProcessing}
          aria-label="Attach files"
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
          onBlur={() => {
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = null;
              onTyping(false);
            }
          }}
        />

        {text.trim() || selectedFiles.length > 0 ? (
          <button 
            type="submit" 
            disabled={disabled || isProcessing}
            className={cn(
              styles.sendButton,
              disabled && styles.disabled,
              isProcessing && styles.processing
            )}
            aria-label="Send message"
          
          >
            {isProcessing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        ) : (
          <button 
            type="button"
            className={cn(
              styles.micButton,
              isRecording && styles.recording,
              disabled && styles.disabled
            )}
            aria-label={isRecording ? "Stop recording" : "Start voice recording"}
            onClick={() => {
              // Add voice recording logic here
            }}
            disabled={disabled || isProcessing}
           
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