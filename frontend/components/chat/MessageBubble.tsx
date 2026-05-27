"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Message, MediaForUI, DecryptedMediaForUI } from "@/types";
import { formatTime } from "@/lib/utils";
import { Check, CheckCheck, Clock, Image as ImageIcon, Video, Music, File as FileIcon, Download, Play, Pause, Loader2 } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  currentUserId: string;
  decryptedText?: string;
  decryptedMedia?: DecryptedMediaForUI[];
}

// Helper function outside component to avoid recreation
const isDecryptedMedia = (media: MediaForUI | DecryptedMediaForUI): media is DecryptedMediaForUI => {
  return '_isDecrypted' in media && media._isDecrypted === true;
};

// Helper function outside component
const isFile = (value: unknown): value is File => {
  return typeof File !== 'undefined' && value instanceof File;
};

// Helper function outside component
const isBlob = (value: unknown): value is Blob => {
  return typeof Blob !== 'undefined' && value instanceof Blob;
};

// Helper function outside component
const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({
  message,
  isMe,
  currentUserId,
  decryptedText,
  decryptedMedia = []
}) => {
  const [audioPlaying, setAudioPlaying] = useState<Record<number, boolean>>({});
  const [audioInitialized, setAudioInitialized] = useState<Record<number, boolean>>({});
  const audioRefs = useRef<Record<number, HTMLAudioElement>>({});
  const eventHandlerRefs = useRef<Record<number, {
    handleEnded: () => void;
    handlePlay: () => void;
    handlePause: () => void;
  }>>({});
  const blobUrlRefs = useRef<Record<number, string>>({});

  // ✅ SIMPLIFIED: Direct computed values
  const isTempMessage = message.status === 'none' || !message._id || message._id.startsWith('temp_');
     // ✅ Process media directly without useEffect
  const processedMedia = useMemo(() => {
    if (!message.media || message.media.length === 0) {
      return [];
    }

    const processed = message.media.map((originalMedia, index) => {
      const decryptedItem = decryptedMedia?.[index];
      return decryptedItem && isDecryptedMedia(decryptedItem) ? decryptedItem : originalMedia;
    });

    return processed;
  }, [message.media, decryptedMedia]);

  // ✅ Media load states derived from processed media
  const mediaLoadStates = useMemo(() => {
    const states: Record<number, 'loading' | 'loaded' | 'error'> = {};
    
    processedMedia.forEach((media, index) => {
      if (isDecryptedMedia(media)) {
        states[index] = 'loaded';
      } else if ('_error' in media && media._error) {
        states[index] = 'error';
      } else {
        states[index] = 'loading';
      }
    });
    
    return states;
  }, [processedMedia]);

  // ✅ Set up and clean up audio event listeners
  useEffect(() => {
    const cleanupFunctions: Array<() => void> = [];
    
    processedMedia.forEach((media, index) => {
      if (media.type === 'audio' && isDecryptedMedia(media) && !audioInitialized[index]) {
        const audio = audioRefs.current[index];
        
        if (audio) {
          // Create event handlers
          const handleEnded = () => {
            setAudioPlaying(prev => ({ ...prev, [index]: false }));
          };
          
          const handlePlay = () => {
            setAudioPlaying(prev => ({ ...prev, [index]: true }));
          };
          
          const handlePause = () => {
            setAudioPlaying(prev => ({ ...prev, [index]: false }));
          };
          
          // Store handlers for cleanup
          eventHandlerRefs.current[index] = {
            handleEnded,
            handlePlay,
            handlePause
          };
          
          // Attach listeners
          audio.addEventListener('ended', handleEnded);
          audio.addEventListener('play', handlePlay);
          audio.addEventListener('pause', handlePause);
          
          // Mark as initialized
          setAudioInitialized(prev => ({ ...prev, [index]: true }));
          
          // Store cleanup function
          cleanupFunctions.push(() => {
            if (audio) {
              audio.removeEventListener('ended', handleEnded);
              audio.removeEventListener('play', handlePlay);
              audio.removeEventListener('pause', handlePause);
            }
            delete eventHandlerRefs.current[index];
          });
        }
      }
    });
    
    // Cleanup function
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [processedMedia, audioInitialized]);

  // ✅ Cleanup all audio resources on unmount
  useEffect(() => {
    return () => {
      // Cleanup audio event listeners and elements
      Object.keys(audioRefs.current).forEach(index => {
        const audio = audioRefs.current[Number(index)];
        if (audio) {
          const handlers = eventHandlerRefs.current[Number(index)];
          if (handlers) {
            audio.removeEventListener('ended', handlers.handleEnded);
            audio.removeEventListener('play', handlers.handlePlay);
            audio.removeEventListener('pause', handlers.handlePause);
          }
          audio.pause();
          audio.src = '';
          audio.load();
        }
      });
      
      // Cleanup blob URLs
      Object.values(blobUrlRefs.current).forEach(blobUrl => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      });
      
      // Clear refs
      audioRefs.current = {};
      eventHandlerRefs.current = {};
      blobUrlRefs.current = {};
    };
  }, []);

  // ✅ Memoized getFileName
  const getFileName = useCallback((media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    try {
      if (media.fileName) {
        return media.fileName;
      }
      
      const urlValue = media.url;
      
      if (!urlValue) {
        return `file_${index}`;
      }
      
      if (typeof urlValue === 'string') {
        const strUrl = urlValue;
        const parts = strUrl.split('/');
        const lastPart = parts[parts.length - 1] || `file_${index}`;
        return decodeURIComponent(lastPart.split('?')[0]);
      }
      
      if (isFile(urlValue)) {
        return urlValue.name;
      }
      
      if (isBlob(urlValue)) {
        if ('fileName' in media && media.fileName) {
          return media.fileName;
        }
        
        return `file_${index}`;
      }
      
      return `file_${index}`;
    } catch (error) {
      return `file_${index}`;
    }
  }, []);

  // ✅ Memoized getFileSize
  const getFileSize = useCallback((media: MediaForUI | DecryptedMediaForUI): string => {
    try {
      if (media.fileSize !== undefined && media.fileSize !== null) {
        return formatFileSize(media.fileSize);
      }
      
      const urlValue = media.url;
      
      if (!urlValue) {
        return '';
      }
      
      if (isFile(urlValue) || isBlob(urlValue)) {
        return formatFileSize(urlValue.size);
      }
      
      return '';
    } catch (error) {
      return '';
    }
  }, []);

  // ✅ Memoized getMediaDisplayUrl
  const getMediaDisplayUrl = useCallback((media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    if (!media) return '';
    
    // For decrypted media with preview URLs
    if ('_previewUrl' in media && media._previewUrl) {
      return media._previewUrl;
    }
    
    const urlValue = media.url;
    
    if (!urlValue) return '';
    
    // Handle string URLs
    if (typeof urlValue === 'string') {
      const strUrl = urlValue;
      
      // Skip processing if it's already a full URL
      if (strUrl.startsWith('http') || strUrl.startsWith('blob:')) {
        return strUrl;
      }
      
      // Handle relative paths
      const backendUrl = 'https://reon-4g0b.onrender.com';
         if (strUrl.includes('/messages/media/')) {
        return `${backendUrl}${strUrl}`;
      }
      
      if (/^[a-f\d]{24}$/i.test(strUrl)) {
        return `${backendUrl}/api/messages/media/${strUrl}`;
      }
      
      return strUrl;
    }
    
    // Handle File/Blob objects
    if (isFile(urlValue) || isBlob(urlValue)) {
      if (blobUrlRefs.current[index]) {
        return blobUrlRefs.current[index];
      }
      
      const blobUrl = URL.createObjectURL(urlValue);
      blobUrlRefs.current[index] = blobUrl;
      return blobUrl;
    }
    
    return '';
  }, []);

  // ✅ Memoized downloadFile
  const downloadFile = useCallback(async (media: DecryptedMediaForUI, index: number) => {
    try {
      const fileName = getFileName(media, index);
      const downloadUrl = media._previewUrl || getMediaDisplayUrl(media, index);
      
      if (!downloadUrl) {
        throw new Error('No download URL available');
      }
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [getFileName, getMediaDisplayUrl]);

  // ✅ Memoized audio handlers
  const toggleAudioPlay = useCallback((index: number) => {
    const mediaItem = processedMedia[index];
    
    if (!mediaItem || !isDecryptedMedia(mediaItem)) {
      console.warn('Media not decrypted or not found');
      return;
    }
    
    const audio = audioRefs.current[index];
    
    if (!audio) {
      console.warn('Audio element not found for index:', index);
      return;
    }
    
    const audioUrl = getMediaDisplayUrl(mediaItem, index);
    
    if (!audioUrl) {
      console.warn('Audio URL not found');
      return;
    }
    
    // Debug log
    console.log('Toggle audio play:', {
      index,
      audioExists: !!audio,
      audioUrl,
      currentSrc: audio.src,
      paused: audio.paused,
      audioInitialized: audioInitialized[index]
    });
    
    // Set audio source if different
    if (audio.src !== audioUrl) {
         audio.src = audioUrl;
    }
    
    if (audio.paused) {
         audio.play().catch(error => {
        console.error('Failed to play audio:', error);
      });
    } else {
         audio.pause();
    }
  }, [processedMedia, getMediaDisplayUrl, audioInitialized]);

  // ✅ Memoized message status
  const messageStatus = useMemo(() => {
    if (!isMe) return null;

    if (isTempMessage || message.status === 'none') {
      return {
        icon: <Clock size={14} className="text-white/50" />,
        title: "Sending...",
      };
    }

    if (message.read === true || message.status === 'read') {
      return {
        icon: <CheckCheck size={14} className="text-[#0e9b9d] drop-shadow-[0_0_4px_rgba(147,197,253,0.3)]" />,
        title: "Read",
      };
    }

    if (message.delivered === true || message.status === 'delivered') {
      return {
        icon: <CheckCheck size={14} className="text-white" />,
        title: "Delivered",
      };
    }

    return {
      icon: <Check size={14} className="text-white" />,
      title: "Sent",
    };
  }, [message.status, message.read, message.delivered, isMe, isTempMessage]);

  // ✅ Memoized display text
  const displayText = useMemo(() => {
    return decryptedText || message.text || (isMe ? "Message sent" : "Encrypted message");
  }, [decryptedText, message.text, isMe]);

  // ✅ Memoized renderMedia
  const renderMedia = useCallback((media: MediaForUI | DecryptedMediaForUI, index: number) => {
    const loadState = mediaLoadStates[index];
    const isDecrypted = isDecryptedMedia(media);
    const fileName = getFileName(media, index);
    const fileSize = getFileSize(media);
    const hasError = loadState === 'error';

    if (loadState === 'loading') {
      return (
        <div className="rounded-[0.875rem] overflow-visible bg-black/20 border border-white/10 relative">
          <div className="flex items-center p-5 bg-white/5 rounded-xl gap-4 relative z-[2]">
            <Loader2 className="animate-spin text-blue-500 w-6 h-6 block" size={24} />
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <span className="text-[0.8125rem] text-white/70">Decrypting {media.type}...</span>
            </div>
          </div>
        </div>
      );
    }

    if (hasError) {
      return (
        <div className="rounded-[0.875rem] overflow-visible bg-black/20 border border-white/10 relative">
          <div className="flex items-center p-5 bg-red-500/10 border border-red-500/30 rounded-xl w-full min-h-[80px] relative z-[2]">
            <FileIcon size={24} className="text-red-400 mr-4 shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <span className="font-semibold text-sm text-red-400">Failed to load</span>
            </div>
          </div>
        </div>
      );
    }

    switch (media.type) {
      case "image":
        const imageUrl = getMediaDisplayUrl(media, index);
        return (
          <div className="rounded-[0.875rem] overflow-visible bg-black/20 border border-white/10 transition-transform hover:scale-[1.01] relative">
            <div className="relative cursor-pointer overflow-hidden rounded-lg">
              <img
                src={imageUrl}
                alt={fileName}
                className="w-full max-h-96 object-cover block bg-gradient-to-br from-slate-800 to-slate-600 transition-transform duration-500 hover:scale-[1.02] sm:max-h-64"
                loading="lazy"
              />
            </div>
            {isDecrypted && (
              <div className="flex items-center justify-between px-4 py-3 bg-black/20 border-t border-white/10 relative z-10">
                <button
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 px-4 py-2 rounded-full text-[0.8125rem] cursor-pointer font-medium hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all touch-manipulation"
                  onClick={() => downloadFile(media as DecryptedMediaForUI, index)}
                  title={`Download ${fileName}`}
                >
                  <Download size={16} />
                  <span>Download Image</span>
                </button>
                {fileSize && <span className="text-xs text-white/60 ml-auto shrink-0">{fileSize}</span>}
              </div>
            )}
          </div>
        );

      case "video":
        const videoUrl = getMediaDisplayUrl(media, index);
        return (
          <div className="rounded-[0.875rem] overflow-visible bg-black/20 border border-white/10 transition-transform hover:scale-[1.01] relative">
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video
                src={isDecrypted ? videoUrl : ''}
                className="w-full max-h-96 block bg-black sm:max-h-64"
                preload="metadata"
                controls={isDecrypted}
              />
              {!isDecrypted && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white gap-2.5 z-[5]">
                  <Video size={24} />
                  <span>Video file</span>
                </div>
              )}
            </div>
            {isDecrypted && (
              <div className="flex items-center justify-between px-4 py-3 bg-black/20 border-t border-white/10 relative z-10">
                <button
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 px-4 py-2 rounded-full text-[0.8125rem] cursor-pointer font-medium hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all touch-manipulation"
                  onClick={() => downloadFile(media as DecryptedMediaForUI, index)}
                  title={`Download ${fileName}`}
                >
                  <Download size={16} />
                  <span>Download Video</span>
                </button>
                {fileSize && <span className="text-xs text-white/60 ml-auto shrink-0">{fileSize}</span>}
              </div>
            )}
          </div>
        );

      case "audio":
        return (
          <div className="rounded-[0.875rem] overflow-visible bg-black/20 border border-white/10 relative">
            <div className="flex items-center p-4 bg-white/5 rounded-lg gap-4 relative isolate">
              <div className="p-3 bg-gradient-to-br from-blue-500/30 to-blue-400/30 rounded-lg shrink-0 z-[2]">
                <Music size={32} />
              </div>
              <div className="flex-1 flex flex-col gap-3 min-w-0 relative z-[2]">
                <div className="flex items-center gap-4 relative z-10">
                  <button
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/20 border-0 text-white cursor-pointer flex items-center justify-center transition-all hover:bg-white/30 hover:scale-110 active:scale-95 relative z-[100] touch-manipulation ${!isDecrypted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={(e) => { e.stopPropagation(); if (isDecrypted) toggleAudioPlay(index); }}
                    disabled={!isDecrypted}
                    title={isDecrypted ? "Play audio" : "Decrypting audio..."}
                  >
                    {isDecrypted ? (
                      audioPlaying[index] ? <Pause size={16} /> : <Play size={16} />
                    ) : (
                      <Loader2 className="animate-spin block w-4 h-4" size={16} />
                    )}
                  </button>
                  <audio
                    ref={el => { if (el && !audioRefs.current[index]) audioRefs.current[index] = el; }}
                    className="absolute top-0 left-0 w-px h-px opacity-0 invisible -z-[1000]"
                    preload="metadata"
                  />
                  <div className="flex-1 flex flex-col gap-1 min-w-0 z-[2]">
                    <span className="font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis">Audio Message</span>
                    {fileSize && <span className="text-xs opacity-70">{fileSize}</span>}
                  </div>
                </div>
                {isDecrypted && (
                  <button
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 px-4 py-2 rounded-full text-[0.8125rem] cursor-pointer font-medium hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all touch-manipulation"
                    onClick={(e) => { e.stopPropagation(); downloadFile(media as DecryptedMediaForUI, index); }}
                    title="Download audio"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );

      case "document":
        return (
          <div className="rounded-[0.875rem] overflow-visible bg-black/20 border border-white/10 relative">
            <div className="flex items-center p-4 bg-white/5 rounded-lg gap-4 cursor-pointer border border-transparent hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5 transition-all relative z-[2]">
              <div className="p-3 bg-gradient-to-br from-blue-500/30 to-blue-400/30 rounded-lg flex items-center justify-center shrink-0">
                <FileIcon size={32} />
              </div>
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <span className="font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap">{fileName}</span>
                {fileSize && <span className="text-xs opacity-70">{fileSize}</span>}
              </div>
              {isDecrypted && (
                <button
                  className="bg-transparent border-0 text-white/70 cursor-pointer p-2 rounded-md flex items-center justify-center shrink-0 z-10 hover:bg-white/10 hover:text-white transition-all"
                  onClick={() => downloadFile(media as DecryptedMediaForUI, index)}
                  title={`Download ${fileName}`}
                >
                  <Download size={20} />
                </button>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [
    mediaLoadStates,
    audioPlaying,
    getFileName,
    getFileSize,
    getMediaDisplayUrl,
    downloadFile,
    toggleAudioPlay
  ]);

  return (
    <div className={`flex flex-col mb-6 max-w-[85%] relative sm:max-w-[90%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
      <div className={`rounded-[1.25rem] px-5 py-4 relative break-words backdrop-blur-xl transition-all shadow-[0_4px_20px_rgba(0,0,0,0.1)] overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.2)] sm:px-4 sm:py-3 sm:rounded-[1rem] ${
        isMe
          ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-tr-lg rounded-br-[1.25rem] rounded-bl-[1.25rem]'
          : 'bg-white/[0.08] text-white rounded-tl-lg rounded-br-[1.25rem] rounded-bl-[1.25rem] border border-white/10'
      }`}>
        {processedMedia.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 sm:mb-3">
            {processedMedia.map((media, idx) => (
              <React.Fragment key={`${message._id}-media-${idx}`}>
                {renderMedia(media, idx)}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="relative z-[1] break-words whitespace-pre-wrap leading-relaxed">
          <p className="text-[0.9375rem] leading-[1.7] m-0 tracking-[0.2px]">{displayText}</p>
        </div>

        <div className={`flex items-center justify-end gap-3 mt-3 text-xs opacity-80 hover:opacity-100 transition-opacity relative z-[1] ${isMe ? 'text-white/90' : 'text-white/70'}`}>
          <span className="font-normal tracking-[0.3px]">{formatTime(message.sentAt)}</span>
          {isMe && messageStatus && (
            <span className="flex items-center justify-center" title={messageStatus.title}>
              {messageStatus.icon}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Optimized comparison function
  
  // Quick check for message ID
  if (prevProps.message._id !== nextProps.message._id) {
    return false;
  }
  
  // Check if isMe changed
  if (prevProps.isMe !== nextProps.isMe) {
    return false;
  }
  
  // Check if decrypted text changed
  if (prevProps.decryptedText !== nextProps.decryptedText) {
    return false;
  }
  
  // Check if message status changed (affects UI)
  if (
    prevProps.message.status !== nextProps.message.status ||
    prevProps.message.read !== nextProps.message.read ||
    prevProps.message.delivered !== nextProps.message.delivered
  ) {
    return false;
  }
  
  // Check decrypted media changes
  const prevDecryptedMedia = prevProps.decryptedMedia || [];
  const nextDecryptedMedia = nextProps.decryptedMedia || [];
  
  if (prevDecryptedMedia.length !== nextDecryptedMedia.length) {
    return false;
  }
  
  // Deep compare only the properties that affect rendering
  for (let i = 0; i < prevDecryptedMedia.length; i++) {
    const prev = prevDecryptedMedia[i];
    const next = nextDecryptedMedia[i];
    
    // Check if media became decrypted
    if (prev?._isDecrypted !== next?._isDecrypted) {
      return false;
    }
    
    // Check if preview URL changed (this would trigger re-render)
    if (prev?._previewUrl !== next?._previewUrl) {
      return false;
    }
  }
  
  return true;
});

MessageBubble.displayName = "MessageBubble";

export default MessageBubble;