import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { 
  Message,  
  Notification,
  User, 
  ChatItem, 
  DecryptedMediaForUI,
  BackendMessage,
  MediaForUI,
} from '@/types';
import {
  ensureRSAKeys,
  encryptFileForRecipient,
  generateAESKey,
  encryptWithAES,
  decryptWithAES,
  bufferToHex,
  decryptFile,
  decryptAESKey,getMimeTypeFromFilename,
} from '@/lib/crypto';

// Import new socket types
import type {
  MessageDeliveredData,
  UserStatusChangedData,
  AuthenticatedData,
  OnlineFriendsResponseData
} from '@/types';

interface UseChatLogicOptions {
  userId: string;
  onError?: (error: string) => void;
  onNewNotification?: (notification: Notification) => void;
}

interface DecryptedMessage {
  [messageId: string]: string;
}

interface PendingDecryption {
  [messageId: string]: boolean;
}



export const useChatLogic = (options: UseChatLogicOptions) => {
  const { userId, onError, onNewNotification } = options;

  // -------------------- State --------------------
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<ChatItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatItem| null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage>({});
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [decryptedMedia, setDecryptedMedia] = useState<Record<string, DecryptedMediaForUI[]>>({});
  const [onlineFriends, setOnlineFriends] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<ChatItem[]>([]);

  // -------------------- Refs --------------------
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(false);
  const pendingDecryptionRef = useRef<PendingDecryption>({});
  const userPublicKeyCache = useRef<Map<string, CryptoKey>>(new Map());
  const onlineFriendsRef = useRef<Set<string>>(new Set());
  

  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Refs for state access inside callbacks to prevent dependency loops (Stale Closures Fix)
  const usersRef = useRef(users);
  const selectedUserRef = useRef(selectedUser);
  const decryptedMessagesRef = useRef(decryptedMessages);

  // Sync refs with state
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { decryptedMessagesRef.current = decryptedMessages; }, [decryptedMessages]);
  useEffect(() => { onlineFriendsRef.current = onlineFriends; }, [onlineFriends]);
  
  useEffect(() => { 
    isMountedRef.current = true; 
    return () => { isMountedRef.current = false; }; 
  }, []);

  useEffect(() => { 
    isLoadingRef.current = isLoading; 
  }, [isLoading]);

  const getUserPublicKey = useCallback(async (userId: string): Promise<CryptoKey | null> => {
    // Check cache first
    if (userPublicKeyCache.current.has(userId)) {
      return userPublicKeyCache.current.get(userId) || null;
    }

    try {
      const response = await api.get(`/keys/publicKey/${userId}`);
      
      if (response.data?.publicKey) {
        const publicKey = await crypto.subtle.importKey(
          "jwk",
          response.data.publicKey,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true,
          ["encrypt"]
        );
        userPublicKeyCache.current.set(userId, publicKey);
        return publicKey;
      }
    } catch (error) {
      console.error(`🔑 [getUserPublicKey] Failed to fetch public key for ${userId}:`, error);
    }
    return null;
  }, []);


  
const decryptSingleMedia = useCallback(async (
  messageId: string,
  mediaIndex: number
): Promise<DecryptedMediaForUI | undefined> => {
  try {
    const message = messages.find(m => m._id === messageId);
    if (!message || !message.media || !message.media[mediaIndex]) {
      return undefined;
    }

    // ✅ SKIP TEMP MESSAGES
    if (message.isTemp) {
    
      return undefined;
    }

    const media = message.media[mediaIndex];
    
    // Determine which encrypted key to use
    const isSender = message.sender === userId;
    const encryptedKey = isSender ? media.senderEncryptedKey : media.encryptedKey;
    
    if (!encryptedKey) {
      console.warn(`⚠️ No encryptedKey for media ${mediaIndex} in message ${messageId}`);
      const errorMedia: DecryptedMediaForUI = {
        url: new Blob([]),
        type: media.type,
        fileName: media.fileName || `file_${mediaIndex}`,
        fileSize: media.fileSize || 0,
        encryptionIV: media.encryptionIV,
        _isDecrypted: false,
        _canPreview: false,
        _mimeType: 'application/octet-stream',
        _previewUrl: '',
        _error: 'No encryption key available'
      };
      
      setDecryptedMedia(prev => {
        const existingMedia = prev[messageId] || [];
        const updatedMedia = [...existingMedia];
        updatedMedia[mediaIndex] = errorMedia;
        return {
          ...prev,
          [messageId]: updatedMedia
        };
      });
      
      return errorMedia;
    }

    // If already a File/Blob (from temp message preview)
    if (media.url instanceof File || media.url instanceof Blob) {
      const decryptedMediaItem: DecryptedMediaForUI = {
        url: media.url,
        type: media.type,
        fileName: media.fileName || `file_${mediaIndex}`,
        fileSize: media.fileSize || media.url.size,
        encryptionIV: media.encryptionIV,
        _isDecrypted: true,
        _canPreview: true,
        _mimeType: media.url.type || getMimeTypeFromFilename(media.fileName || ''),
        _previewUrl: URL.createObjectURL(media.url)
      };
      
      setDecryptedMedia(prev => {
        const existingMedia = prev[messageId] || [];
        const updatedMedia = [...existingMedia];
        updatedMedia[mediaIndex] = decryptedMediaItem;
        return {
          ...prev,
          [messageId]: updatedMedia
        };
      });
      
      return decryptedMediaItem;
    }

    // If it's a string URL, decrypt it
    if (typeof media.url === 'string') {
      // ✅ CHECK IF WE HAVE IV
      if (!media.encryptionIV) {
        console.error(`❌ Missing encryptionIV for media ${mediaIndex} in message ${messageId}`);
        const errorMedia: DecryptedMediaForUI = {
          url: new Blob([]),
          type: media.type,
          fileName: media.fileName || `file_${mediaIndex}`,
          fileSize: media.fileSize || 0,
          encryptionIV: media.encryptionIV,
          _isDecrypted: false,
          _canPreview: false,
          _mimeType: 'application/octet-stream',
          _previewUrl: '',
          _error: 'Missing encryption IV'
        };
        
        setDecryptedMedia(prev => {
          const existingMedia = prev[messageId] || [];
          const updatedMedia = [...existingMedia];
          updatedMedia[mediaIndex] = errorMedia;
          return {
            ...prev,
            [messageId]: updatedMedia
          };
        });
        
        return errorMedia;
      }
      
      try {
        const result = await decryptFile(
          media.url,
          encryptedKey,
          userId
        );
        
        const decryptedMediaItem: DecryptedMediaForUI = {
          url: result.decryptedBlob,
          type: media.type,
          fileName: result.fileName || media.fileName || `file_${mediaIndex}`,
          fileSize: result.decryptedBlob.size,
          encryptionIV: media.encryptionIV,
          _isDecrypted: true,
          _canPreview: true,
          _mimeType: result.mimeType,
          _previewUrl: URL.createObjectURL(result.decryptedBlob),
          _encryptedUrl: media.url
        };
        
        setDecryptedMedia(prev => {
          const existingMedia = prev[messageId] || [];
          const updatedMedia = [...existingMedia];
          updatedMedia[mediaIndex] = decryptedMediaItem;
          return {
            ...prev,
            [messageId]: updatedMedia
          };
        });
        
        return decryptedMediaItem;
      } catch (error) {
        console.error(`🔓 Failed to decrypt media ${mediaIndex}:`, error);
        
        const errorMedia: DecryptedMediaForUI = {
          url: new Blob([]),
          type: media.type,
          fileName: media.fileName || `file_${mediaIndex}`,
          fileSize: media.fileSize || 0,
          encryptionIV: media.encryptionIV,
          _isDecrypted: false,
          _canPreview: false,
          _mimeType: 'application/octet-stream',
          _previewUrl: '',
          _error: error instanceof Error ? error.message : 'Decryption failed'
        };
        
        setDecryptedMedia(prev => {
          const existingMedia = prev[messageId] || [];
          const updatedMedia = [...existingMedia];
          updatedMedia[mediaIndex] = errorMedia;
          return {
            ...prev,
            [messageId]: updatedMedia
          };
        });
        
        return errorMedia;
      }
    }
    
    console.warn(`⚠️ Unknown media type for ${messageId}, index ${mediaIndex}: ${typeof media.url}`);
    return undefined;
    
  } catch (error) {
    console.error(`🔓 Failed to decrypt media:`, error);
    
    const errorMedia: DecryptedMediaForUI = {
      url: new Blob([]),
      type: 'document',
      fileName: 'Error',
      fileSize: 0,
      encryptionIV: '',
      _isDecrypted: false,
      _canPreview: false,
      _mimeType: 'application/octet-stream',
      _previewUrl: '',
      _error: error instanceof Error ? error.message : 'Decryption failed'
    };
    
    setDecryptedMedia(prev => {
      const existingMedia = prev[messageId] || [];
      const updatedMedia = [...existingMedia];
      updatedMedia[mediaIndex] = errorMedia;
      return {
        ...prev,
        [messageId]: updatedMedia
      };
    });
    
    return errorMedia;
  }
}, [messages, userId]);
const decryptMessage = useCallback(async (message: Message) => {
  try {
    if (!isMountedRef.current) return null;
    
    const messageId = message._id;
    
    // ✅ SKIP TEMP MESSAGES
    if (message.isTemp) {
     
      return message.text || null;
    }
    
    // Skip if already decrypted
    if (decryptedMessagesRef.current[messageId]) {
      return decryptedMessagesRef.current[messageId];
    }
    
    if (pendingDecryptionRef.current[messageId]) {
      return null;
    }
    
    pendingDecryptionRef.current[messageId] = true;
    
    let decryptedText = '';
    let hasMedia = false;
    
    // 1. Decrypt TEXT message if it exists
    if (message.ciphertext && message.encryptedKey) {
      try {
        
        
        // Check if encryptedKey is a valid hex string
        if (!message.encryptedKey || message.encryptedKey.length < 10) {
          throw new Error("Invalid encrypted key");
        }
        
        const aesKey = await decryptAESKey(userId, message.encryptedKey);
        decryptedText = await decryptWithAES(aesKey, message.ciphertext);
   
      } catch (error) {
        console.error(`❌ Failed to decrypt text for ${messageId}:`, error);
        decryptedText = '🔒 Could not decrypt message';
      }
    }
    
    // 2. Check if message has media
    hasMedia = (message.media ?? []).length > 0;
    
    // 3. AUTO-DECRYPT MEDIA FILES
    if (hasMedia && message.media) {
      
      
      const processedMedia: DecryptedMediaForUI[] = [];
      
      for (let i = 0; i < message.media.length; i++) {
        try {
          const decryptedMedia = await decryptSingleMedia(messageId, i);
          if (decryptedMedia) {
            processedMedia.push(decryptedMedia);
          }
        } catch (error) {
          console.error(`❌ Failed to auto-decrypt media ${i} for ${messageId}:`, error);
          processedMedia.push({
            url: new Blob([]),
            type: message.media![i].type,
            fileName: message.media![i].fileName || `file_${i}`,
            fileSize: message.media![i].fileSize || 0,
            encryptionIV: message.media![i].encryptionIV,
            _isDecrypted: false,
            _canPreview: false,
            _mimeType: 'application/octet-stream',
            _previewUrl: '',
            _error: error instanceof Error ? error.message : 'Auto-decryption failed'
          });
        }
      }
      
      // Update decrypted media state
      if (processedMedia.length > 0) {
        setDecryptedMedia(prev => ({
          ...prev,
          [messageId]: processedMedia
        }));
      }
    }
    
    // 4. Format display text for UI
    let displayText = decryptedText;
    
    if (decryptedText && hasMedia) {
      const mediaCount = message.media!.length;
      const mediaType = message.media![0].type;
      const mediaIndicator = mediaType === 'image' ? ' 📷' :
                           mediaType === 'video' ? ' 🎬' :
                           mediaType === 'audio' ? ' 🎵' :
                           mediaType === 'document' ? ' 📎' :
                           ' 📦';
      displayText = decryptedText + (mediaCount > 1 ? ` [+${mediaCount - 1} more]` : '') + mediaIndicator;
    }
    else if (!decryptedText && hasMedia) {
      const mediaCount = message.media!.length;
      const mediaType = message.media![0].type;
      
      if (mediaCount > 1) {
        displayText = `${mediaCount} attachments`;
      } else {
        displayText = getMediaPlaceholderText(mediaType);
      }
    }
    else if (!decryptedText && !hasMedia && message.ciphertext) {
      displayText = '🔒 Encrypted message';
    }
    
    // 5. Cache decrypted text
    if (isMountedRef.current && displayText) {
      setDecryptedMessages(prev => ({ 
        ...prev, 
        [messageId]: displayText 
      }));
    }
    
    return displayText;
    
  } catch (error) {
    console.error(`❌ decryptMessage failed for ${message._id}:`, error);
    return null;
  } finally {
    delete pendingDecryptionRef.current[message._id];
  }
}, [userId, decryptSingleMedia]);


const decryptMessageContent = useCallback(async (
  message: Message
): Promise<string> => {
  if (!isMountedRef.current) return '';

  const messageId = message._id;
  
  // ✅ CRITICAL: SKIP TEMP MESSAGES!
  if (message.isTemp) {
    
    return message.text || ''; // Return the text we already have from temp message
  }
  
  // Skip if already decrypted
  if (decryptedMessagesRef.current[messageId]) {
    return decryptedMessagesRef.current[messageId];
  }
  
  if (pendingDecryptionRef.current[messageId]) {
    return '';
  }

  try {
    pendingDecryptionRef.current[messageId] = true;
    
    let decryptedText = '';
    let hasMedia = false;
    const processedMedia: DecryptedMediaForUI[] = [];
    
    // 1. Decrypt TEXT message
    if (message.ciphertext && message.encryptedKey) {
      try {
        const aesKey = await decryptAESKey(userId, message.encryptedKey);
        decryptedText = await decryptWithAES(aesKey, message.ciphertext);
   
      } catch (error) {
        console.error(`🔓 Failed to decrypt text for ${messageId}:`, error);
      }
    }
    
    // 2. Check if message has media
    hasMedia = (message.media ?? []).length > 0;

   
    
    // 3. Process and decrypt media files
    if (hasMedia && message.media) {
      await Promise.all(
        message.media.map(async (media, index) => {
          try {
           
            const encryptedKey = media.encryptedKey;
          
 
            
            // ✅ Check if we have required encryption data
            if (!encryptedKey || !media.encryptionIV) {
              console.warn(`⚠️ Skipping media ${index} for ${messageId} - missing encryption data`);
              processedMedia.push({
                url: new Blob([]),
                type: media.type,
                fileName: media.fileName || 'Unknown file',
                fileSize: media.fileSize || 0,
                encryptionIV: media.encryptionIV,
                _isDecrypted: false,
                _canPreview: false,
                _mimeType: 'application/octet-stream',
                _previewUrl: '',
                _error: 'Missing encryption key or IV'
              });
              return;
            }
            
            // If media.url is already a File/Blob (from temp message)
            if (media.url instanceof File || media.url instanceof Blob) {
        
              
              const mediaForUI: DecryptedMediaForUI = {
                url: media.url,
                type: media.type,
                fileName: media.fileName || `file_${index}`,
                fileSize: media.fileSize || media.url.size,
                encryptionIV: media.encryptionIV,
                _isDecrypted: true,
                _canPreview: true,
                _mimeType: media.url.type || getMimeTypeFromFilename(media.fileName || ''),
                _previewUrl: URL.createObjectURL(media.url),
              };
              
              processedMedia.push(mediaForUI);
              return;
            }
            
            // If media.url is a string URL (from backend)
            if (typeof media.url === 'string') {
              try {
             
                const decryptionResult = await decryptFile(
                  media.url,
                  encryptedKey,
                  userId
                );

           
                
                const mediaForUI: DecryptedMediaForUI = {
                  url: decryptionResult.decryptedBlob,
                  type: media.type,
                  fileName: decryptionResult.fileName || media.fileName || `file_${index}`,
                  fileSize: decryptionResult.decryptedBlob.size,
                  encryptionIV: media.encryptionIV,
                  _isDecrypted: true,
                  _canPreview: true,
                  _mimeType: decryptionResult.mimeType,
                  _previewUrl: URL.createObjectURL(decryptionResult.decryptedBlob),
                  _encryptedUrl: media.url
                };
                
                // Set media-specific properties
                switch (media.type) {
                  case 'image':
                  case 'video':
                  case 'audio':
                    mediaForUI._requiresPlayer = media.type !== 'image';
                    break;
                  case 'document':
                  case 'blob':
                    mediaForUI._canPreview = false;
                    mediaForUI._requiresPlayer = false;
                    break;
                }
                
                processedMedia.push(mediaForUI);
             
                
              } catch (decryptError) {
                console.error(`🔓 Failed to decrypt media ${index}:`, decryptError);
                processedMedia.push({
                  url: new Blob([]),
                  type: media.type,
                  fileName: media.fileName || `file_${index}`,
                  fileSize: media.fileSize || 0,
                  encryptionIV: media.encryptionIV,
                  _isDecrypted: false,
                  _canPreview: false,
                  _mimeType: 'application/octet-stream',
                  _previewUrl: '',
                  _error: `Decryption failed: ${decryptError instanceof Error ? decryptError.message : 'Unknown error'}`
                });
              }
            } else {
              processedMedia.push({
                url: new Blob([]),
                type: media.type,
                fileName: media.fileName || `file_${index}`,
                fileSize: media.fileSize || 0,
                encryptionIV: media.encryptionIV,
                _isDecrypted: false,
                _canPreview: false,
                _mimeType: 'application/octet-stream',
                _previewUrl: '',
                _error: `Unknown media URL type: ${typeof media.url}`
              });
            }
            
          } catch (error) {
            console.error(`🔓 Error processing media ${index}:`, error);
            processedMedia.push({
              url: new Blob([]),
              type: media.type,
              fileName: media.fileName || `file_${index}`,
              fileSize: media.fileSize || 0,
              encryptionIV: media.encryptionIV,
              _isDecrypted: false,
              _canPreview: false,
              _mimeType: 'application/octet-stream',
              _previewUrl: '',
              _error: error instanceof Error ? error.message : 'Processing failed'
            });
          }
        })
      );
      
      // Store processed media in state
      setDecryptedMedia(prev => ({
        ...prev,
        [messageId]: processedMedia
      }));
    }
    
    // 4. Format display text for the chat list
    if (decryptedText && hasMedia) {
      const mediaCount = message.media!.length;
      const mediaType = message.media![0].type;
      const mediaIndicator = mediaType === 'image' ? ' 📷' :
                           mediaType === 'video' ? ' 🎬' :
                           mediaType === 'audio' ? ' 🎵' :
                           mediaType === 'document' ? ' 📎' :
                           ' 📦';
      decryptedText = decryptedText + (mediaCount > 1 ? ` [+${mediaCount - 1} more]` : '') + mediaIndicator;
    }
    else if (!decryptedText && hasMedia) {
      const mediaCount = message.media!.length;
      const mediaType = message.media![0].type;
      
      if (mediaCount > 1) {
        decryptedText = `${mediaCount} attachments`;
      } else {
        decryptedText = getMediaPlaceholderText(mediaType);
      }
    }
    else if (!decryptedText && !hasMedia && message.ciphertext) {
      decryptedText = '🔒 Encrypted message';
    }

    // 5. Cache decrypted text
    if (isMountedRef.current && decryptedText) {
      setDecryptedMessages(prev => ({ 
        ...prev, 
        [messageId]: decryptedText 
      }));
    }

    return decryptedText;
  } catch (error) {
    console.error(`🔓 Decryption failed for ${messageId}:`, error);
    return '';
  } finally {
    delete pendingDecryptionRef.current[messageId];
  }
}, [userId]);

const sendMessage = useCallback(
  async (messageData: {
    ciphertext: string;
    type: "text" | "image" | "audio" | "video" | "document";
    media?: Array<{ file: File; type: "image" | "audio" | "video" | "document" }>;
  }) => {
    const currentSelectedUser = selectedUserRef.current;
    
    if (!userId || !currentSelectedUser || !isMountedRef.current) {
        return;
    }

    try {
      setIsSending(true);

      // ✅ 1. Get public keys
      const recipientPublicKey = await getUserPublicKey(currentSelectedUser._id);
      const senderPublicKey = await getUserPublicKey(userId);
      
      if (!recipientPublicKey || !senderPublicKey) {
        throw new Error("Public key missing");
      }

      // For voice messages
      const isVoiceMessage = messageData.media?.some(m => m.type === "audio") && 
                             (!messageData.ciphertext || messageData.ciphertext === "Voice message");

      let finalText = messageData.ciphertext;
      if (isVoiceMessage && (!finalText || finalText === "Voice message")) {
        finalText = "🎤 Voice message";
      }

      // ✅ 2. Determine if we're sending text separately
      const hasText = finalText.trim() && finalText !== "🎤 Voice message";
      const isVoiceOnly = isVoiceMessage && !hasText; // Voice message without additional text
      
      // ✅ 3. SEND TEXT MESSAGE (if text exists AND it's not a voice-only message)
      if (hasText) {
        await sendTextMessage({
          text: finalText,
          userId,
          recipientId: currentSelectedUser._id,
          recipientPublicKey,
          senderPublicKey,
          contentType: "text",
          isVoiceMessage: false // Only true for pure voice messages
        });
      }

      // ✅ 4. SEND EACH MEDIA FILE AS SEPARATE MESSAGE
      if (messageData.media?.length) {
          for (const mediaItem of messageData.media) {
          // ✅ FIXED: Determine includeText as boolean
          let shouldIncludeText = false;
          
          if (mediaItem.type === "audio") {
            // Audio files should always include text (voice message caption)
            shouldIncludeText = true;
          } else if (!hasText || isVoiceOnly) {
            shouldIncludeText = true;
          }
          
          await sendMediaMessage({
            file: mediaItem.file,
            fileType: mediaItem.type,
            userId,
            recipientId: currentSelectedUser._id,
            recipientPublicKey,
            senderPublicKey,
            isVoiceMessage: mediaItem.type === "audio" && isVoiceMessage,
            includeText: shouldIncludeText // ✅ Now a proper boolean
          });
        }
      }

      // Clear input after successful send
      setNewMessage("");

    } catch (error) {
      console.error("📤 [sendMessage] ❌ Failed to send message:", error);
      onErrorRef.current?.("Failed to send message. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  },
  [userId, getUserPublicKey, decryptMessageContent] // ✅ Added decryptMessageContent to dependencies
);

// Helper function to send text message
const sendTextMessage = async ({
  text,
  userId,
  recipientId,
  recipientPublicKey,
  senderPublicKey,
  contentType,
  isVoiceMessage = false
}: {
  text: string;
  userId: string;
  recipientId: string;
  recipientPublicKey: CryptoKey;
  senderPublicKey: CryptoKey;
  contentType: string;
  isVoiceMessage?: boolean;
}) => {
  let tempMessage: Message | null = null;
  
  try {
    // ✅ Encrypt TEXT
    const textAESKey = await generateAESKey();
    const encryptedText = await encryptWithAES(textAESKey, text);
    const rawAES = await crypto.subtle.exportKey("raw", textAESKey);

    const encKeyRecipient = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      recipientPublicKey,
      rawAES
    );

    const encKeySender = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      senderPublicKey,
      rawAES
    );

    const encryptedTextAESKeyForRecipient = bufferToHex(encKeyRecipient);
    const encryptedTextAESKeyForSender = bufferToHex(encKeySender);

    // ✅ Create FormData for text message
    const formData = new FormData();
    const messagePayload = {
      sender: userId,
      receiver: recipientId,
      ciphertext: encryptedText,
      type: "ratcheted" as const,
      contentType: "text", // Always "text" for text-only messages
      encryptedKey: encryptedTextAESKeyForRecipient,// encrypted AES key with receiver's public key
      senderEncryptedKey: encryptedTextAESKeyForSender,// encrypted AES key with sender's public key for decrypting messages on loading chats between two users
    };

    formData.append("data", JSON.stringify(messagePayload));

    // ✅ Create temp UI message for text
    tempMessage = {
      _id: `temp-text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: userId,
      receiver: recipientId,
      ciphertext: encryptedText,
      text: text,
      type: "ratcheted" as const,
      contentType: "text", // ✅ Fixed: Always "text" for text messages
      encryptedKey: encryptedTextAESKeyForSender,
      senderEncryptedKey: encryptedTextAESKeyForSender,
      media: [],
      sentAt: new Date().toISOString(),
      delivered: false,
      read: false,
      status: "none" as const,
      isTemp: true,
      isVoiceMessage,
    };

    // ✅ Add temp message to UI immediately
    setMessages(prev => tempMessage ? [...prev, tempMessage] : prev);

    // ✅ Send text message via HTTP API
      const response = await api.post("/messages/send", formData, {
      timeout: 60000,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    const responseData = response.data?.data || response.data;
    
    if (responseData?._id) {
        // Replace temp with real message
      const backendMessage = responseData as BackendMessage;
      const uiMessage: Message = {
        ...backendMessage,
        text: text,
        isTemp: false,
        isVoiceMessage,
        media: []
      };

      setMessages(prev =>
        prev.map(msg =>
          msg._id === tempMessage!._id ? uiMessage : msg
        )
      );

      // ✅ CRITICAL: DECRYPT THE REAL MESSAGE
        try {
        const decryptedText = await decryptMessageContent(uiMessage);
          // Store decrypted text
        if (decryptedText) {
          setDecryptedMessages(prev => ({
            ...prev,
            [uiMessage._id]: decryptedText
          }));
        }
      } catch (decryptError) {
        console.error(`❌ Failed to decrypt text message ${uiMessage._id}:`, decryptError);
      }
    }

  } catch (error) {
    console.error("❌ Failed to send text message:", error);
    
    // Mark temp message as failed
    if (tempMessage) {
      setMessages(prev =>
        prev.map(msg =>
          msg._id === tempMessage!._id
            ? { ...msg, isFailed: true }
            : msg
        )
      );
    }
    throw error;
  }
};

// Helper function to send media message
const sendMediaMessage = async ({
  file,
  fileType,
  userId,
  recipientId,
  recipientPublicKey,
  senderPublicKey,
  isVoiceMessage = false,
  includeText = false
}: {
  file: File;
  fileType: "image" | "audio" | "video" | "document";
  userId: string;
  recipientId: string;
  recipientPublicKey: CryptoKey;
  senderPublicKey: CryptoKey;
  isVoiceMessage?: boolean;
  includeText?: boolean;
}) => {
  let tempMessage: Message | null = null;
  
  try {
      // ✅ Encrypt the file
    const { 
      encryptedBlob, 
      encryptedAESKeyForRecipient, 
      encryptedAESKeyForSender,
      ivBase64
    } = await encryptFileForRecipient(
      file, 
      recipientPublicKey, 
      senderPublicKey
    );

    // ✅ Create FormData for media message
    const formData = new FormData();

    // Determine what text to include
    let messageText = "";
    let encryptedText = "";
    let encryptedTextAESKeyForRecipient = "";
    let encryptedTextAESKeyForSender = "";
    
    if (includeText && isVoiceMessage) {
      messageText = "🎤 Voice message";
    } else if (includeText) {
      messageText = `Sent a ${fileType}`;
    }
    
    // Encrypt the text if we have any
    if (messageText) {
      const textAESKey = await generateAESKey();
      encryptedText = await encryptWithAES(textAESKey, messageText);
      const rawAES = await crypto.subtle.exportKey("raw", textAESKey);
      
      const encKeyRecipient = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        recipientPublicKey,
        rawAES
      );
      const encKeySender = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        senderPublicKey,
        rawAES
      );
      
      encryptedTextAESKeyForRecipient = bufferToHex(encKeyRecipient);
      encryptedTextAESKeyForSender = bufferToHex(encKeySender);
    }

    // ✅ Prepare message payload
    const messagePayload = {
      sender: userId,
      receiver: recipientId,
      ciphertext: encryptedText,
      type: "ratcheted" as const,
      contentType: fileType, // ✅ Fixed: Use the actual file type
      encryptedKey: encryptedTextAESKeyForRecipient,
      senderEncryptedKey: encryptedTextAESKeyForSender,
    };

    formData.append("data", JSON.stringify(messagePayload));

    // ✅ Add the encrypted file (single file per request)
    const encryptedFile = new File(
      [encryptedBlob],
      `encrypted_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      { type: 'application/octet-stream' }
    );

    formData.append("files", encryptedFile);
    
    // ✅ Add metadata (with index 0 since it's single file per request)
    formData.append("mediaType", fileType);
    formData.append("mediaEncryptedKey", encryptedAESKeyForRecipient);
    formData.append("mediaSenderEncryptedKey", encryptedAESKeyForSender);
    formData.append("originalName", file.name);
    formData.append("fileSize", file.size.toString());
    
    if (ivBase64) {
      formData.append("encryptionIV", ivBase64);
    }

    // ✅ Create temp UI message for media
    const previewUrl = fileType === "image" || fileType === "video" || fileType === "audio" 
      ? URL.createObjectURL(file) 
      : "";
    
    tempMessage = {
      _id: `temp-media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: userId,
      receiver: recipientId,
      ciphertext: encryptedText,
      text: messageText,
      type: "ratcheted" as const,
      contentType: fileType, // ✅ Fixed: Use the actual file type
      encryptedKey: encryptedTextAESKeyForSender,
      senderEncryptedKey: encryptedTextAESKeyForSender,
      media: [{
        url: previewUrl,
        type: fileType,
        fileName: file.name,
        fileSize: file.size,
        encryptedKey: encryptedAESKeyForRecipient,
        senderEncryptedKey: encryptedAESKeyForSender,
        encryptionIV: ivBase64,
        isEncrypted: true,
        _previewUrl: previewUrl,
      }],
      sentAt: new Date().toISOString(),
      delivered: false,
      read: false,
      status: "none" as const,
      isTemp: true,
      isVoiceMessage,
    };

    // ✅ Add temp message to UI immediately
    setMessages(prev => tempMessage ? [...prev, tempMessage] : prev);

    // ✅ Send media message via HTTP API
      for (const [key, value] of formData.entries()) {
      }

    const response = await api.post("/messages/send", formData, {
      timeout: 60000,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    const responseData = response.data?.data || response.data;
    
    if (responseData?._id) {
        // Replace temp with real message
      const backendMessage = responseData as BackendMessage;
        const uiMessage: Message = {
        ...backendMessage,
        text: messageText,
        isTemp: false,
        isVoiceMessage,
        media: backendMessage.media?.map((backendMedia, index) => {
          return {
            url: backendMedia.url,
            type: backendMedia.type,
            fileName: backendMedia.fileName,
            fileSize: backendMedia.fileSize,
            encryptedKey: backendMedia.senderEncryptedKey,
            encryptionIV: backendMedia.encryptionIV,
            isEncrypted: true,
            downloadUrl: backendMedia.downloadUrl,
            originalName: backendMedia.originalName,
            fileId: backendMedia.fileId,
            _previewUrl: previewUrl
          } as MediaForUI;
        }) || []
      };

      setMessages(prev =>
        prev.map(msg =>
          msg._id === tempMessage!._id ? uiMessage : msg
        )
      );

      // ✅ CRITICAL: DECRYPT THE REAL MEDIA MESSAGE
        try {
        const decryptedText = await decryptMessageContent(uiMessage);
          // Store decrypted text
        if (decryptedText) {
          setDecryptedMessages(prev => ({
            ...prev,
            [uiMessage._id]: decryptedText
          }));
        }
      } catch (decryptError) {
        console.error(`❌ Failed to decrypt media message ${uiMessage._id}:`, decryptError);
      }
    }

  } catch (error) {
    console.error(`❌ Failed to send ${fileType} file:`, error);
    
    // Mark temp message as failed
    if (tempMessage) {
      setMessages(prev =>
        prev.map(msg =>
          msg._id === tempMessage!._id
            ? { ...msg, isFailed: true }
            : msg
        )
      );
    }
    
    // Clean up blob URL on error
    if (tempMessage?.media?.[0]?._previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(tempMessage.media[0]._previewUrl);
    }
    throw error;
  } finally {
    // Note: We keep the preview URL in the message for display
    // Cleanup will happen when the message is replaced with real data
  }
};



const loadMessages = useCallback(async (opts?: { limit?: number }) => {
    if (!userId || !selectedUser) {
      return;
  }

  const limit = opts?.limit ?? 50;

  try {
    setIsLoading(true);
    
    // Get latest messages from backend (server returns ascending order)
    const response = await api.get(`/messages/${selectedUser._id}`, { params: { limit } });
    
    if (isMountedRef.current && response?.data?.success && response.data.data) {
      // Convert BackendMessage[] to Message[]
      const backendMessages: BackendMessage[] = response.data.data;
      const uiMessages: Message[] = backendMessages.map(backendMsg => ({
        ...backendMsg,
        text: '', // Will be decrypted
        media: backendMsg.media?.map(backendMedia => ({
          url: backendMedia.url,
          type: backendMedia.type,
          fileName: backendMedia.fileName,
          fileSize: backendMedia.fileSize,
          encryptedKey: backendMedia.encryptedKey,
          senderEncryptedKey: backendMedia.senderEncryptedKey,
          encryptionIV: backendMedia.encryptionIV,
          isEncrypted: true,
          downloadUrl: backendMedia.downloadUrl,
          originalName: backendMedia.originalName,
          fileId: backendMedia.fileId,
        } as MediaForUI)) || []
      }));
        // Set messages (uiMessages are ascending oldest->newest)
      setMessages(uiMessages);
      
      // ✅ USE decryptMessageContent INSTEAD OF decryptMessage
      // Decrypt messages in batches
      const batchSize = 3;
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < uiMessages.length; i += batchSize) {
        const batch = uiMessages.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(async (message) => {
            try {
              const result = await decryptMessageContent(message); // ✅ Changed this
              return { id: message._id, success: true, result };
            } catch (error) {
              return { id: message._id, success: false, error };
            }
          })
        );
        
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
          } else {
            errorCount++;
          }
        });
        
        // Small delay between batches
        if (i + batchSize < uiMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      } else {
      console.error('❌ Invalid response format:', response?.data);
      onErrorRef.current?.('Invalid response from server');
    }
  } catch (error) {
    console.error('❌ Failed to load messages:', error);
    onErrorRef.current?.('Failed to load messages');
  } finally {
    if (isMountedRef.current) {
      setIsLoading(false);
    }
  }
}, [userId, selectedUser?._id, decryptMessageContent]); // ✅ Changed dependency

// Load older messages before the earliest loaded message
const loadOlderMessages = useCallback(async (opts?: { limit?: number }) => {
  if (!userId || !selectedUser) return;
  if (messages.length === 0) return;

  const limit = opts?.limit ?? 50;
  const earliest = messages[0].sentAt;
  if (!earliest) return;

  try {
    // fetch older messages before earliest
    const response = await api.get(`/messages/${selectedUser._id}`, { params: { limit, before: earliest } });
    if (isMountedRef.current && response?.data?.success && response.data.data) {
      const backendMessages: BackendMessage[] = response.data.data;
      const uiMessages: Message[] = backendMessages.map(backendMsg => ({
        ...backendMsg,
        text: '',
        media: backendMsg.media?.map(backendMedia => ({
          url: backendMedia.url,
          type: backendMedia.type,
          fileName: backendMedia.fileName,
          fileSize: backendMedia.fileSize,
          encryptedKey: backendMedia.encryptedKey,
          senderEncryptedKey: backendMedia.senderEncryptedKey,
          encryptionIV: backendMedia.encryptionIV,
          isEncrypted: true,
          downloadUrl: backendMedia.downloadUrl,
          originalName: backendMedia.originalName,
          fileId: backendMedia.fileId,
        } as MediaForUI)) || []
      }));

      if (uiMessages.length === 0) return;

      // Prepend older messages
      setMessages(prev => [...uiMessages, ...prev]);

      // Decrypt the newly added older messages in background
      for (const msg of uiMessages) {
        decryptMessageContent(msg).catch(err => console.warn('decrypt older failed', err));
      }
    }
  } catch (error) {
    console.error('Failed to load older messages', error);
  }
}, [userId, selectedUser?._id, messages, decryptMessageContent]);



// Helper functions
const getMediaPlaceholderText = (mediaType: string): string => {
  switch (mediaType) {
    case 'image': return '📷 Photo';
    case 'video': return '🎬 Video';
    case 'audio': return '🎵 Audio';
    case 'document': return '📎 Document';
    case 'blob': return '📦 File';
    default: return '📎 Attachment';
  }
};

 const loadChatUsers = useCallback(async () => {
    if (!userId || !isMountedRef.current || isLoadingRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      isLoadingRef.current = true;
      const response = await api.get('/messages/sidebar/list');

      if (isMountedRef.current && response.data) {
        // Get current online friends
        const currentOnlineFriends = onlineFriendsRef.current;
        
        const processedChats = await Promise.all(
          response.data.map(async (chat: ChatItem, index: number) => {
            let decryptedMessage = chat.lastMessage || '';
            let tickStatus: 'none' | 'sent' | 'delivered' | 'read' = 'none';

            try {
              // Decrypt if needed
              if (chat.lastMessage && chat.encryptedKey) {
                const encryptedKey = chat.encryptedKey;

                if (encryptedKey) {
                  try {
                    const aesKey = await decryptAESKey(userId, encryptedKey);
                    decryptedMessage = await decryptWithAES(aesKey, chat.lastMessage);
                  } catch (decryptError: unknown) {
                    console.warn(`👥 [loadChatUsers] Failed to decrypt message for chat ${chat._id}:`, decryptError);
                    decryptedMessage = '[Encrypted message]';
                  }
                }
              }
            } catch (error: unknown) {
              console.error(`👥 [loadChatUsers] Error processing chat item ${chat._id}:`, error);
              decryptedMessage = chat.lastMessage ? '[Encrypted message]' : chat.lastMessage || '';
            }

            // Determine tick status only if current user is the sender
            if (chat.lastMessageSenderId === userId) {
              if (chat.read) {
                tickStatus = 'read';
              } else if (chat.delivered) {
                tickStatus = 'delivered';
              } else if (chat.sent) {
                tickStatus = 'sent';
              } else {
                tickStatus = 'none';
              }

            } else {
              // If message is from another user, no tick status
              tickStatus = 'none';
            }

            // Check if this user is online
            const isOnline = currentOnlineFriends.has(chat._id);

            return {
              ...chat,
              lastMessage: decryptedMessage,
              tickStatus,
              isOnline // Update with our tracked online status
            };
          })
        );
      
        setUsers(processedChats);
      } else {
        setUsers([]);
      }
    } catch (error: unknown) {
      console.error('👥 [loadChatUsers] ❌ Failed to load chat list:', error);
      if (isMountedRef.current) {
        onErrorRef.current?.('Failed to load chat list');
        setUsers([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    }
  }, [userId]);

const handleNewMessage = useCallback(async (message: Message) => {
 

  if (!isMountedRef.current) return;

  const decryptedText = await decryptMessageContent(message);

  setMessages(prev => [...prev, message]);

  const isCurrentUserSender = message.sender === userId;
  const isChatOpen = selectedUserRef.current?._id === message.sender;
  const otherUserId = isCurrentUserSender ? message.receiver : message.sender;

  // ----------------------------
  // STEP 1: FETCH USER (if needed)
  // ----------------------------
  let fetchedUser: User | null = null;
  const userExists = usersRef.current.find(u => u._id === otherUserId);

  if (!userExists) {
    try {
      const res = await api.get(`/auth/details/${otherUserId}`);
      fetchedUser = res.data.data;
    } catch (err) {
      console.error("Failed to fetch user:", err);
    }
  }

  // ----------------------------
  // STEP 2: DETERMINE PREVIEWS
  // ----------------------------
  let lastMessageMedia: "image" | "video" | "audio" | "document" | undefined;
  let sidebarPreview = decryptedText || "";

  if (message.media?.length) {
    const mediaType = message.media[0].type;
    if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
      lastMessageMedia = mediaType as "image" | "video" | "audio" | "document";
      sidebarPreview =
        mediaType === 'image' ? "📷 Photo" :
        mediaType === 'video' ? "🎬 Video" :
        mediaType === 'audio' ? "🎵 Audio" : "📎 Document";
    }
  }

  // ----------------------------
  // STEP 3: UPDATE USERS SIDEBAR
  // ----------------------------
  setUsers(prev => {
    const existingUserIndex = prev.findIndex(u => u._id === otherUserId);
    let updatedUsers: ChatItem[];

    if (existingUserIndex >= 0) {
      // Update existing user
      updatedUsers = prev.map(user => {
        if (user._id !== otherUserId) return user;

        let unread = user.unreadCount || 0;
        if (!isCurrentUserSender && !isChatOpen) unread++;
        if (isChatOpen || isCurrentUserSender) unread = 0;

        return {
          ...user,
          lastMessage: sidebarPreview,
          lastMessageTime: message.sentAt || new Date().toISOString(),
          lastMessageSenderId: message.sender,
          lastMessageMedia,
          unreadCount: unread,
          tickStatus: isCurrentUserSender ? "sent" : user.tickStatus,
          sent: isCurrentUserSender,
          delivered: false,
          read: false
        };
      });
    } else {
      // Add new user
      if (!fetchedUser) return prev;

      const newUser: ChatItem = {
        ...fetchedUser,
        _id: otherUserId,
        lastMessage: sidebarPreview,
        lastMessageTime: message.sentAt || new Date().toISOString(),
        lastMessageSenderId: message.sender,
        lastMessageMedia,
        unreadCount: !isCurrentUserSender && !isChatOpen ? 1 : 0,
        tickStatus: isCurrentUserSender ? "sent" : "none",
        sent: isCurrentUserSender,
        delivered: false,
        read: false
      };

      updatedUsers = [newUser, ...prev];
    }

    return updatedUsers.sort((a, b) =>
      new Date(b.lastMessageTime!).getTime() -
      new Date(a.lastMessageTime!).getTime()
    );
  });

  // ----------------------------
  // STEP 4: UPDATE SEARCH RESULTS
  // ----------------------------
  setSearchResults(prev => {
    const userInSearchResults = prev.find(item => item._id === otherUserId);

    if (!userInSearchResults) return prev;



    let unread = userInSearchResults.unreadCount || 0;
    if (!isCurrentUserSender && !isChatOpen) unread++;

    return prev.map(item => {
      if (item._id !== otherUserId) return item;

      return {
        ...item,
        lastMessage: sidebarPreview,
        lastMessageTime: message.sentAt || new Date().toISOString(),
        lastMessageSenderId: message.sender,
        lastMessageMedia,
        unreadCount: unread,
        tickStatus: isCurrentUserSender ? "sent" : item.tickStatus,
        isOnline: true,
      };
    }).sort((a, b) =>
      new Date(b.lastMessageTime || 0).getTime() -
      new Date(a.lastMessageTime || 0).getTime()
    );
  });

  // ----------------------------
  // STEP 5: MARK AS READ IF CHAT OPEN
  // ----------------------------
  if (selectedUserRef.current && selectedUserRef.current._id === message.sender) {
    try {
   
      await api.put(`/messages/chat/read/${selectedUserRef.current._id}`);

      setUsers(prev =>
        prev.map(u =>
          u._id === selectedUserRef.current?._id ? { ...u, unreadCount: 0 } : u
        )
      );

      setSearchResults(prev =>
        prev.map(item =>
          item._id === selectedUserRef.current?._id ? { ...item, unreadCount: 0 } : item
        )
      );
    } catch (err) {
      console.error("Failed to mark messages as read:", err);
    }
  }
}, [userId, decryptMessageContent]);

const handleMessageDelivered = useCallback(async (data: MessageDeliveredData) => {
    if (!isMountedRef.current) return;
 

  // Update sidebar
  setUsers(prev => {
    return prev.map(user => {
      
      const shouldUpdate = user._id === data.receiverId && 
                          user.lastMessageSenderId === userId &&
                          (user.tickStatus === 'sent' || user.tickStatus=='none');
      
      if (shouldUpdate) {
        return { 
          ...user, 
          tickStatus: 'delivered',
          delivered: true
        };
      }
   
      return user;
    });
  });

  // 🔥 NEW: Also update search results
  setSearchResults(prev => {
    return prev.map(item => {
      const shouldUpdate = item._id === data.receiverId && 
                          item.lastMessageSenderId === userId &&
                          item.tickStatus === 'sent';
      
      if (shouldUpdate) {
     
        return { 
          ...item, 
          tickStatus: 'delivered',
          delivered: true
        };
      }
      return item;
    });
  });

  // Update message in messages array
  setMessages(prev =>
    prev.map(msg => {
      if (msg._id === data.messageId) {
        return { ...msg, delivered: true };
      }
      return msg;
    })
  );

  // Send delivery confirmation
  try {
    socketService.confirmMessageDelivery({
      messageId: data.messageId,
      receiverId: data.receiverId,
      senderId: userId
    });
  } catch (err) {
    console.error('Failed to send delivery confirmation:', err);
  }
}, [userId]);

const handleMessageRead = useCallback(async (data: {
  messageIds: string[];
  readerId: string;

}) => {


  if (!isMountedRef.current) return;

  const { messageIds, readerId } = data;


  // Update sidebar
  setUsers(prev =>
    prev.map(user => {
      // Current user sent messages, update chat with reader
      if ( user._id === readerId) {
        return {
          ...user,
          tickStatus: 'read',
          read: true
        };
      }

      // Current user is reader, update chat with sender
      if (userId === readerId && messageIds.some(id => id === user._id)) {
        return {
          ...user,
          unreadCount: 0,
          ...(user.tickStatus === 'delivered' || user.tickStatus === 'sent' ? { tickStatus: 'read' } : {})
        };
      }
     
      return user;
    })
  );

  // Update search results
  setSearchResults(prev =>
    prev.map(item => {
      if ( item._id === readerId) {
        return {
          ...item,
          tickStatus: 'read',
          read: true
        };
      }

      if (messageIds.some(id => id === item._id)) {
        return {
          ...item,
          unreadCount: 0,
          ...(item.tickStatus === 'delivered' || item.tickStatus === 'sent' ? { tickStatus: 'read' } : {})
        };
      }

      return item;
    })
  );

  // Update messages array
  setMessages(prev =>
    prev.map(msg =>
      messageIds.includes(msg._id) ? { ...msg, read: true, delivered: true } : msg
    )

  );

}, [userId]);



const handleMessageSent = useCallback(async (message: Message) => {
    if (!isMountedRef.current) return;

  const decryptedText = await decryptMessageContent(message);
  
  // Determine tick status based on backend status field
  let tickStatus: 'sent' | 'delivered' = 'sent';
  if (message.status === 'delivered') {
    tickStatus = 'delivered';
  }

  // Update messages list - ONLY update status for the real message ID
  setMessages(prev => {
    
    const messageExists = prev.some(msg => msg._id === message._id);
    
    if (!messageExists) {

      return prev; // Don't add new messages, only update existing ones
    }
    
    const updated = prev.map(msg => {
      // Only update if it's the exact same message ID
      if (msg._id === message._id) {

        return { 
          ...msg, // Keep existing message data (including text)
          status: message.status, // Update status from backend
          delivered: message.delivered || false,
          // Don't overwrite text with undefined
          text: msg.text || decryptedText
        };
      }
      return msg;
    });
    
    return updated;
  });

  // Update sidebar with proper tick status
  setUsers(prev => {
    const receiverId = message.receiver;
    const senderId = message.sender;
    
    // Only update if this is OUR message (we sent it)
    if (senderId !== userId) {
      return prev;
    }
    
    // Check if user exists in sidebar
    const existingUserIndex = prev.findIndex(u => u._id === receiverId);
    
    if (existingUserIndex >= 0) {
      // User exists, update it
      const updatedUsers = prev.map(user => {
        if (user._id === receiverId) {
          // Create sidebar preview
          let sidebarPreview = decryptedText || '';
          let lastMessageMedia: "image" | "video" | "audio" | "document" | undefined;
          
          if (message.media?.length) {
            const mediaType = message.media[0].type;
            const mediaCount = message.media.length;
            
            if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
              lastMessageMedia = mediaType as "image" | "video" | "audio" | "document";
            }
            
            sidebarPreview = mediaType === 'image' ? (mediaCount > 1 ? `📷 ${mediaCount} photos` : '📷 Photo') :
                            mediaType === 'video' ? (mediaCount > 1 ? `🎬 ${mediaCount} videos` : '🎬 Video') :
                            mediaType === 'audio' ? (mediaCount > 1 ? `🎵 ${mediaCount} audio` : '🎵 Audio') : 
                            (mediaCount > 1 ? `📎 ${mediaCount} files` : '📎 File');
          }
          
          return {
            ...user,
            lastMessage: sidebarPreview,
            lastMessageTime: message.sentAt || new Date().toISOString(),
            tickStatus, // Use the determined tick status
            lastMessageSenderId: message.sender,
            lastMessageMedia,
            unreadCount: 0,
            sent: true,
            delivered: message.delivered || false,
            read: false
          };
        }
        return user;
      }).sort((a, b) => {
        const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return timeB - timeA;
      });
      
      return updatedUsers;
    } else {
      // User doesn't exist, add async
      const addUserToSidebar = async () => {
        try {
      
          const response = await api.get(`/auth/details/${receiverId}`);
          
          if (response.data?.success && response.data.data) {
            const userData = response.data.data;
            
            let sidebarPreview = decryptedText || '';
            let lastMessageMedia: "image" | "video" | "audio" | "document" | undefined;
            
            if (message.media?.length) {
              const mediaType = message.media[0].type;
              const mediaCount = message.media.length;
              
              if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
                lastMessageMedia = mediaType as "image" | "video" | "audio" | "document";
              }
              
              sidebarPreview = mediaType === 'image' ? (mediaCount > 1 ? `📷 ${mediaCount} photos` : '📷 Photo') :
                              mediaType === 'video' ? (mediaCount > 1 ? `🎬 ${mediaCount} videos` : '🎬 Video') :
                              mediaType === 'audio' ? (mediaCount > 1 ? `🎵 ${mediaCount} audio` : '🎵 Audio') : 
                              (mediaCount > 1 ? `📎 ${mediaCount} files` : '📎 File');
            }
            
            const newUser: ChatItem = {
              _id: userData._id,
              username: userData.username || `User ${receiverId.substring(0, 6)}`,
              fullName: userData.fullName || `User ${receiverId.substring(0, 6)}`,
              profilePic: userData.profilePic,
              isOnline: userData.isOnline || false,
              lastMessage: sidebarPreview,
              lastMessageTime: message.sentAt || new Date().toISOString(),
              lastMessageSenderId: message.sender,
              lastMessageMedia,
              unreadCount: 0,
              tickStatus, // Use the determined tick status
              sent: true,
              delivered: message.delivered || false,
              read: false
            };
            
        
            
            setUsers(prevUsers => {
              const alreadyExists = prevUsers.some(u => u._id === receiverId);
              if (alreadyExists) {
         
                return prevUsers;
              }
              
              const updated = [newUser, ...prevUsers].sort((a, b) => {
                const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                return timeB - timeA;
              });
              
         
              return updated;
            });
          }
        } catch (error) {
          console.error('❌ Failed to fetch user details:', error);
          
          // Create minimal user as fallback
          let sidebarPreview = decryptedText || '';
          let lastMessageMedia: "image" | "video" | "audio" | "document" | undefined;
          
          if (message.media?.length) {
            const mediaType = message.media[0].type;
            const mediaCount = message.media.length;
            
            if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
              lastMessageMedia = mediaType as "image" | "video" | "audio" | "document";
            }
            
            sidebarPreview = mediaType === 'image' ? (mediaCount > 1 ? `📷 ${mediaCount} photos` : '📷 Photo') :
                            mediaType === 'video' ? (mediaCount > 1 ? `🎬 ${mediaCount} videos` : '🎬 Video') :
                            mediaType === 'audio' ? (mediaCount > 1 ? `🎵 ${mediaCount} audio` : '🎵 Audio') : 
                            (mediaCount > 1 ? `📎 ${mediaCount} files` : '📎 File');
          }
          
          // Create fallback user
          const fallbackUser: ChatItem = {
            _id: receiverId,
            username: `User ${receiverId.substring(0, 6)}`,
            fullName: `User ${receiverId.substring(0, 6)}`,
            profilePic: '',
            isOnline: false,
            lastMessage: sidebarPreview,
            lastMessageTime: message.sentAt || new Date().toISOString(),
            lastMessageSenderId: message.sender,
            lastMessageMedia,
            unreadCount: 0,
            tickStatus, // Use the determined tick status
            sent: true,
            delivered: message.delivered || false,
            read: false
          };
          
          setUsers(prevUsers => {
            const alreadyExists = prevUsers.some(u => u._id === receiverId);
            if (alreadyExists) return prevUsers;
            
            return [fallbackUser, ...prevUsers].sort((a, b) => {
              const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
              const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
              return timeB - timeA;
            });
          });
        }
      };
      
      addUserToSidebar();

      return prev;
    }
  });

  // 🔥 Update search results
  setSearchResults(prev => {

    
    const userInSearchResults = prev.find(item => item._id === message.receiver);
    
    if (!userInSearchResults) {
   
      return prev;
    }


    
    const updatedResults = prev.map(item => {
      if (item._id !== message.receiver) return item;

      let sidebarPreview = decryptedText || '';
      let lastMessageMedia: "image" | "video" | "audio" | "document" | undefined;
      
      if (message.media?.length) {
        const mediaType = message.media[0].type;
        const mediaCount = message.media.length;
        
        if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
          lastMessageMedia = mediaType as "image" | "video" | "audio" | "document";
        }
        
        sidebarPreview = mediaType === 'image' ? (mediaCount > 1 ? `📷 ${mediaCount} photos` : '📷 Photo') :
                        mediaType === 'video' ? (mediaCount > 1 ? `🎬 ${mediaCount} videos` : '🎬 Video') :
                        mediaType === 'audio' ? (mediaCount > 1 ? `🎵 ${mediaCount} audio` : '🎵 Audio') : 
                        (mediaCount > 1 ? `📎 ${mediaCount} files` : '📎 File');
      }

      return {
        ...item,
        lastMessage: sidebarPreview,
        lastMessageTime: message.sentAt || new Date().toISOString(),
        tickStatus, // Use the determined tick status
        lastMessageSenderId: message.sender,
        lastMessageMedia,
        unreadCount: 0,
      };
    }).sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return timeB - timeA;
    });
    

    return updatedResults;
  });
  
  // Log final state
  setTimeout(() => {
 
  }, 100);
}, [userId, decryptMessageContent]);


  const handleUserStatusChanged = useCallback((data: UserStatusChangedData) => {
  if (!isMountedRef.current) {
    return;
  }

  // Update online friends set
  setOnlineFriends(prev => {
    const newSet = new Set(prev);
    if (data.isOnline) {
      newSet.add(data.userId);
    } else {
      newSet.delete(data.userId);
    }
    return newSet;
  });

  // Update users in sidebar
  setUsers(prev => prev.map(item => {
    if (item._id === data.userId) {
      return { 
        ...item, 
        isOnline: data.isOnline,
        
      };
    }
    return item;
  }));

  // Update search results
  setSearchResults(prev => prev.map(item => {
    if (item._id === data.userId) {
      return { 
        ...item, 
        isOnline: data.isOnline,
   
      };
    }
    return item;
  }));

  // 🔥 CRITICAL: Also update selectedUser if it's the same user
  setSelectedUser(prev => {
    if (prev && prev._id === data.userId) {
        return {
        ...prev,
        isOnline: data.isOnline,

      };
    }
    return prev;
  });

}, []);
  

  const handleAuthenticated = useCallback((data: AuthenticatedData) => {
   
    
    setConnectionState('connected');
    
    // Update user's online status
    setUsers(prev => prev.map(item => {
      if (item._id === data.userId) {
        return { ...item, isOnline: true };
      }
      return item;
    }));

    // Request online friends list after authentication
    setTimeout(() => {
      if (socketService.isConnected()) {
        socketService.requestOnlineFriends();
      }
    }, 1000);
  }, []);

  const handleOnlineFriendsResponse = useCallback((data: OnlineFriendsResponseData) => {
   

    if (!isMountedRef.current || !data.success || !Array.isArray(data.onlineFriends)) {
      return;
    }

    // Update online friends state
    const newOnlineFriends = new Set(data.onlineFriends);
    setOnlineFriends(newOnlineFriends);

    // Update users in sidebar - mark online friends as online
    setUsers(prev => {
      return prev.map(user => {
        const isOnline = newOnlineFriends.has(user._id);
        // Only update if status changed
        if (user.isOnline !== isOnline) {
          return {
            ...user,
            isOnline
          };
        }
        return user;
      });
    });

  }, []);

  const handleAuthenticationError = useCallback((error: { message: string }) => {
    console.error(`❌ [SOCKET EVENT] handleAuthenticationError received`);
    
    setConnectionState('error');
    onErrorRef.current?.(error.message);
  }, []);

  const handleSocketDisconnect = useCallback(() => {
      setConnectionState('disconnected');
  }, []);

  const handleSocketError = useCallback((error: { message: string }) => {
    console.error(`❌ [SOCKET EVENT] handleSocketError received:`, error.message);
    onErrorRef.current?.(error.message);
  }, []);

  const searchUsers = useCallback(async (query: string): Promise<ChatItem[]> => {
  try {
    
    
    interface BackendSearchResultItem {
      _id: unknown;
      name: string;
      profilePic?: string | null;
      lastMessage?: string | null;
      lastMessageTime?: string | null;
      lastMessageMedia?: string | null;
      encryptedKey?: string | null;
      unreadCount?: number;
      lastMessageDelivered?: boolean;
      lastMessageRead?: boolean;
      type: "user" | "group";
      username?: string;
      memberCount?: number;
      admin?: string;
    }

    interface SearchResponse {
      success: boolean;
      results: BackendSearchResultItem[];
    }

    const response = await api.get<SearchResponse>(`/messages/search?q=${encodeURIComponent(query)}`);
    
    if (response.data.success && response.data.results) {
   
      
      const formattedResults = await Promise.all(
        response.data.results.map(async (item): Promise<ChatItem> => {
          const id = typeof item._id === 'object' && item._id !== null && 'toString' in item._id
            ? item._id.toString()
            : String(item._id);
          
          let displayMessage = '';
          let lastMessageMediaType: "image" | "video" | "audio" | "document" | undefined;
          
          // 1. Decrypt message if possible
          if (item.lastMessage && item.encryptedKey) {
            try {
              const aesKey = await decryptAESKey(userId, item.encryptedKey);
              displayMessage = await decryptWithAES(aesKey, item.lastMessage);
            } catch (error) {
              displayMessage = 'Encrypted message';
            }
          } 
          // 2. Check for media
          else if (item.lastMessageMedia) {
            const mediaType = item.lastMessageMedia.toLowerCase();
            if (mediaType.includes('image')) {
              displayMessage = '📷 Photo';
              lastMessageMediaType = 'image';
            } else if (mediaType.includes('video')) {
              displayMessage = '🎬 Video';
              lastMessageMediaType = 'video';
            } else if (mediaType.includes('audio')) {
              displayMessage = '🎵 Audio';
              lastMessageMediaType = 'audio';
            } else {
              displayMessage = '📎 Document';
              lastMessageMediaType = 'document';
            }
          }
          // 3. Fallback messages
          else if (item.lastMessage) {
            displayMessage = 'Encrypted message';
          } else {
            displayMessage = 'No messages yet';
          }
          
          // Get online status
          const isOnline = onlineFriendsRef.current.has(id);
          
          // 🔥 CORRECTION: Check if this user exists in our current users list for real-time data
          // This uses the Ref to avoid dependency on rapidly changing state
          const existingUser = usersRef.current.find(u => u._id === id);
          
          // Determine tick status from search results
          const getTickStatus = (): 'none' | 'sent' | 'delivered' | 'read' => {
            if (item.lastMessageRead) return 'read';
            if (item.lastMessageDelivered) return 'delivered';
            return 'none';
          };
          
          // If user exists in our current chat list, merge with their real-time data
          if (existingUser) {
       
            
            const result: ChatItem = {
              _id: id,
              fullName: existingUser.fullName || item.name,
              profilePic: existingUser.profilePic || item.profilePic || undefined,
              isOnline: existingUser.isOnline ?? (item.type === 'user' ? isOnline : undefined),
              lastMessage: existingUser.lastMessage || displayMessage, // Prefer real-time last message
              lastMessageTime: existingUser.lastMessageTime || item.lastMessageTime || undefined,
              lastMessageMedia: existingUser.lastMessageMedia || lastMessageMediaType,
              unreadCount: existingUser.unreadCount || item.unreadCount || 0,
              lastMessageSenderId: existingUser.lastMessageSenderId,
              tickStatus:existingUser.tickStatus || getTickStatus(), // Prefer real-time tick status
              username: existingUser.username || item.username,
              // Group specific fields
              ...(item.type === 'group' && {
                memberCount: item.memberCount,
                admin: item.admin,
              }),
            };
            
            return result;
          }
     
          
          const result: ChatItem = {
            _id: id,
            fullName: item.name,
            profilePic: item.profilePic || undefined,
            isOnline: item.type === 'user' ? isOnline : undefined,
            lastMessage: displayMessage,
            lastMessageTime: item.lastMessageTime || undefined,
            lastMessageMedia: lastMessageMediaType,
            unreadCount: item.unreadCount || 0,
            lastMessageSenderId: undefined,
            tickStatus: getTickStatus(),
            username: item.username,
            // Group specific fields
            ...(item.type === 'group' && {
              memberCount: item.memberCount,
              admin: item.admin,
            }),
          };
          
          return result;
        })
      );

  
      
      // Update search results state
      setSearchResults(formattedResults);


      
      return formattedResults;
    } else {
     
      setSearchResults([]);
      return [];
    }
    
  } catch (error: unknown) {
    console.error('🔍 Search failed:', error);
    setSearchResults([]);
    return [];
  }
}, [userId]); 

// ==================== SIMPLIFIED TYPING LOGIC ====================
const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({}); // userId -> isTyping
const [isUserTyping, setIsUserTyping] = useState(false); // Current user's typing state

// Refs
const typingUsersRef = useRef<Record<string, boolean>>({});
const isUserTypingRef = useRef(false);


// Sync refs with state
useEffect(() => {
  typingUsersRef.current = typingUsers;
}, [typingUsers]);

useEffect(() => {
  isUserTypingRef.current = isUserTyping;
}, [isUserTyping]);

useEffect(() => {
  selectedUserRef.current = selectedUser;
}, [selectedUser]);

// Simple stop typing function
const stopTyping = useCallback(() => {
  const currentSelectedUser = selectedUserRef.current;
  
  if (!currentSelectedUser || !socketService.isConnected()) {
    setIsUserTyping(false);
    isUserTypingRef.current = false;
    return;
  }

  // Only send stop typing if we were actually typing
  if (isUserTypingRef.current) {
 
    
    socketService.stopTyping({
      senderId: userId,
      receiverId: currentSelectedUser._id,
      isTyping: false,
      timestamp: new Date().toISOString()
    });
  }

  // Reset local state
  setIsUserTyping(false);
  isUserTypingRef.current = false;
}, [userId]);

// Simple start typing function
const startTyping = useCallback(() => {
  const currentSelectedUser = selectedUserRef.current;
  
  if (!currentSelectedUser || !socketService.isConnected()) {
    return;
  }

  // Update local state
  setIsUserTyping(true);
  isUserTypingRef.current = true;
 
  
  // Send typing event
  socketService.startTyping({
    senderId: userId,
    receiverId: currentSelectedUser._id,
    isTyping: true,
    timestamp: new Date().toISOString()
  });
}, [userId]);

// SIMPLIFIED triggerTyping - just calls startTyping immediately
const triggerTyping = useCallback(() => {
  if (isMountedRef.current) {
    startTyping();
  }
}, [startTyping]);

// Simplified typing event handler
const handleUserTyping = useCallback((data: {
  senderId: string;
  receiverId: string;
  isTyping: boolean;
  timestamp: string;
}) => {
  if (!isMountedRef.current || data.receiverId !== userId) {
    return;
  }

  const senderId = data.senderId;
  
  if (data.isTyping) {
    // Update typingUsers state
    setTypingUsers(prev => ({
      ...prev,
      [senderId]: true
    }));
    
    // Update users list with typing status
    setUsers(prev => prev.map(user => 
      user._id === senderId ? { ...user, isTyping: true } : user
    ));
    
    // Update search results with typing status
    setSearchResults(prev => prev.map(item =>
      item._id === senderId ? { ...item, isTyping: true } : item
    ));
  } else {
    // Update typingUsers state
    setTypingUsers(prev => ({
      ...prev,
      [senderId]: false
    }));
    
    // Update users list
    setUsers(prev => prev.map(user =>
      user._id === senderId ? { ...user, isTyping: false } : user
    ));
    
    // Update search results
    setSearchResults(prev => prev.map(item =>
      item._id === senderId ? { ...item, isTyping: false } : item
    ));
  }
}, [userId]);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (isUserTypingRef.current && selectedUserRef.current) {
     
      socketService.stopTyping({
        senderId: userId,
        receiverId: selectedUserRef.current._id,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
    }
    
    isUserTypingRef.current = false;
  };
}, [userId]);

// Auto-stop typing when user changes
useEffect(() => {
  if (isUserTypingRef.current) {
    stopTyping();
  }
}, [selectedUser?._id, stopTyping]);
// ==================== TYPING UTILITIES ====================
const isCurrentChatUserTyping = useCallback(() => {
  if (!selectedUserRef.current) {
    return false;
  }
  
  const currentUser = users.find(user => user._id === selectedUserRef.current?._id);
  return currentUser?.isTyping || false;
}, [users]);

const getTypingUsers = useCallback(() => {
  return users.filter(user => user.isTyping).map(user => user._id);
}, [users]);




  // UPDATED: Socket Connection with new event handlers
  useEffect(() => {
    
    if (!userId) {
      return;
    }

    const connectSocket = async () => {
      if (socketService.isConnected() || connectionState === 'connecting') {
        return;
      }

      try {
        setConnectionState('connecting');
        await ensureRSAKeys(userId); // ensure keys exist before connecting

        const connected = await socketService.connect(userId);
 
        if (!isMountedRef.current) {
          return;
        }

        if (!connected) {
          setConnectionState('error');
          onErrorRef.current?.('Failed to connect to socket server');
        }
      } catch (error) {
        if (isMountedRef.current) {
          setConnectionState('error');
          onErrorRef.current?.('Failed to connect to socket server');
        }
      }
    };

    connectSocket();


    // Setup socket listeners with new event names
    socketService.onAuthenticated(handleAuthenticated);
    socketService.onAuthenticationError(handleAuthenticationError);
    socketService.onMessageSent(handleMessageSent);
    socketService.onNewMessage(handleNewMessage);
    socketService.onMessageDelivered(handleMessageDelivered);
    socketService.onMessageRead(handleMessageRead);
    socketService.onUserTyping(handleUserTyping);
  
    socketService.onUserStatusChanged(handleUserStatusChanged);
    socketService.onOnlineFriendsResponse(handleOnlineFriendsResponse);
    socketService.onDisconnect(handleSocketDisconnect);
    socketService.onError(handleSocketError);

    return () => {
      // Clean up listeners
      socketService.removeListener('authenticated', handleAuthenticated);
      socketService.removeListener('authentication-error', handleAuthenticationError);
      socketService.removeListener('message-sent', handleMessageSent);
      socketService.removeListener('new-message', handleNewMessage);
      socketService.removeListener('message-delivered', handleMessageDelivered);
      socketService.removeListener('message-read', handleMessageRead);
      socketService.removeListener('user-typing', handleUserTyping);
     

      socketService.removeListener('user-status-changed', handleUserStatusChanged);
      socketService.removeListener('online-friends-response', handleOnlineFriendsResponse);
      socketService.removeListener('disconnected', handleSocketDisconnect);
      socketService.removeListener('socket-error', handleSocketError);
    };
  }, [
    userId,
    // onError is REMOVED from dependency array, handled via onErrorRef inside callbacks
    handleAuthenticated,
    handleAuthenticationError,
    handleMessageSent,
    handleNewMessage,
    handleMessageDelivered,
    handleMessageRead,
    handleUserTyping,
    handleUserStatusChanged,
    handleOnlineFriendsResponse,
    handleSocketDisconnect,
    handleSocketError, handleUserStatusChanged,
  ]);

  // ADD THIS: Effect to request online friends when socket connects
  useEffect(() => {
    if (connectionState === 'connected') {
      // Request online friends immediately
      socketService.requestOnlineFriends();
      
      // Set up interval to refresh online friends (every 30 seconds)
      const intervalId = setInterval(() => {
        if (socketService.isConnected()) {
          socketService.requestOnlineFriends();
        }
      }, 30000);
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [connectionState]);
  
// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// Helper function to get audio duration
async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src);
      resolve(Math.round(audio.duration));
    };
    
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      resolve(0);
    };
    
    audio.src = URL.createObjectURL(file);
  });
}
  const resetUnreadCount = (userId: string) => {
    setUsers(prev =>
      prev.map(u => {
        if (u._id === userId) {
          return { ...u, unreadCount: 0 };
        }
        return u;
      })
    );
  };

  const markMessagesAsRead = async (userId: string) => {
    try {
     
      const res=await api.put(`/messages/chat/read/${userId}`);

      resetUnreadCount(userId);
      
    } catch (error) {
      console.error(`👁️ [markMessagesAsRead] ❌ Failed to mark messages as read:`, error);
    }
  };

  

  const refreshChatList = useCallback(async () => { 
    if (userId) {
      await loadChatUsers();
    }
  }, [userId, loadChatUsers]);

  const refreshMessages = useCallback(async () => { 
    await loadMessages();
  }, [loadMessages]);

 

  // ADD THIS: Function to manually request online friends
  const requestOnlineFriends = useCallback(() => {
    if (socketService.isConnected()) {
      socketService.requestOnlineFriends();
    }
  }, []);

  // ADD THIS: Function to check if a specific user is online
  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineFriendsRef.current.has(userId);
  }, []);

  // Add function to clear search results
const clearSearchResults = useCallback(() => {
  setSearchResults([]);
}, []);

  // Initialize on mount
  useEffect(() => {
    if (!userId || isInitialLoadRef.current) {
      return;
    }

    const initialize = async () => {
      isInitialLoadRef.current = true;
      
      // Ensure RSA keys are generated/loaded
      await ensureRSAKeys(userId);
      
      // Load initial data
      await loadChatUsers();
    };

    initialize();
  }, [userId, loadChatUsers]);

  return {
    // State
    messages,
    users,
    typingUsers,
    isUserTyping,
    selectedUser,
    searchResults,
    decryptedMessages,
    newMessage,
    isLoading,
    isSending,
    connectionState,
    decryptedMedia,
    onlineFriends: Array.from(onlineFriends), // Export as array
    
    // Setters
    setNewMessage,
    setSelectedUser,
    setSearchResults,
    setUsers,
    setMessages,
    setDecryptedMessages,
    resetUnreadCount,
    
    // Actions
    sendMessage,
    loadChatUsers,
    handleNewMessage,
    handleMessageDelivered,
    handleMessageRead,
    handleMessageSent,
    loadMessages,
    loadOlderMessages,
    refreshChatList,
    refreshMessages,
    searchUsers,
    getUserPublicKey,
    decryptSingleMedia,
    decryptMessageContent,
    decryptMessage,
    markMessagesAsRead,
    startTyping,
    stopTyping,
    handleUserTyping,
    handleUserStatusChanged,
    requestOnlineFriends,
    isUserOnline,
    clearSearchResults,
    
  triggerTyping,
  isCurrentChatUserTyping,getTypingUsers,
    
    // Derived
    isConnected: socketService.isConnected(),
    socketId: socketService.getSocketId(),
  };
};

export default useChatLogic;