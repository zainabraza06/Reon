// InputArea.tsx
import React, { useState, useRef } from 'react';
import { Send, Paperclip, Mic, X, FileText } from 'lucide-react';
import { generateAESKey,aesKeyToString } from '@/lib/crypto';
import { cn } from '@/lib/utils';

interface InputAreaProps {
  onSendMessage: (
    text: string,
    files: { file: File; aesKey: string }[] // Fixed: removed encryptedData
  ) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, onTyping, disabled }) => {
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
            const str=await aesKeyToString(aesKey);

            encryptedFiles.push({ 
                file: item.file, 
                 aesKey: str // Only file and aesKey
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

  return (
    <div className="ia_container">
      {selectedFiles.length > 0 && (
          <div className="ia_filePreviews">
              {selectedFiles.map((item, idx) => (
                  <div key={idx} className="ia_previewItem">
                      {item.preview ? (
                          <img src={item.preview} alt="preview" className="ia_previewImage" />
                      ) : (
                          <div className="ia_previewIcon">
                              <FileText size={24} />
                          </div>
                      )}
                      <button 
                        onClick={() => removeFile(idx)}
                        className="ia_removeButton"
                        aria-label='h'
                      >
                          <X size={12} />
                      </button>
                  </div>
              ))}
          </div>
      )}

      <form onSubmit={handleSubmit} className="ia_inputForm">
        <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            className="ia_iconButton"
            aria-label='h'
        >
          <Paperclip size={20} />
        </button>
        <input 
            type="file" 
            multiple 
            ref={fileInputRef} 
            className="ia_hiddenInput" 
            onChange={handleFileSelect} 
            aria-label='h'
        />

        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          placeholder="Type a message..."
          className="ia_textInput"
          disabled={disabled || isProcessing}
        />

        {text || selectedFiles.length > 0 ? (
            <button 
                type="submit" 
                disabled={disabled || isProcessing}
                className="ia_sendButton"
                aria-label='h'
            >
            <Send size={20} className={cn(isProcessing && "ia_animatePulse")} />
            </button>
        ) : (
            <button 
                type="button"
                className="ia_micButton"
                aria-label='h'
            >
                <Mic size={20} />
            </button>
        )}
      </form>
    </div>
  );
};

export default InputArea;