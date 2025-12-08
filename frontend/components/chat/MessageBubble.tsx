"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Message, GroupMessage, MediaForUI, DecryptedMediaForUI, User } from "@/types";
import { formatTime } from "@/lib/utils";
import { Check, CheckCheck, Lock, Image as ImageIcon, Video, Music, File, Download, Play, Eye, Loader2 } from "lucide-react";
import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  message: Message | GroupMessage;
  isMe: boolean;
  currentUserId: string;
  onDecrypt: (message: Message | GroupMessage) => Promise<string>;
  onDecryptMedia?: (messageId: string, mediaIndex: number) => Promise<DecryptedMediaForUI | undefined>;
  decryptedText?: string;
  decryptedMedia?: DecryptedMediaForUI[];
}

// Type guards
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
  const [localDecryptedText, setLocalDecryptedText] = useState(decryptedText || "");
  const [isImageLoaded, setIsImageLoaded] = useState<Record<number, boolean>>({});
  const [isVideoLoaded, setIsVideoLoaded] = useState<Record<number, boolean>>({});
  const [isPlayingVideo, setIsPlayingVideo] = useState<Record<number, boolean>>({});
  const [localDecryptedMedia, setLocalDecryptedMedia] = useState<Record<number, DecryptedMediaForUI>>({});
  const videoRefs = useRef<Record<number, HTMLVideoElement>>({});
  const audioRefs = useRef<Record<number, HTMLAudioElement>>({});

  // Update local state when prop changes
  useEffect(() => {
    if (decryptedText && decryptedText !== localDecryptedText) {
      setLocalDecryptedText(decryptedText);
    }
  }, [decryptedText]);

  // Initialize local decrypted media from props
  useEffect(() => {
    if (decryptedMedia && decryptedMedia.length > 0) {
      const mediaMap: Record<number, DecryptedMediaForUI> = {};
      decryptedMedia.forEach((media, index) => {
        if (media && media.url) { // Only add if URL exists
          mediaMap[index] = media;
        }
      });
      setLocalDecryptedMedia(prev => ({ ...prev, ...mediaMap }));
    }
  }, [decryptedMedia]);

  // Helper to get media item
  const getMediaItem = (index: number): MediaForUI | DecryptedMediaForUI => {
    // Use locally decrypted media if available
    if (localDecryptedMedia[index]) {
      return localDecryptedMedia[index];
    }
    
    // Use prop decrypted media if available
    if (decryptedMedia && decryptedMedia.length > index) {
      const decryptedItem = decryptedMedia[index];
      if (isDecryptedMedia(decryptedItem) && decryptedItem._isDecrypted) {
        return decryptedItem;
      }
    }
    
    // Fallback to original media from message
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
  const handleDecryptMedia = useCallback(async (index: number) => {
    if (decryptingMedia[index] || !onDecryptMedia) return;
    
    setDecryptingMedia(prev => ({ ...prev, [index]: true }));
    
    try {
      // FIXED: Pass both message._id and index to onDecryptMedia
      const result = await onDecryptMedia(message._id, index);
      
      if (result) {
        // Store in local state
        setLocalDecryptedMedia(prev => ({
          ...prev,
          [index]: result
        }));
        return result;
      }
      
      return undefined;
    } catch (err) {
      console.error(`Failed to decrypt media ${index}:`, err);
      return undefined;
    } finally {
      setDecryptingMedia(prev => ({ ...prev, [index]: false }));
    }
  }, [message._id, onDecryptMedia, decryptingMedia]);

  // Auto-decrypt media if needed (for received messages)
  useEffect(() => {
    if (!isMe && message.media && message.media.length > 0 && onDecryptMedia) {
      message.media.forEach((_, index) => {
        const mediaItem = getMediaItem(index);
        // If media is not decrypted yet
        if (!isDecryptedMedia(mediaItem) || !mediaItem._isDecrypted) {
          // Check if it's already being decrypted
          if (!decryptingMedia[index] && !localDecryptedMedia[index]) {
            // Add a small delay to avoid too many requests at once
            setTimeout(() => {
              handleDecryptMedia(index);
            }, index * 500);
          }
        }
      });
    }
  }, [isMe, message.media, onDecryptMedia, decryptingMedia, localDecryptedMedia, handleDecryptMedia]);

  // Get media URL for display
  const getMediaDisplayUrl = (media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    if (!media || !media.url) return '';
    
    // If media is decrypted and has a preview URL
    if (isDecryptedMedia(media) && media._previewUrl) {
      return media._previewUrl;
    }
    
    // If URL is already a string
    if (isString(media.url)) {
      // If it's a relative URL, prepend backend URL
      if (media.url.startsWith('/')) {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
        return `${backendUrl}${media.url}`;
      }
      return media.url;
    }
    
    // If it's a File or Blob, create object URL
    if (isBlobOrFile(media.url)) {
      const url = URL.createObjectURL(media.url);
      return url;
    }
    
    return '';
  };

  // Helper function to get extension from MIME type
  const getExtensionFromMimeType = (mimeType: string): string => {
    const mimeTypeLower = mimeType.toLowerCase();
    
    const mimeToExt: {[key: string]: string} = {
      // Images
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',
      'image/x-icon': '.ico',
      
      // Videos
      'video/mp4': '.mp4',
      'video/mpeg': '.mpeg',
      'video/ogg': '.ogv',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/x-flv': '.flv',
      'video/x-matroska': '.mkv',
      'video/x-ms-wmv': '.wmv',
      
      // Audio
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/webm': '.weba',
      'audio/aac': '.aac',
      'audio/mp4': '.m4a',
      'audio/flac': '.flac',
      'audio/x-m4a': '.m4a',
      
      // Documents
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.ms-word.document.macroenabled.12': '.docm',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.template': '.dotx',
      'application/vnd.ms-word.template.macroenabled.12': '.dotm',
      'application/vnd.oasis.opendocument.text': '.odt',
      
      // Excel/Spreadsheets
      'application/vnd.ms-excel': '.xls',
      'application/vnd.ms-excel.sheet.macroenabled.12': '.xlsm',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.template': '.xltx',
      'application/vnd.oasis.opendocument.spreadsheet': '.ods',
      
      // PowerPoint/Presentations
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.ms-powerpoint.presentation.macroenabled.12': '.pptm',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.template': '.potx',
      'application/vnd.openxmlformats-officedocument.presentationml.slideshow': '.ppsx',
      'application/vnd.oasis.opendocument.presentation': '.odp',
      
      // Text files
      'text/plain': '.txt',
      'text/html': '.html',
      'text/css': '.css',
      'text/javascript': '.js',
      'text/csv': '.csv',
      'text/rtf': '.rtf',
      'text/xml': '.xml',
      'application/json': '.json',
      
      // Archives
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'application/x-7z-compressed': '.7z',
      'application/x-tar': '.tar',
      'application/gzip': '.gz',
      'application/x-bzip2': '.bz2',
      
      // Other common types
      'application/vnd.android.package-archive': '.apk',
      'application/x-msdownload': '.exe',
      'application/x-shockwave-flash': '.swf',
      'application/octet-stream': '', // Empty for unknown binary
    };
    
    // Try exact match first
    if (mimeToExt[mimeTypeLower]) {
      return mimeToExt[mimeTypeLower];
    }
    
    // Try partial match
    if (mimeTypeLower.startsWith('image/')) return '.jpg';
    if (mimeTypeLower.startsWith('video/')) return '.mp4';
    if (mimeTypeLower.startsWith('audio/')) return '.mp3';
    if (mimeTypeLower.startsWith('text/')) return '.txt';
    if (mimeTypeLower.startsWith('application/vnd.openxmlformats')) return '.docx';
    if (mimeTypeLower.startsWith('application/vnd.ms')) {
      if (mimeTypeLower.includes('word')) return '.doc';
      if (mimeTypeLower.includes('excel')) return '.xls';
      if (mimeTypeLower.includes('powerpoint')) return '.ppt';
    }
    
    return ''; // Return empty string instead of .bin
  };

  // Helper function to get extension from file type
  const getExtensionFromFileType = (fileType: string): string => {
    switch (fileType.toLowerCase()) {
      case 'image':
        return '.jpg';
      case 'video':
        return '.mp4';
      case 'audio':
        return '.mp3';
      case 'document':
      case 'pdf':
        return '.pdf';
      case 'word':
      case 'doc':
        return '.doc';
      case 'docx':
        return '.docx';
      case 'excel':
      case 'xls':
        return '.xls';
      case 'xlsx':
        return '.xlsx';
      case 'powerpoint':
      case 'ppt':
        return '.ppt';
      case 'pptx':
        return '.pptx';
      case 'text':
      case 'txt':
        return '.txt';
      case 'zip':
      case 'archive':
        return '.zip';
      case 'json':
        return '.json';
      default:
        return ''; // Return empty instead of .bin
    }
  };

  // Ensure file has proper extension
  const ensureFileExtension = (
    fileName: string, 
    fileType: string, 
    mimeType?: string,
    media?: MediaForUI | DecryptedMediaForUI
  ): string => {
    // If filename already looks valid, return as is
    if (fileName.includes('.') && !fileName.endsWith('.bin')) {
      const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      // Don't replace if it already has a valid-looking extension
      if (ext.length <= 5 && ext !== '.bin') {
        return fileName;
      }
    }
    
    let extension = '';
    
    // Priority 1: Use mimeType if available
    if (mimeType) {
      extension = getExtensionFromMimeType(mimeType);
      if (extension) {
        const baseName = fileName.includes('.') 
          ? fileName.substring(0, fileName.lastIndexOf('.'))
          : fileName;
        return baseName + extension;
      }
    }
    
    // Priority 2: Check if media is a Blob with type
    if (media && isDecryptedMedia(media) && media.url instanceof Blob) {
      const blobType = media.url.type;
      if (blobType) {
        extension = getExtensionFromMimeType(blobType);
        if (extension) {
          const baseName = fileName.includes('.') 
            ? fileName.substring(0, fileName.lastIndexOf('.'))
            : fileName;
          return baseName + extension;
        }
      }
    }
    
    // Priority 3: Use fileType
    extension = getExtensionFromFileType(fileType);
    if (extension) {
      const baseName = fileName.includes('.') 
        ? fileName.substring(0, fileName.lastIndexOf('.'))
        : fileName;
      return baseName + extension;
    }
    
    // Last resort: check filename pattern
    if (fileName.includes('.')) {
      const existingExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      // Keep existing extension if it's not .bin
      if (existingExt !== '.bin' && existingExt.length <= 5) {
        return fileName;
      }
    }
    
    return fileName; // Return as-is
  };

  // Helper function for downloading decrypted files
  const downloadDecryptedFile = async (media: DecryptedMediaForUI, index: number) => {
    if (!media.url || !(media.url instanceof Blob)) {
      throw new Error('No valid file to download');
    }
    
    // Get filename with proper extension
    const fileName = ensureFileExtension(
      getFileName(media, index),
      media.type,
      media._mimeType,
      media
    );
    
    // Create download link
    const url = URL.createObjectURL(media.url);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log(`✅ Downloaded: ${fileName}`);
  };

  // Updated download handler
  const handleDownload = async (media: MediaForUI | DecryptedMediaForUI, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Start decrypting
      setDecryptingMedia(prev => ({ ...prev, [index]: true }));
      
      // Get the media item (will trigger decryption if needed)
      const currentMedia = getMediaItem(index);
      
      // If not decrypted yet, decrypt it
      if (!isDecryptedMedia(currentMedia) || !currentMedia._isDecrypted) {
        if (!onDecryptMedia) {
          throw new Error('No decryption function available');
        }
        
        // Decrypt the media
        const decrypted = await onDecryptMedia(message._id, index);
        if (!decrypted || !decrypted.url) {
          throw new Error('Failed to decrypt file');
        }
        
        // Update local state
        setLocalDecryptedMedia(prev => ({
          ...prev,
          [index]: decrypted
        }));
        
        // Use the decrypted media for download
        await downloadDecryptedFile(decrypted, index);
      } else {
        // Already decrypted, download directly
        await downloadDecryptedFile(currentMedia as DecryptedMediaForUI, index);
      }
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      alert(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDecryptingMedia(prev => ({ ...prev, [index]: false }));
    }
  };

  // Get file name
  const getFileName = (media: MediaForUI | DecryptedMediaForUI, index: number): string => {
    try {
      // 1. Try to use media.fileName if available
      if (media.fileName) {
        // Clean the filename
        return media.fileName
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, '_');
      }
      
      // 2. If URL is a string, try to extract from URL
      if (isString(media.url)) {
        const url = media.url;
        
        // Try to get filename from URL path
        const pathParts = url.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        if (lastPart) {
          // Remove query parameters if any
          let fileName = lastPart.split('?')[0];
          
          // Decode URI components
          try {
            fileName = decodeURIComponent(fileName);
          } catch (e) {
            // If decoding fails, use as-is
          }
          
          // If it looks like a UUID or random string, create a descriptive name
          if (!fileName.includes('.') || fileName.length > 50) {
            const typeName = media.type === 'image' ? 'image' : 
                            media.type === 'video' ? 'video' : 
                            media.type === 'audio' ? 'audio' : 'file';
            fileName = `${typeName}_${index + 1}`;
          }
          
          return fileName.replace(/[<>:"/\\|?*]/g, '_');
        }
      }
      
      // 3. If it's a File object
      if (isFile(media.url)) {
        return media.url.name.replace(/[<>:"/\\|?*]/g, '_');
      }
      
      // 4. If it's a Blob with type
      if (isBlob(media.url) && media.url.type) {
        const typeName = media.type === 'image' ? 'image' : 
                        media.type === 'video' ? 'video' : 
                        media.type === 'audio' ? 'audio' : 'file';
        return `${typeName}_${index + 1}`;
      }
      
      // 5. Fallback to generic name based on type
      const typeName = media.type === 'image' ? 'image' : 
                      media.type === 'video' ? 'video' : 
                      media.type === 'audio' ? 'audio' : 'file';
      return `${typeName}_${index + 1}`;
      
    } catch (error) {
      console.error('Error getting filename:', error);
      return `file_${index + 1}`;
    }
  };

  // Get file size
  const getFileSize = (media: MediaForUI | DecryptedMediaForUI): string => {
    try {
      // First check if fileSize property exists
      if (media.fileSize !== undefined && media.fileSize !== null) {
        return formatFileSize(media.fileSize);
      }
      
      // Then check if url is a Blob or File with size property
      if (isBlobOrFile(media.url)) {
        return formatFileSize(media.url.size);
      }
      
      return '';
    } catch (error) {
      return '';
    }
  };

  // Format file size
  const formatFileSize = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Toggle video play/pause
  const toggleVideoPlay = (index: number) => {
    const video = videoRefs.current[index];
    if (video) {
      if (video.paused) {
        video.play();
        setIsPlayingVideo(prev => ({ ...prev, [index]: true }));
      } else {
        video.pause();
        setIsPlayingVideo(prev => ({ ...prev, [index]: false }));
      }
    }
  };

  // Toggle audio play/pause
  const toggleAudioPlay = (index: number) => {
    const audio = audioRefs.current[index];
    if (audio) {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    }
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      // Clean up any created object URLs
      Object.values(localDecryptedMedia).forEach(media => {
        if (media && media._previewUrl && media._previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(media._previewUrl);
        }
      });
      
      // Clean up original media URLs
      if (message.media) {
        message.media.forEach((media, index) => {
          if (media && media.url && isString(media.url)) {
            const displayUrl = getMediaDisplayUrl(media, index);
            if (displayUrl.startsWith('blob:')) {
              URL.revokeObjectURL(displayUrl);
            }
          }
        });
      }
    };
  }, [message.media, localDecryptedMedia]);

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

  // Auto-decrypt text message
  useEffect(() => {
    if (!isMe && !localDecryptedText && message.ciphertext && !decrypting) {
      decryptMessage();
    }
  }, [localDecryptedText, decryptMessage, message, decrypting, isMe]);

  // Media rendering
  const renderMedia = (media: MediaForUI | DecryptedMediaForUI, index: number) => {
    if (!media || !media.url) return null;
    
    const displayUrl = getMediaDisplayUrl(media, index);
    const fileName = getFileName(media, index);
    const fileSize = getFileSize(media);
    const isDecrypted = isDecryptedMedia(media) && media._isDecrypted;
    const isDecrypting = decryptingMedia[index];
    const hasError = isDecryptedMedia(media) && media._error;

    // If media is not decrypted yet
    if (!isDecrypted && isString(media.url)) {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.encryptedMediaPlaceholder}>
            {isDecrypting ? (
              <div className={styles.decryptingMedia}>
                <Loader2 className={styles.spinner} size={24} />
                <span>Preparing download...</span>
              </div>
            ) : (
              <>
                <Lock size={24} className={styles.encryptedIcon} />
                <div className={styles.encryptedMediaInfo}>
                  <span className={styles.encryptedMediaType}>
                    {media.type.toUpperCase()} FILE
                  </span>
                  <span className={styles.encryptedMediaText}>
                    {hasError ? 'Error: ' + media._error : 'Encrypted File'}
                  </span>
                  {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
                </div>
                <div className={styles.encryptedMediaActions}>
                  <button 
                    className={styles.downloadButton}
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleDownload(media, index, e);
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? (
                      <>
                        <Loader2 className={styles.spinner} size={16} />
                        <span>Decrypting...</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>Download File</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    // Handle error state
    if (hasError) {
      return (
        <div className={styles.mediaItem}>
          <div className={styles.errorMediaPlaceholder}>
            <Lock size={24} className={styles.errorIcon} />
            <div className={styles.errorMediaInfo}>
              <span className={styles.errorText}>Decryption Error</span>
              <span className={styles.errorDetail}>{media._error}</span>
            </div>
          </div>
        </div>
      );
    }

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
            <div className={styles.mediaActions}>
              <button 
                className={styles.downloadButton}
                onClick={(e) => handleDownload(media, index, e)}
                title={`Download ${fileName}`}
              >
                <Download size={16} />
                <span>Download</span>
              </button>
              {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
            </div>
          </div>
        );

      case "video":
        return (
          <div className={styles.mediaItem}>
            <div className={styles.videoContainer}>
              <div className={styles.videoWrapper}>
                <video 
                  ref={el => { if (el) videoRefs.current[index] = el; }}
                  src={displayUrl} 
                  className={styles.videoPlayer}
                  preload="metadata"
                  crossOrigin="anonymous"
                  onLoadedData={() => setIsVideoLoaded(prev => ({ ...prev, [index]: true }))}
                  onPlay={() => setIsPlayingVideo(prev => ({ ...prev, [index]: true }))}
                  onPause={() => setIsPlayingVideo(prev => ({ ...prev, [index]: false }))}
                />
                {!isVideoLoaded[index] && (
                  <div className={styles.mediaLoading}>
                    <Video size={24} />
                    <span>Loading video...</span>
                  </div>
                )}
                <div className={styles.videoControls}>
                  <button 
                    className={styles.playButton}
                    onClick={() => toggleVideoPlay(index)}
                    aria-label={isPlayingVideo[index] ? "Pause" : "Play"}
                  >
                    {isPlayingVideo[index] ? "⏸️" : "▶️"}
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.mediaActions}>
              <button 
                className={styles.downloadButton}
                onClick={(e) => handleDownload(media, index, e)}
                title={`Download ${fileName}`}
              >
                <Download size={16} />
                <span>Download Video</span>
              </button>
              {fileSize && <span className={styles.fileSize}>{fileSize}</span>}
            </div>
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
                    aria-label="Play/pause audio"
                  >
                    ▶️
                  </button>
                  <audio 
                    ref={el => { if (el) audioRefs.current[index] = el; }}
                    src={displayUrl} 
                    className={styles.audioPlayer}
                    crossOrigin="anonymous"
                  />
                  <div className={styles.audioInfo}>
                    <span className={styles.audioText}>Audio Message</span>
                    {fileSize && <span className={styles.audioSize}>{fileSize}</span>}
                  </div>
                </div>
                <div className={styles.audioActions}>
                  <button 
                    className={styles.downloadButton}
                    onClick={(e) => handleDownload(media, index, e)}
                    title={`Download audio`}
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case "document":
      case "blob":
        return (
          <div className={styles.mediaItem}>
            <div className={styles.documentContainer}>
              <div className={styles.documentIcon}>
                <File size={32} />
              </div>
              <div className={styles.documentInfo}>
                <span className={styles.documentName}>{fileName}</span>
                {fileSize && <span className={styles.documentSize}>{fileSize}</span>}
                <span className={styles.documentAction}>Click to open</span>
              </div>
              <button 
                className={styles.downloadIconButton}
                onClick={(e) => handleDownload(media, index, e)}
                title={`Download ${fileName}`}
                aria-label={`Download ${fileName}`}
              >
                <Download size={20} />
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Function to determine message status
  const getMessageStatus = () => {
    if (!isMe) return null;

    // For messages I sent:
    if (message.read) {
      return {
        icon: <CheckCheck size={14} className={styles.readIcon} />,
        title: "Read",
        isDoubleCheck: true
      };
    }
    
    if (message.delivered) {
      return {
        icon: <CheckCheck size={14} className={styles.deliveredIcon} />,
        title: "Delivered",
        isDoubleCheck: true
      };
    }
    
    if (message.sent) {
      return {
        icon: <Check size={14} className={styles.sentIcon} />,
        title: "Sent",
        isDoubleCheck: false
      };
    }
    
    return {
      icon: <Check size={14} className={styles.sendingIcon} />,
      title: "Sending...",
      isDoubleCheck: false
    };
  };

  const messageStatus = getMessageStatus();
  const containerClass = `${styles.container} ${isMe ? styles.sent : styles.received}`;
  const bubbleClass = `${styles.bubble} ${isMe ? styles.sentBubble : styles.receivedBubble}`;
  const metadataClass = `${styles.metadata} ${isMe ? styles.metadataSent : styles.metadataReceived}`;

  return (
    <div className={containerClass}>
      {!isMe && message.sender && (
        <span className={styles.senderName}>
          {typeof message.sender === 'object' 
            ? (message.sender as User).username || (message.sender as User).fullName 
            : String(message.sender)
          }
        </span>
      )}

      <div className={bubbleClass}>
        {/* MEDIA SECTION */}
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

        {/* MESSAGE CONTENT */}
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

        {/* TIMESTAMP + STATUS */}
        <div className={metadataClass}>
          <span className={styles.timestamp}>{formatTime(message.sentAt)}</span>
          {isMe && messageStatus && (
            <span className={styles.status} title={messageStatus.title}>
              {messageStatus.icon}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(MessageBubble);