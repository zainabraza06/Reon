"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Message, MediaForUI, DecryptedMediaForUI } from "@/types";
import { formatTime } from "@/lib/utils";
import { Clock, Check, CheckCheck, Lock, Image as ImageIcon, Video, Music, File, Download, Eye, Loader2, Play, Pause } from "lucide-react";
import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  currentUserId: string;
  onDecrypt: (message: Message) => Promise<string | null>;
  onDecryptMedia?: (messageId: string, mediaIndex: number) => Promise<DecryptedMediaForUI | undefined>;
  decryptedText?: string;
  decryptedMedia?: DecryptedMediaForUI[];
}

const isDecryptedMedia = (media: MediaForUI | DecryptedMediaForUI): media is DecryptedMediaForUI => {
  return '_isDecrypted' in media;
};

const isBlob = (obj: unknown): obj is Blob => {
  return obj instanceof Blob;
};

const isFile = (obj: unknown): obj is File => {
  return obj instanceof File;
};

const isString = (obj: unknown): obj is string => {
  return typeof obj === 'string';
};

const isBlobOrFile = (obj: unknown): obj is Blob | File => {
  return isBlob(obj) || isFile(obj);
};

// Helper to extract fileId from URL
const extractFileIdFromUrl = (url: string): string | null => {
  if (!url) return null;
  
  const patterns = [
    /\/api\/messages\/media\/([a-f\d]{24})/i,
    /\/api\/messages\/files\/([a-f\d]{24})/i,
    /\/media\/([a-f\d]{24})/i,
    /\/files\/([a-f\d]{24})/i
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  currentUserId,
  onDecrypt,
  onDecryptMedia,
  decryptedText,
  decryptedMedia = []
}) => {
  const [decrypting, setDecrypting] = useState(false);
  const [decryptingMedia, setDecryptingMedia] = useState<Record<number, boolean>>({});
  const [showEncrypted, setShowEncrypted] = useState(false);
  const [localDecryptedText, setLocalDecryptedText] = useState(decryptedText || null);
  const [isImageLoaded, setIsImageLoaded] = useState<Record<number, boolean>>({});
  const [localDecryptedMedia, setLocalDecryptedMedia] = useState<Record<number, DecryptedMediaForUI>>({});
  const [audioPlaying, setAudioPlaying] = useState<Record<number, boolean>>({});
  const [mediaLoadStates, setMediaLoadStates] = useState<Record<number, 'loading' | 'loaded' | 'error' | 'encrypted'>>({});
  
  // FOR REAL-TIME UPDATES
  const [statusUpdateCount, setStatusUpdateCount] = useState(0);
  const prevMessageRef = useRef<Message | null>(null);
  const audioRefs = useRef<Record<number, HTMLAudioElement>>({});
  const blobUrlRefs = useRef<Record<number, string>>({});

  const isTempMessage = useMemo(() => {
    return message.status === 'sending' || !message._id || message._id.startsWith('temp_');
  }, [message.status, message._id]);

  // REAL-TIME: Track message status changes and force re-render
  useEffect(() => {
    const prevMessage = prevMessageRef.current;
    prevMessageRef.current = message;
    
    if (prevMessage && prevMessage._id === message._id) {
      const changes: string[] = [];
      
      if (prevMessage.status !== message.status) {
        changes.push(`status: ${prevMessage.status} → ${message.status}`);
        setStatusUpdateCount(prev => prev + 1); // Force re-render
      }
      if (prevMessage.sent !== message.sent) {
        changes.push(`sent: ${prevMessage.sent} → ${message.sent}`);
        setStatusUpdateCount(prev => prev + 1); // Force re-render
      }
      if (prevMessage.delivered !== message.delivered) {
        changes.push(`delivered: ${prevMessage.delivered} → ${message.delivered}`);
        setStatusUpdateCount(prev => prev + 1); // Force re-render
      }
      if (prevMessage.read !== message.read) {
        changes.push(`read: ${prevMessage.read} → ${message.read}`);
        setStatusUpdateCount(prev => prev + 1); // Force re-render
      }
      
      if (changes.length > 0) {
        console.debug(`🔄 REAL-TIME: Status updated for ${message._id?.substring(0, 8)}: ${changes.join(', ')}`);
      }
    }
  }, [message]);

  // REAL-TIME: Effect specifically for status updates
  useEffect(() => {
    console.debug('📊 Status properties changed:', {
      id: message._id?.substring(0, 8),
      status: message.status,
      sent: message.sent,
      delivered: message.delivered,
      read: message.read,
      isMe
    });
  }, [message.status, message.sent, message.delivered, message.read, message._id, isMe]);

  useEffect(() => {
    if (decryptedText && decryptedText !== localDecryptedText) {
      setLocalDecryptedText(decryptedText);
    }
  }, [decryptedText]);

  // Initialize media load states
  useEffect(() => {
    if (message.media && message.media.length > 0) {
      const newLoadStates: Record<number, 'loading' | 'loaded' | 'error' | 'encrypted'> = {};
      
      message.media.forEach((_, index) => {
        const mediaItem = getMediaItem(index);
        
        if (isDecryptedMedia(mediaItem) && mediaItem._isDecrypted) {
          newLoadStates[index] = 'loaded';
        } else if (isString(mediaItem.url)) {
          newLoadStates[index] = 'encrypted';
        } else {
          newLoadStates[index] = 'loaded';
        }
      });
      
      setMediaLoadStates(newLoadStates);
    }
  }, [message.media]);

  // Auto-decrypt received media
  useEffect(() => {
    if (!isMe && message.media && message.media.length > 0 && onDecryptMedia) {
      message.media.forEach((_, index) => {
        const currentLoadState = mediaLoadStates[index];
        const mediaItem = getMediaItem(index);
        
        if (currentLoadState === 'encrypted' && 
            !isDecryptedMedia(mediaItem) && 
            !decryptingMedia[index] && 
            !localDecryptedMedia[index]) {
          
          setMediaLoadStates(prev => ({ ...prev, [index]: 'loading' }));
          
          setTimeout(() => {
            handleDecryptMedia(index);
          }, 100 * (index + 1));
        }
      });
    }
  }, [isMe, message.media, mediaLoadStates, onDecryptMedia, decryptingMedia, localDecryptedMedia]);

  useEffect(() => {
    if (decryptedMedia && decryptedMedia.length > 0) {
      const mediaMap: Record<number, DecryptedMediaForUI> = {};
      decryptedMedia.forEach((media, index) => {
        if (media && media.url) {
          mediaMap[index] = media;
          setMediaLoadStates(prev => ({ ...prev, [index]: 'loaded' }));
        }
      });
      setLocalDecryptedMedia(prev => ({ ...prev, ...mediaMap }));
    }
  }, [decryptedMedia]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(blobUrlRefs.current).forEach(blobUrl => {
        if (blobUrl && blobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(blobUrl);
        }
      });
      
      Object.values(localDecryptedMedia).forEach(media => {
        if (media && media._previewUrl && media._previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(media._previewUrl);
        }
      });
    };
  }, [localDecryptedMedia]);

  const getMediaItem = (index: number): MediaForUI | DecryptedMediaForUI => {
    if (localDecryptedMedia[index]) {
      return localDecryptedMedia[index];
    }
    
    if (decryptedMedia && decryptedMedia.length > index) {
      const decryptedItem = decryptedMedia[index];
      if (isDecryptedMedia(decryptedItem) && decryptedItem._isDecrypted) {
        return decryptedItem;
      }
    }
    
    return message.media?.[index] || { 
      url: '', 
      type: 'document', 
      fileName: '', 
      fileSize: 0,
      encryptedKey: '',
      senderEncryptedKey: ''
    } as MediaForUI;
  };

  // Handle media decryption
  const handleDecryptMedia = useCallback(async (index: number): Promise<DecryptedMediaForUI | undefined> => {
    if (decryptingMedia[index] || !onDecryptMedia) return;
    
    setDecryptingMedia(prev => ({ ...prev, [index]: true }));
    setMediaLoadStates(prev => ({ ...prev, [index]: 'loading' }));
    
    try {
      const result = await onDecryptMedia(message._id, index);
      
      if (result) {
        // Create preview URLs for decrypted media
        let previewUrl = '';
        
        // Check if url is a Blob or File object
        const urlValue = result.url;
        if (isBlobOrFile(urlValue)) {
          previewUrl = URL.createObjectURL(urlValue);
          blobUrlRefs.current[index] = previewUrl;
        } else if (typeof urlValue === 'string') {
          previewUrl = urlValue;
        }
        
        // Create enhanced result with preview URL
        const enhancedResult: DecryptedMediaForUI = {
          ...result,
          _previewUrl: previewUrl,
          _isDecrypted: true,
          _canPreview: true
        };
        
        setLocalDecryptedMedia(prev => ({
          ...prev,
          [index]: enhancedResult
        }));
        setMediaLoadStates(prev => ({ ...prev, [index]: 'loaded' }));
        return enhancedResult;
      } else {
        setMediaLoadStates(prev => ({ ...prev, [index]: 'error' }));
      }
      
      return undefined;
    } catch (err) {
      console.error(`Failed to decrypt media ${index}:`, err);
      setMediaLoadStates(prev => ({ ...prev, [index]: 'error' }));
      return undefined;
    } finally {
      setDecryptingMedia(prev => ({ ...prev, [index]: false }));
    }
  }, [message._id, onDecryptMedia, decryptingMedia]);

  // Handle download only (requires decrypted media)
  const handleDownloadOnly = async (media: MediaForUI | DecryptedMediaForUI, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const currentMedia = getMediaItem(index);
      
      // Only allow download if media is already decrypted
      if (!isDecryptedMedia(currentMedia) || !currentMedia._isDecrypted) {
        throw new Error('Please decrypt the file first before downloading');
      }
      
      setDecryptingMedia(prev => ({ ...prev, [index]: true }));
      
      await downloadFile(currentMedia as DecryptedMediaForUI, index);
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      alert(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDecryptingMedia(prev => ({ ...prev, [index]: false }));
    }
  };

  const getMediaDisplayUrl = (media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    if (!media || !media.url) return '';
    
    // For decrypted media with preview URLs
    if (isDecryptedMedia(media) && media._previewUrl) {
      return media._previewUrl;
    }
    
    // For encrypted media (backend URLs)
    const urlValue = media.url;
    if (isString(urlValue)) {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      
      if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
        return urlValue;
      }
      
      if (urlValue.startsWith('/')) {
        return `${backendUrl}${urlValue}`;
      }
      
      if (urlValue.includes('/media/') || urlValue.includes('/files/')) {
        return `${backendUrl}/${urlValue}`;
      }
      
      const fileId = extractFileIdFromUrl(urlValue);
      if (fileId) {
        return `${backendUrl}/api/messages/media/${fileId}`;
      }
      
      return urlValue;
    }
    
    // For blob/file objects (decrypted media)
    if (isBlobOrFile(urlValue)) {
      // Check if we already have a blob URL
      if (blobUrlRefs.current[index]) {
        return blobUrlRefs.current[index];
      }
      
      const blobUrl = URL.createObjectURL(urlValue);
      blobUrlRefs.current[index] = blobUrl;
      return blobUrl;
    }
    
    return '';
  };

  const getMediaDownloadUrl = (media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    if (!media || !media.url) return '';
    
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
    
    // For decrypted blobs
    if (isDecryptedMedia(media)) {
      const urlValue = media.url;
      if (isBlobOrFile(urlValue)) {
        if (blobUrlRefs.current[index]) {
          return blobUrlRefs.current[index];
        }
        
        const blobUrl = URL.createObjectURL(urlValue);
        blobUrlRefs.current[index] = blobUrl;
        return blobUrl;
      }
    }
    
    // For encrypted backend URLs
    const urlValue = media.url;
    if (isString(urlValue)) {
      if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
        return urlValue;
      }
      
      // Convert media URL to files URL for download
      if (urlValue.includes('/media/')) {
        return `${backendUrl}${urlValue.replace('/media/', '/files/')}`;
      }
      
      if (urlValue.includes('/api/messages/media/')) {
        const fileId = extractFileIdFromUrl(urlValue);
        if (fileId) {
          return `${backendUrl}/api/messages/files/${fileId}`;
        }
      }
      
      const fileId = extractFileIdFromUrl(urlValue);
      if (fileId) {
        return `${backendUrl}/api/messages/files/${fileId}`;
      }
      
      if (urlValue.startsWith('/')) {
        return `${backendUrl}${urlValue}`;
      }
      
      return urlValue;
    }
    
    return '';
  };

  const getFileName = (media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    try {
      if (media.fileName) {
        return media.fileName
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, '_');
      }
      
      const urlValue = media.url;
      if (isString(urlValue)) {
        const pathParts = urlValue.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        if (lastPart) {
          let fileName = lastPart.split('?')[0];
          try {
            fileName = decodeURIComponent(fileName);
          } catch (e) {
          }
          
          if (fileName.length === 24 && /^[a-f\d]{24}$/i.test(fileName)) {
            const typeName = media.type === 'image' ? 'image' : 
                            media.type === 'video' ? 'video' : 
                            media.type === 'audio' ? 'audio' : 'file';
            return `${typeName}_${index + 1}`;
          }
          
          if (!fileName.includes('.') || fileName.length > 50) {
            const typeName = media.type === 'image' ? 'image' : 
                            media.type === 'video' ? 'video' : 
                            media.type === 'audio' ? 'audio' : 'file';
            fileName = `${typeName}_${index + 1}`;
          }
          
          return fileName.replace(/[<>:"/\\|?*]/g, '_');
        }
      }
      
      if (isFile(urlValue)) {
        return urlValue.name.replace(/[<>:"/\\|?*]/g, '_');
      }
      
      if (isBlob(urlValue) && urlValue.type) {
        const typeName = media.type === 'image' ? 'image' : 
                        media.type === 'video' ? 'video' : 
                        media.type === 'audio' ? 'audio' : 'file';
        return `${typeName}_${index + 1}`;
      }
      
      const typeName = media.type === 'image' ? 'image' : 
                      media.type === 'video' ? 'video' : 
                      media.type === 'audio' ? 'audio' : 'file';
      return `${typeName}_${index + 1}`;
      
    } catch (error) {
      console.error('Error getting filename:', error);
      return `file_${index + 1}`;
    }
  };

  const getFileSize = (media: MediaForUI | DecryptedMediaForUI): string => {
    try {
      if (media.fileSize !== undefined && media.fileSize !== null) {
        return formatFileSize(media.fileSize);
      }
      
      const urlValue = media.url;
      if (isBlobOrFile(urlValue)) {
        return formatFileSize(urlValue.size);
      }
      
      return '';
    } catch (error) {
      return '';
    }
  };

  const formatFileSize = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const downloadFile = async (media: MediaForUI | DecryptedMediaForUI, index: number) => {
    try {
      const fileName = getFileName(media, index);
      const downloadUrl = getMediaDownloadUrl(media, index);
      
      if (!downloadUrl) {
        throw new Error('No download URL available');
      }
      
      // Create a temporary anchor element for download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Don't revoke blob URLs immediately for download
      if (downloadUrl.startsWith('blob:')) {
        setTimeout(() => {
          URL.revokeObjectURL(downloadUrl);
          delete blobUrlRefs.current[index];
        }, 10000); // Revoke after 10 seconds
      }
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      throw error;
    }
  };

  const toggleAudioPlay = (index: number) => {
    const audio = audioRefs.current[index];
    const loadState = mediaLoadStates[index];
    
    if (audio && loadState === 'loaded') {
      if (audio.paused) {
        // Ensure audio source is set
        const mediaItem = getMediaItem(index);
        const audioUrl = getMediaDisplayUrl(mediaItem, index);
        if (audioUrl && audioUrl !== audio.src) {
          audio.src = audioUrl;
        }
        
        audio.play().then(() => {
          setAudioPlaying(prev => ({ ...prev, [index]: true }));
        }).catch(err => {
          console.error('Failed to play audio:', err);
          console.error('Audio error details:', audio.error);
          setMediaLoadStates(prev => ({ ...prev, [index]: 'error' }));
        });
      } else {
        audio.pause();
        setAudioPlaying(prev => ({ ...prev, [index]: false }));
      }
    }
  };

  const handleAudioEnded = (index: number) => {
    setAudioPlaying(prev => ({ ...prev, [index]: false }));
  };

  const handleAudioPlay = (index: number) => {
    setAudioPlaying(prev => ({ ...prev, [index]: true }));
  };

  const handleAudioPause = (index: number) => {
    setAudioPlaying(prev => ({ ...prev, [index]: false }));
  };

  const decryptMessage = useCallback(async () => {
    if (decrypting) return;
    
    setDecrypting(true);
    setShowEncrypted(false);

    try {
      const decrypted = await onDecrypt(message);
      setLocalDecryptedText(decrypted);
    } catch (err) {
      console.error("Failed to decrypt message:", err);
      setShowEncrypted(true);
    } finally {
      setDecrypting(false);
    }
  }, [message, decrypting, onDecrypt]);

  useEffect(() => {
    if (!isMe && !localDecryptedText && message.ciphertext && !decrypting) {
      decryptMessage();
    }
  }, [localDecryptedText, decryptMessage, message, decrypting, isMe]);

  // REAL-TIME: Use useMemo for message status calculation
  const messageStatus = useMemo(() => {
    console.debug(`🔍 getMessageStatus calculated for message ${message._id?.substring(0, 8)}:`, {
      isMe,
      isTempMessage,
      status: message.status,
      sent: message.sent,
      delivered: message.delivered,
      read: message.read,
      statusUpdateCount
    });

    if (!isMe) return null;

    // Priority 1: Check for Sending state
    if (isTempMessage || message.status === 'sending') {
      return {
        icon: <Clock size={14} className={styles.clockIcon} />,
        title: "Sending...",
        color: "rgba(255, 255, 255, 0.6)"
      };
    }

    // Priority 2: Check for Read (Highest priority for completion)
    // We check either the boolean flag OR the status string
    if (message.read === true || message.status === 'read') {
      return {
        icon: <CheckCheck size={14} className={styles.doubleTickRead} />,
        title: "Read",
        color: "#ffffff"
      };
    }

    // Priority 3: Check for Delivered
    // We check either the boolean flag OR the status string
    if (message.delivered === true || message.status === 'delivered') {
      return {
        icon: <CheckCheck size={14} className={styles.doubleTick} />,
        title: "Delivered",
        color: "rgba(255, 255, 255, 0.6)"
      };
    }

    // Priority 4: Default to Sent
    // If we are here, it's not sending, not read, not delivered, so it must be just sent.
    return {
      icon: <Check size={14} className={styles.singleTick} />,
      title: "Sent",
      color: "rgba(255, 255, 255, 0.6)"
    };
  }, [
    message.status, 
    message.sent, 
    message.delivered, 
    message.read, 
    message._id, 
    isMe, 
    isTempMessage,
    statusUpdateCount
  ]);

  const containerClass = `${styles.container} ${isMe ? styles.sent : styles.received}`;
  const bubbleClass = `${styles.bubble} ${isMe ? styles.sentBubble : styles.receivedBubble}`;
  const metadataClass = `${styles.metadata} ${isMe ? styles.metadataSent : styles.metadataReceived}`;

  const renderMedia = (media: MediaForUI | DecryptedMediaForUI, index: number) => {
    if (!media || !media.url) return null;
    
    const displayUrl = getMediaDisplayUrl(media, index);
    const fileName = getFileName(media, index);
    const fileSize = getFileSize(media);
    const loadState = mediaLoadStates[index];
    const isDecrypted = isDecryptedMedia(media) && media._isDecrypted;
    const isDecrypting = decryptingMedia[index];
    const hasError = isDecryptedMedia(media) && media._error;

    if (loadState === 'loading' || isDecrypting) {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.loadingMediaPlaceholder}>
            <Loader2 className={styles.spinner} size={24} />
            <div className={styles.loadingMediaInfo}>
              <span className={styles.loadingMediaType}>
                {media.type.toUpperCase()} FILE
              </span>
              <span className={styles.loadingMediaText}>
                Decrypting...
              </span>
              {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
            </div>
          </div>
        </div>
      );
    }

    if (loadState === 'encrypted' && !isDecrypted) {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.encryptedMediaPlaceholder}>
            <Lock size={24} className={styles.encryptedIcon} />
            <div className={styles.encryptedMediaInfo}>
              <span className={styles.encryptedMediaType}>
                {media.type.toUpperCase()} FILE
              </span>
              <span className={styles.encryptedMediaText}>
                Encrypted file
              </span>
              {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
            </div>
            <div className={styles.encryptedMediaActions}>
              <button 
                className={styles.decryptButton}
                onClick={async () => await handleDecryptMedia(index)}
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  <>
                    <Loader2 className={styles.spinner} size={16} />
                    <span>Decrypting...</span>
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    <span>Decrypt File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (loadState === 'error' || hasError) {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.errorMediaPlaceholder}>
            <Lock size={24} className={styles.errorIcon} />
            <div className={styles.errorMediaInfo}>
              <span className={styles.errorText}>Decryption Error</span>
              <span className={styles.errorDetail}>{hasError ? media._error : 'Failed to load file'}</span>
            </div>
            <div className={styles.errorMediaActions}>
              <button 
                className={styles.retryButton}
                onClick={async () => await handleDecryptMedia(index)}
              >
                <Loader2 size={16} />
                <span>Retry Decryption</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Only show download button when media is already decrypted
    switch (media.type) {
      case "image":
        return (
          <div className={styles.mediaItem}>
            <div className={styles.imageContainer}>
              <img 
                src={displayUrl} 
                alt={fileName} 
                className={styles.image}
                loading="lazy"
                crossOrigin="anonymous"
                onLoad={() => setIsImageLoaded(prev => ({ ...prev, [index]: true }))}
                onError={(e) => {
                  console.error('Failed to load image:', e);
                  setMediaLoadStates(prev => ({ ...prev, [index]: 'error' }));
                }}
              />
              {!isImageLoaded[index] && (
                <div className={styles.mediaLoading}>
                  <ImageIcon size={24} />
                  <span>Loading image...</span>
                </div>
              )}
              <div className={styles.imageOverlay}>
                <Eye size={20} />
                <span>Click to view</span>
              </div>
            </div>
            {loadState === 'loaded' && (
              <div className={styles.mediaActions}>
                <button 
                  className={styles.downloadButton}
                  onClick={(e) => handleDownloadOnly(media, index, e)}
                  title={`Download ${fileName}`}
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
                {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
              </div>
            )}
          </div>
        );

      case "video":
        return (
          <div className={styles.mediaItem}>
            <div className={styles.videoContainer}>
              <video 
                src={displayUrl} 
                className={styles.videoPlayer}
                preload="metadata"
                crossOrigin="anonymous"
                controls
                onError={(e) => {
                  console.error('Failed to load video:', e);
                  setMediaLoadStates(prev => ({ ...prev, [index]: 'error' }));
                }}
              />
            </div>
            {loadState === 'loaded' && (
              <div className={styles.mediaActions}>
                <button 
                  className={styles.downloadButton}
                  onClick={(e) => handleDownloadOnly(media, index, e)}
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
        return (
          <div className={styles.mediaItem}>
            <div className={styles.audioContainer}>
              <div className={styles.audioIcon}>
                <Music size={32} />
              </div>
              <div className={styles.audioContent}>
                <div className={styles.audioControls}>
                  <button 
                    className={styles.playButton}
                    onClick={() => toggleAudioPlay(index)}
                    disabled={loadState !== 'loaded'}
                    aria-label={audioPlaying[index] ? "Pause audio" : "Play audio"}
                  >
                    {audioPlaying[index] ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <audio 
                    ref={el => { 
                      if (el) {
                        audioRefs.current[index] = el;
                        el.addEventListener('ended', () => handleAudioEnded(index));
                        el.addEventListener('play', () => handleAudioPlay(index));
                        el.addEventListener('pause', () => handleAudioPause(index));
                        
                        // Set the source if not already set
                        const mediaItem = getMediaItem(index);
                        const audioUrl = getMediaDisplayUrl(mediaItem, index);
                        if (audioUrl && audioUrl !== el.src) {
                          el.src = audioUrl;
                        }
                      }
                    }}
                    className={styles.audioPlayer}
                    crossOrigin="anonymous"
                    onError={(e) => {
                      console.error('Audio playback error:', e);
                      const audioEl = e.target as HTMLAudioElement;
                      console.error('Audio error details:', audioEl.error);
                      setMediaLoadStates(prev => ({ ...prev, [index]: 'error' }));
                    }}
                  />
                  <div className={styles.audioInfo}>
                    <span className={styles.audioText}>Audio Message</span>
                    {fileSize && <span className={styles.audioSize}>{fileSize}</span>}
                  </div>
                </div>
                {loadState === 'loaded' && (
                  <div className={styles.audioActions}>
                    <button 
                      className={styles.downloadButton}
                      onClick={(e) => handleDownloadOnly(media, index, e)}
                      title="Download audio"
                      disabled={loadState !== 'loaded'}
                    >
                      <Download size={16} />
                      <span>Download</span>
                    </button>
                  </div>
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
                <File size={32} />
              </div>
              <div className={styles.documentInfo}>
                <span className={styles.documentName}>{fileName}</span>
                {fileSize && <span className={styles.documentSize}>{fileSize}</span>}
              </div>
              {loadState === 'loaded' && (
                <button 
                  className={styles.downloadIconButton}
                  onClick={(e) => handleDownloadOnly(media, index, e)}
                  title={`Download ${fileName}`}
                  aria-label={`Download ${fileName}`}
                  disabled={loadState !== 'loaded'}
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
  };

  return (
    <>
      {/* DEBUG PANEL (optional - remove in production) */}
      {process.env.NODE_ENV === 'development' && isMe && (
        <div className={styles.debugPanel}>
          <details className={styles.debugDetails}>
            <summary className={styles.debugSummary}>
              🐛 Debug: Message {message._id?.substring(0, 8)} - Status: {messageStatus?.title || 'N/A'} (Updates: {statusUpdateCount})
            </summary>
            <div className={styles.debugContent}>
              <pre className={styles.debugPre}>
                Message ID: {message._id}<br/>
                Temp: {isTempMessage.toString()}<br/>
                Status: {message.status || 'undefined'}<br/>
                Sent: {message.sent?.toString() || 'undefined'}<br/>
                Delivered: {message.delivered?.toString() || 'undefined'}<br/>
                Read: {message.read?.toString() || 'undefined'}<br/>
                Sent At: {formatTime(message.sentAt)}<br/>
                Type: {message.type}<br/>
                Is Me: {isMe.toString()}<br/>
                Current User ID: {currentUserId}<br/>
                Media Count: {message.media?.length || 0}<br/>
                Decrypted Media: {Object.keys(localDecryptedMedia).length}
              </pre>
            </div>
          </details>
        </div>
      )}
      
      <div className={containerClass}>
        <div className={bubbleClass}>
          {message.media && message.media.length > 0 && (
            <div className={styles.mediaSection}>
              {message.media.map((_, idx) => {
                const mediaItem = getMediaItem(idx);
                return (
                  <React.Fragment key={idx}>
                    {renderMedia(mediaItem, idx)}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          <div className={styles.content}>
            {localDecryptedText || isMe ? (
              <p className={styles.messageText}>{localDecryptedText || message.text}</p>
            ) : message.ciphertext ? (
              <div className={styles.decryptionContainer}>
                {decrypting ? (
                  <div className={styles.decrypting}>
                    <div className={styles.dots}>
                      <div className={`${styles.dot} ${styles.dot1}`}></div>
                      <div className={`${styles.dot} ${styles.dot2}`}></div>
                      <div className={`${styles.dot} ${styles.dot3}`}></div>
                    </div>
                    <span className={styles.decryptingText}>Decrypting…</span>
                  </div>
                ) : showEncrypted ? (
                  <div className={styles.encrypted}>
                    <Lock size={14} />
                    <button 
                      className={styles.retryButton} 
                      onClick={decryptMessage}
                      aria-label="Retry decryption"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className={styles.encrypted}>
                    <Lock size={14} />
                    <span className={styles.encryptedText}>Encrypted message</span>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.messageText}>{message.text || "Empty message"}</p>
            )}
          </div>

          <div className={metadataClass}>
            <span className={styles.timestamp}>{formatTime(message.sentAt)}</span>
            {isMe && messageStatus && (
              <span 
                className={styles.status} 
                title={messageStatus.title}
                style={{ color: messageStatus.color }}
              >
                {messageStatus.icon}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// REAL-TIME: Custom memo comparison to prevent unnecessary re-renders
export default React.memo(MessageBubble, (prevProps, nextProps) => {
  const shouldUpdate = (
    prevProps.message._id !== nextProps.message._id ||
    prevProps.message.status !== nextProps.message.status ||
    prevProps.message.sent !== nextProps.message.sent ||
    prevProps.message.delivered !== nextProps.message.delivered ||
    prevProps.message.read !== nextProps.message.read ||
    prevProps.message.text !== nextProps.message.text ||
    prevProps.message.ciphertext !== nextProps.message.ciphertext ||
    prevProps.message.media !== nextProps.message.media ||
    prevProps.isMe !== nextProps.isMe ||
    prevProps.decryptedText !== nextProps.decryptedText ||
    prevProps.decryptedMedia !== nextProps.decryptedMedia
  );
  
  return !shouldUpdate;
});