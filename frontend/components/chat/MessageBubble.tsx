"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Message, MediaForUI, DecryptedMediaForUI } from "@/types";
import { formatTime } from "@/lib/utils";
import { Check, CheckCheck, Clock, Image as ImageIcon, Video, Music, File as FileIcon, Download, Play, Pause, Loader2 } from "lucide-react";
import styles from "./MessageBubble.module.css";

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
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      
      if (strUrl.includes('/api/messages/media/')) {
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
      console.log('Setting new audio source');
      audio.src = audioUrl;
    }
    
    if (audio.paused) {
      console.log('Playing audio...');
      audio.play().catch(error => {
        console.error('Failed to play audio:', error);
      });
    } else {
      console.log('Pausing audio...');
      audio.pause();
    }
  }, [processedMedia, getMediaDisplayUrl, audioInitialized]);

  // ✅ Memoized message status
  const messageStatus = useMemo(() => {
    if (!isMe) return null;

    if (isTempMessage || message.status === 'none') {
      return {
        icon: <Clock size={14} className={styles.clockIcon} />,
        title: "Sending...",
      };
    }

    if (message.read === true || message.status === 'read') {
      return {
        icon: <CheckCheck size={14} className={styles.doubleTickRead} />,
        title: "Read",
      };
    }

    if (message.delivered === true || message.status === 'delivered') {
      return {
        icon: <CheckCheck size={14} className={styles.doubleTick} />,
        title: "Delivered",
      };
    }

    return {
      icon: <Check size={14} className={styles.singleTick} />,
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

    // Show loading state while decrypting
    if (loadState === 'loading') {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.loadingMediaPlaceholder}>
            <Loader2 className={styles.spinner} size={24} />
            <div className={styles.loadingMediaInfo}>
              <span className={styles.loadingMediaText}>
                Decrypting {media.type}...
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Show error state
    if (hasError) {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.errorMediaPlaceholder}>
            <FileIcon size={24} className={styles.errorIcon} />
            <div className={styles.errorMediaInfo}>
              <span className={styles.errorText}>Failed to load</span>
            </div>
          </div>
        </div>
      );
    }

    // Show media based on type
    switch (media.type) {
      case "image":
        const imageUrl = getMediaDisplayUrl(media, index);
        return (
          <div className={styles.mediaItem}>
            <div className={styles.imageContainer}>
              <img 
                src={imageUrl} 
                alt={fileName} 
                className={styles.image}
                loading="lazy"
              />
            </div>
            {isDecrypted && (
              <div className={styles.mediaActions}>
                <button 
                  className={styles.downloadButton}
                  onClick={() => downloadFile(media as DecryptedMediaForUI, index)}
                  title={`Download ${fileName}`}
                >
                  <Download size={16} />
                  <span>Download Image</span>
                </button>
                {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
              </div>
            )}
          </div>
        );

      case "video":
        const videoUrl = getMediaDisplayUrl(media, index);
        return (
          <div className={styles.mediaItem}>
            <div className={styles.videoContainer}>
              <video 
                src={isDecrypted ? videoUrl : ''}
                className={styles.videoPlayer}
                preload="metadata"
                controls={isDecrypted}
              />
              {!isDecrypted && (
                <div className={styles.videoLoadingOverlay}>
                  <Video size={24} />
                  <span>Video file</span>
                </div>
              )}
            </div>
            {isDecrypted && (
              <div className={styles.mediaActions}>
                <button 
                  className={styles.downloadButton}
                  onClick={() => downloadFile(media as DecryptedMediaForUI, index)}
                  title={`Download ${fileName}`}
                >
                  <Download size={16} />
                  <span>Download Video</span>
                </button>
                {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
              </div>
            )}
          </div>
        );

      case "audio":
        const audioUrl = getMediaDisplayUrl(media, index);
        
        return (
          <div className={styles.mediaItem}>
            <div className={styles.audioContainer}>
              <div className={styles.audioIcon}>
                <Music size={32} />
              </div>
              <div className={styles.audioContent}>
                <div className={styles.audioControls}>
                  <button 
                    className={`${styles.playButton} ${isDecrypted ? '' : styles.disabled}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('Play button clicked for index:', index, 'isDecrypted:', isDecrypted);
                      if (isDecrypted) {
                        toggleAudioPlay(index);
                      }
                    }}
                    disabled={!isDecrypted}
                    title={isDecrypted ? "Play audio" : "Decrypting audio..."}
                  >
                    {isDecrypted ? (
                      audioPlaying[index] ? <Pause size={16} /> : <Play size={16} />
                    ) : (
                      <Loader2 className={styles.spinnerSmall} size={16} />
                    )}
                  </button>
                  <audio 
                    ref={el => { 
                      if (el && !audioRefs.current[index]) {
                        console.log('Audio ref set for index:', index);
                        audioRefs.current[index] = el;
                      }
                    }}
                    className={styles.audioPlayer}
                    preload="metadata"
                  />
                  <div className={styles.audioInfo}>
                    <span className={styles.audioText}>Audio Message</span>
                    {fileSize && <span className={styles.audioSize}>{fileSize}</span>}
                  </div>
                </div>
                {isDecrypted && (
                  <button 
                    className={styles.downloadButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadFile(media as DecryptedMediaForUI, index);
                    }}
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
          <div className={styles.mediaItem}>
            <div className={styles.documentContainer}>
              <div className={styles.documentIcon}>
                <FileIcon size={32} />
              </div>
              <div className={styles.documentInfo}>
                <span className={styles.documentName}>{fileName}</span>
                {fileSize && <span className={styles.documentSize}>{fileSize}</span>}
              </div>
              {isDecrypted && (
                <button 
                  className={styles.downloadIconButton}
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
    <div className={`${styles.container} ${isMe ? styles.sent : styles.received}`}>
      <div className={`${styles.bubble} ${isMe ? styles.sentBubble : styles.receivedBubble}`}>
        {processedMedia.length > 0 && (
          <div className={styles.mediaSection}>
            {processedMedia.map((media, idx) => (
              <React.Fragment key={`${message._id}-media-${idx}`}>
                {renderMedia(media, idx)}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className={styles.content}>
          <p className={styles.messageText}>
            {displayText}
          </p>
        </div>

        <div className={`${styles.metadata} ${isMe ? styles.metadataSent : styles.metadataReceived}`}>
          <span className={styles.timestamp}>{formatTime(message.sentAt)}</span>
          {isMe && messageStatus && (
            <span 
              className={styles.status} 
              title={messageStatus.title}
            >
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