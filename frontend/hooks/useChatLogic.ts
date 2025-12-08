// hooks/useChatLogic.ts
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { 
  Message,  
  OnlineStatusEvent,
  Notification,
  User,
  Group,
  TypingEvent,
  ChatItem, 
  GroupMessage, 
  DecryptedMediaForUI
} from '@/types';
import {
  ensureRSAKeys,
  encryptFileForRecipient,
  generateAESKey,
  encryptWithAES,
  decryptWithAES,
  decryptFile,
  decryptAESKey,
} from '@/lib/crypto';

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


interface ExtendedMessage extends Message {
  encryptedKey?: string;
}

interface ExtendedMedia {
  url: string;
  type: string;
  encryptedKey?: string;
}


export const useChatLogic = (options: UseChatLogicOptions) => {
  const { userId, onError, onNewNotification } = options;

  // -------------------- State --------------------
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<ChatItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [groupTypingUsers, setGroupTypingUsers] = useState<Record<string, string[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
const [decryptedMedia, setDecryptedMedia] = useState<Record<string, DecryptedMediaForUI[]>>({});


  // -------------------- Refs --------------------
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(false);
  const pendingDecryptionRef = useRef<PendingDecryption>({});
  const userPublicKeyCache = useRef<Map<string, CryptoKey>>(new Map());

  useEffect(() => { 
    isMountedRef.current = true; 
    return () => { isMountedRef.current = false; }; 
  }, []);

  useEffect(() => { 
    isLoadingRef.current = isLoading; 
  }, [isLoading]);

  // -------------------- Encryption Helpers --------------------
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
      console.error('Failed to fetch public key:', error);
    }
    return null;
  }, []);


  
// Add these types to your existing types file

const decryptMessageContent = useCallback(async (
  message: Message
): Promise<string> => {
  if (!isMountedRef.current) return '';

  const messageId = message._id;
  
  // Skip if already decrypted
  if (decryptedMessages[messageId]) {
    return decryptedMessages[messageId];
  }
  
  if (pendingDecryptionRef.current[messageId]) {
    return '';
  }

  try {
    pendingDecryptionRef.current[messageId] = true;
    
    let decryptedText = '';
    let hasMedia = false;
    const processedMedia: DecryptedMediaForUI[] = [];
    
    // 1. Try to decrypt TEXT message
    if (message.ciphertext && (message as ExtendedMessage).encryptedKey) {
      try {
        const aesKey = await decryptAESKey(userId, (message as ExtendedMessage).encryptedKey!);
        decryptedText = await decryptWithAES(aesKey, message.ciphertext);
      } catch (error) {
        console.error(`Failed to decrypt text for message ${messageId}:`, error);
      }
    }
    
    // 2. Check if message has media
    hasMedia = (message.media ?? []).length > 0;
    
    // 3. Process and decrypt media files (E2E encryption)
    if (hasMedia && message.media) {
      await Promise.all(
        message.media.map(async (media, index) => {
          try {
            // Determine which encrypted key to use
            const isSender = message.sender === userId;
            const encryptedKey = isSender ? media.senderEncryptedKey : media.encryptedKey;
            
            if (!encryptedKey) {
              console.warn(`No encryption key found for media ${index} in message ${messageId}`);
              processedMedia.push({
                url: media.url,
                type: media.type as "image" | "video" | "audio" | "document" | "blob",
                fileName: media.fileName,
                fileSize: media.fileSize,
                encryptedKey: media.encryptedKey,
                senderEncryptedKey: media.senderEncryptedKey,
                _error: 'No encryption key available',
                _isDecrypted: false,
                _canPreview: false
              });
              return;
            }
            
            try {
              let decryptedBlob: Blob;
              let mimeType: string;
              let fileName: string;
              
              // Check the type of media.url and handle accordingly
              if (typeof media.url === 'string') {
                // Case 1: It's a URL string - use decryptFile
                const result = await decryptFile(
                  media.url, // This is definitely a string now
                  encryptedKey,
                  userId
                );
                decryptedBlob = result.decryptedBlob;
                mimeType = result.mimeType;
                fileName = result.fileName || media.fileName!;
              } else if (media.url instanceof File) {
                // Case 2: It's a File object (for newly sent/temp messages)
                // File objects from temp messages are already decrypted
                // They might be preview files or temporary uploads
                decryptedBlob = media.url;
                mimeType = media.url.type || getMimeTypeFromFilename(media.fileName!);
                fileName = media.fileName!;
              } else if (media.url instanceof Blob) {
                // Case 3: It's already a Blob (shouldn't happen from server, but handle it)
                decryptedBlob = media.url;
                mimeType = media.url.type || getMimeTypeFromFilename(media.fileName!);
                fileName = media.fileName!;
              } else {
                // Unknown type - should not happen
                throw new Error(`Unknown media URL type: ${typeof media.url}`);
              }
              
              // Create MediaForUI object with decrypted blob
              const mediaForUI: DecryptedMediaForUI = {
                url: decryptedBlob,
                type: media.type as "image" | "video" | "audio" | "document" | "blob",
                fileName: fileName,
                fileSize: media.fileSize || decryptedBlob.size,
                encryptedKey: media.encryptedKey,
                senderEncryptedKey: media.senderEncryptedKey,
                _mimeType: mimeType,
                _isDecrypted: true,
                _canPreview: true,
                _previewUrl: URL.createObjectURL(decryptedBlob) // Create preview URL
              };
              
              // Set media-specific properties based on type
              switch (media.type) {
                case 'image':
                  mediaForUI._canPreview = true;
                  mediaForUI._requiresPlayer = false;
                  break;
                case 'video':
                  mediaForUI._canPreview = true;
                  mediaForUI._requiresPlayer = true;
                  break;
                case 'audio':
                  mediaForUI._canPreview = true;
                  mediaForUI._requiresPlayer = true;
                  break;
                case 'document':
                  mediaForUI._canPreview = false;
                  mediaForUI._requiresPlayer = false;
                  break;
                case 'blob':
                default:
                  mediaForUI._canPreview = false;
                  mediaForUI._requiresPlayer = false;
              }
              
              processedMedia.push(mediaForUI);
              console.log(`✅ Successfully processed ${media.type}: ${fileName}`);
              
            } catch (decryptError) {
              console.error(`Failed to process media ${index}:`, decryptError);
              processedMedia.push({
                url: media.url,
                type: media.type as "image" | "video" | "audio" | "document" | "blob",
                fileName: media.fileName,
                fileSize: media.fileSize,
                encryptedKey: media.encryptedKey,
                senderEncryptedKey: media.senderEncryptedKey,
                _error: decryptError instanceof Error ? decryptError.message : 'Processing failed',
                _isDecrypted: false,
                _canPreview: false
              });
            }
            
          } catch (error) {
            console.error(`Error processing media ${index}:`, error);
            processedMedia.push({
              url: media.url,
              type: media.type as "image" | "video" | "audio" | "document" | "blob",
              fileName: media.fileName,
              fileSize: media.fileSize,
              encryptedKey: media.encryptedKey,
              senderEncryptedKey: media.senderEncryptedKey,
              _error: error instanceof Error ? error.message : 'Processing failed',
              _isDecrypted: false,
              _canPreview: false
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
    console.error('Decryption failed:', error);
    return '';
  } finally {
    delete pendingDecryptionRef.current[messageId];
  }
}, [userId, decryptedMessages]);

// Helper function
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

// Get MIME type from filename
const getMimeTypeFromFilename = (filename: string): string => {
  const extension = filename.toLowerCase().split('.').pop() || '';
  
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
};



// Add to your state in useChatLogic

  // -------------------- Load Messages with Decryption --------------------
  const loadMessages = useCallback(async () => {
    if (!userId || (!selectedUser && !selectedGroup)) return;

    try {
      setIsLoading(true);
      let response;

      if (selectedUser) {
        response = await api.get(`/messages/${selectedUser._id}`);
        console.log(response);
      } else if (selectedGroup) {
        response = await api.get(`/messages/${selectedGroup._id}?isGroup=true`);
      }

      if (isMountedRef.current && response?.data) {
        const messagesData: Message[] = response.data;
        
        // Ensure RSA keys exist before processing messages
        await ensureRSAKeys(userId);
        
        // Set messages first
        setMessages(messagesData);
        
        // Decrypt messages in batches
        const batchSize = 5;
        for (let i = 0; i < messagesData.length; i += batchSize) {
          const batch = messagesData.slice(i, i + batchSize);
          await Promise.all(
            batch.map(message => decryptMessageContent(message))
          );
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      onError?.('Failed to load messages');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [userId, selectedUser, selectedGroup, onError, decryptMessageContent]);


  // Add to your useChatLogic hook, after decryptMessageContent

const decryptSingleMedia = useCallback(async (
  messageId: string,
  mediaIndex: number
): Promise<DecryptedMediaForUI | undefined> => {
  try {
    // Find the message
    const message = messages.find(m => m._id === messageId);
    if (!message || !message.media || !message.media[mediaIndex]) {
      console.warn(`Message or media not found: ${messageId}[${mediaIndex}]`);
      return undefined;
    }

    const media = message.media[mediaIndex];
    
    // Determine which encrypted key to use
    const isSender = message.sender === userId;
    const encryptedKey = isSender ? media.senderEncryptedKey : media.encryptedKey;
    
    if (!encryptedKey) {
      console.warn(`No encryption key found for media ${mediaIndex} in message ${messageId}`);
      
      const errorMedia: DecryptedMediaForUI = {
        url: media.url, // Keep original URL
        type: media.type as "image" | "video" | "audio" | "document" | "blob",
        fileName: media.fileName || `file_${mediaIndex}`,
        fileSize: media.fileSize || 0,
        encryptedKey: media.encryptedKey || '',
        senderEncryptedKey: media.senderEncryptedKey || '',
        _error: 'No encryption key available',
        _isDecrypted: false,
        _canPreview: false
      };
      
      // Update state
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

    // Now we know encryptedKey exists, proceed with decryption
    let decryptedBlob: Blob;
    let mimeType: string;
    let fileName: string;
    
    // Check the type of media.url and handle accordingly
    if (typeof media.url === 'string') {
      // It's a URL string - use decryptFile
      const result = await decryptFile(
        media.url,
        encryptedKey,
        userId
      );
      decryptedBlob = result.decryptedBlob;
      mimeType = result.mimeType;
      fileName = result.fileName || media.fileName || `file_${mediaIndex}`;
    } else if (media.url instanceof File) {
      // It's a File object (for newly sent/temp messages)
      decryptedBlob = media.url;
      mimeType = media.url.type || getMimeTypeFromFilename(media.fileName || `file_${mediaIndex}`);
      fileName = media.fileName || media.url.name || `file_${mediaIndex}`;
    } else if (media.url instanceof Blob) {
      // It's already a Blob
      decryptedBlob = media.url;
      mimeType = media.url.type || getMimeTypeFromFilename(media.fileName || `file_${mediaIndex}`);
      fileName = media.fileName || `file_${mediaIndex}`;
    } else {
      // Unknown type
      throw new Error(`Unknown media URL type: ${typeof media.url}`);
    }
    
    // Create MediaForUI object with decrypted blob
    const decryptedMediaItem: DecryptedMediaForUI = {
      url: decryptedBlob,
      type: media.type as "image" | "video" | "audio" | "document" | "blob",
      fileName: fileName,
      fileSize: media.fileSize || decryptedBlob.size,
      encryptedKey: media.encryptedKey || '',
      senderEncryptedKey: media.senderEncryptedKey || '',
      _mimeType: mimeType,
      _isDecrypted: true,
      _canPreview: true,
      _previewUrl: URL.createObjectURL(decryptedBlob)
    };
    
    // Set media-specific properties based on type
    switch (media.type) {
      case 'image':
        decryptedMediaItem._canPreview = true;
        decryptedMediaItem._requiresPlayer = false;
        break;
      case 'video':
        decryptedMediaItem._canPreview = true;
        decryptedMediaItem._requiresPlayer = true;
        break;
      case 'audio':
        decryptedMediaItem._canPreview = true;
        decryptedMediaItem._requiresPlayer = true;
        break;
      case 'document':
      case 'blob':
        decryptedMediaItem._canPreview = false;
        decryptedMediaItem._requiresPlayer = false;
        break;
    }
    
    console.log(`✅ Successfully decrypted media ${fileName}`);
    
    // Update decryptedMedia state
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
    console.error(`Failed to decrypt media ${mediaIndex} in message ${messageId}:`, error);
    
    const errorMedia: DecryptedMediaForUI = {
      url: '', // Empty string instead of null
      type: 'document',
      fileName: 'Error',
      fileSize: 0,
      encryptedKey: '',
      senderEncryptedKey: '',
      _error: error instanceof Error ? error.message : 'Decryption failed',
      _isDecrypted: false,
      _canPreview: false
    };
    
    // Update state
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

// Function to check if media is already decrypted
const isMediaDecrypted = useCallback((messageId: string, mediaIndex: number): boolean => {
  const decryptedMediaForMessage = decryptedMedia[messageId];
  if (!decryptedMediaForMessage || !decryptedMediaForMessage[mediaIndex]) {
    return false;
  }
  return decryptedMediaForMessage[mediaIndex]._isDecrypted === true;
}, [decryptedMedia]);


 // -------------------- Load Chat Users --------------------
const loadChatUsers = useCallback(async () => {
  if (!userId || !isMountedRef.current || isLoadingRef.current) return;

  try {
    setIsLoading(true);
    isLoadingRef.current = true;
    const response = await api.get('/messages/sidebar/list');
    console.log('Raw sidebar data:', response.data);

    if (isMountedRef.current && response.data) {
      const processedChats = await Promise.all(
        response.data.map(async (chat: ChatItem) => {
          let decryptedMessage = chat.lastMessage || '';
          let tickStatus: 'none' | 'sent' | 'delivered' | 'seen' = 'none';

          try {
            // Decrypt if needed
            if (chat.lastMessage && (chat.lastMessageEncryptedKey || chat.lastMessageEncryptedKeySender)) {
              const encryptedKey = chat.lastMessageEncryptedKeySender || chat.lastMessageEncryptedKey;

              if (encryptedKey) {
                try {
                  const aesKey = await decryptAESKey(userId, encryptedKey);
                  decryptedMessage = await decryptWithAES(aesKey, chat.lastMessage);
                } catch (decryptError: unknown) {
                  console.warn('Failed to decrypt message:', decryptError);
                  decryptedMessage = '[Encrypted message]';
                }
              }
            }
          } catch (error: unknown) {
            console.error('Error processing chat item:', error);
            decryptedMessage = chat.lastMessage ? '[Encrypted message]' : chat.lastMessage || '';
          }

          // Determine tick status only if current user is the sender
          if (chat.lastMessageSenderId === userId) {
            if (chat.read) {
              tickStatus = 'seen';      // Blue double ticks
            } else if (chat.delivered) {
              tickStatus = 'delivered'; // Gray double ticks
            } else {
              tickStatus = 'sent';      // Single tick
            }
          }

          return {
            ...chat,
            lastMessage: decryptedMessage,
            tickStatus, // 'none' if user is receiver
          };
        })
      );

      console.log('Processed chats:', processedChats);
      setUsers(processedChats);
    }
  } catch (error: unknown) {
    console.error('Failed to load chat list:', error);
    if (isMountedRef.current) {
      onError?.('Failed to load chat list');
      setUsers([]);
    }
  } finally {
    if (isMountedRef.current) {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }
}, [userId, onError]);



  // -------------------- Socket Handlers --------------------
  const handleNewMessage = useCallback(async (message: Message) => {
    if (!isMountedRef.current) return;

    // Add message to list
    setMessages(prev => [...prev, message]);
    
    // Decrypt the new message
    await decryptMessageContent(message);

    // Update chat list if needed
    if (!selectedUser && !selectedGroup) {
      setUsers(prev => prev.map(item =>
        item._id === message.sender
          ? { ...item, lastMessage: 'New message', lastMessageTime: message.sentAt }
          : item
      ));
    }
  }, [selectedUser, selectedGroup, decryptMessageContent]);

  const handleTyping = useCallback((data: TypingEvent) => {
    if (!isMountedRef.current || data.to !== userId) return;
    setTypingUsers(prev => [...prev.filter(id => id !== data.from), data.from]);
  }, [userId]);

  const handleStopTyping = useCallback((data: TypingEvent) => {
    if (!isMountedRef.current || data.to !== userId) return;
    setTypingUsers(prev => prev.filter(id => id !== data.from));
  }, [userId]);

const searchUsers = useCallback(async (query: string): Promise<Array<{
  _id: string;
  type: 'user' | 'group';
  name: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageMedia?: Array<{ url: string; type: string }>;
  unreadCount: number;
  isOnline?: boolean;
  lastMessageDelivered?: boolean;
  lastMessageRead?: boolean;
  lastMessageSender?: string;
}>> => {
  try {
    console.log(`🔍 [Frontend] Searching for: "${query}"`);
    
    interface EncryptionKeyEntry {
      userId: string;
      key: string;
    }

    interface EncryptionMetadata {
      ciphertext: string;
      encryptedAESKeyForSender?: string | null;
      encryptedAESKeyForReceiver?: string | null;
      encryptedAESKey?: string | null;
      encryptedKeys?: EncryptionKeyEntry[];
      sender: string;
      receiver?: string;
      encryptionType: 'individual' | 'group';
      isGroupMessage?: boolean;
    }

    interface SearchResultItem {
      _id: unknown;
      type: 'user' | 'group';
      name: string;
      profilePic?: string | null;
      isOnline?: boolean;
      lastMessageTime?: string | null;
      lastMessageMedia?: Array<{ url: string; type: string }> | null;
      unreadCount?: number;
      lastMessageDelivered?: boolean;
      lastMessageRead?: boolean;
      lastMessageSender?: string;
      encryptionMetadata?: EncryptionMetadata | null;
    }

    interface SearchResponse {
      success: boolean;
      results: SearchResultItem[];
    }

    const response = await api.get<SearchResponse>(`/messages/search?q=${encodeURIComponent(query)}`);
    
    console.log(`📥 [Frontend] Search response:`, {
      success: response.data.success,
      count: response.data.results?.length || 0
    });
    
    if (response.data.success) {
      const currentUserId = localStorage.getItem('userId') || '';
      
      const formattedResults = await Promise.all(
        response.data.results.map(async (item) => {
          const id = typeof item._id === 'object' && item._id !== null && 'toString' in item._id
            ? item._id.toString()
            : String(item._id);
          
          let decryptedMessage: string | undefined = undefined;
          
          // If it's a media message, show media type
          if (item.lastMessageMedia && item.lastMessageMedia.length > 0) {
            const mediaType = item.lastMessageMedia[0].type;
            decryptedMessage = mediaType.startsWith('image/') ? '📷 Photo' :
                              mediaType.startsWith('video/') ? '🎬 Video' :
                              mediaType.startsWith('audio/') ? '🎵 Audio' :
                              '📎 File';
          }
          // If there's encryption metadata, try to decrypt text message
          else if (item.encryptionMetadata?.ciphertext) {
            try {
              const { ciphertext, sender, encryptionType, encryptedAESKeyForSender, encryptedAESKeyForReceiver, encryptedAESKey } = item.encryptionMetadata;
              
              // Determine which key to use
              const isCurrentUserSender = sender === currentUserId;
              const encryptedKey = encryptionType === 'group' 
                ? encryptedAESKey 
                : isCurrentUserSender 
                  ? encryptedAESKeyForSender 
                  : encryptedAESKeyForReceiver;
              
              if (encryptedKey) {
                if (encryptionType === 'group') {
                  // decryptedMessage = await decryptGroupMessage(currentUserId, ciphertext, encryptedKey);
                } else {
                  const aesKey = await decryptAESKey(currentUserId, encryptedKey);
                  decryptedMessage = await decryptWithAES(aesKey, ciphertext);
                }
              } else {
                decryptedMessage = "Encrypted message";
              }
            } catch (error) {
              console.error('Decryption error:', error);
              decryptedMessage = "Encrypted message";
            }
          }
          
          // Format for display
          let displayMessage = decryptedMessage;
          if (item.type === 'group' && item.lastMessageSender && decryptedMessage) {
            displayMessage = `${item.lastMessageSender}: ${decryptedMessage}`;
          }
          
          return {
            _id: id,
            type: item.type,
            name: item.name,
            profilePic: item.profilePic || undefined,
            isOnline: Boolean(item.isOnline),
            lastMessage: displayMessage,
            lastMessageTime: item.lastMessageTime || undefined,
            lastMessageMedia: item.lastMessageMedia || undefined,
            unreadCount: item.unreadCount || 0,
            lastMessageDelivered: item.lastMessageDelivered,
            lastMessageRead: item.lastMessageRead,
            lastMessageSender: item.lastMessageSender
          };
        })
      );
      
      console.log(`✅ [Frontend] Returning ${formattedResults.length} results`);
      return formattedResults;
    }
    
    return [];
  } catch (error: unknown) {
    console.error('❌ [Frontend] Search failed:', error);
    return [];
  }
}, []);

  const handleGroupTyping = useCallback((data: { groupId: string; sender: string }) => {
    if (!isMountedRef.current || !selectedGroup) return;
    if (data.groupId !== selectedGroup._id) return;

    setGroupTypingUsers(prev => ({
      ...prev,
      [data.groupId]: [...(prev[data.groupId] || []).filter(id => id !== data.sender), data.sender]
    }));
  }, [selectedGroup]);

  const handleGroupStopTyping = useCallback((data: { groupId: string; sender: string }) => {
    if (!isMountedRef.current || !selectedGroup) return;
    if (data.groupId !== selectedGroup._id) return;

    setGroupTypingUsers(prev => ({
      ...prev,
      [data.groupId]: (prev[data.groupId] || []).filter(sender => sender !== data.sender)
    }));
  }, [selectedGroup]);

  const handleUserOnlineStatus = useCallback((data: OnlineStatusEvent) => {
    if (!isMountedRef.current) return;

    setUsers(prev => prev.map(item =>
      item._id === data.userId ? { ...item, isOnline: data.isOnline, lastSeen: data.lastSeen } : item
    ));
  }, []);

  const handleMessageSent = useCallback(async (message: Message) => {
    if (!isMountedRef.current) return;

    setMessages(prev => prev.map(msg =>
      msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
        ? { ...message, isTemp: false }
        : msg
    ));
    
    // Decrypt the sent message
    await decryptMessageContent(message);
  }, [decryptMessageContent]);

  const handleGroupMessageSent = useCallback(async (message: Message) => {
    if (!isMountedRef.current) return;

    setMessages(prev => prev.map(msg =>
      msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
        ? { ...message, isTemp: false }
        : msg
    ));
    
    // Decrypt the sent message
    await decryptMessageContent(message);
  }, [decryptMessageContent]);

  const handleSocketDisconnect = useCallback(() => {
    if (!isMountedRef.current) return;
    setConnectionState('disconnected');
  }, []);

  // -------------------- Socket Connection --------------------
  useEffect(() => {
    if (!userId) return;

    const connectSocket = async () => {
      if (socketService.isConnected() || connectionState === 'connecting') return;
      try {
        setConnectionState('connecting');
        
        // Ensure keys exist before connecting
        await ensureRSAKeys(userId);
        
        const connected = await socketService.connect(userId);
        if (!isMountedRef.current) return;
        setConnectionState(connected ? 'connected' : 'error');
      } catch (error) {
        console.error('Failed to connect socket:', error);
        if (isMountedRef.current) {
          setConnectionState('error');
          onError?.('Failed to connect to socket server');
        }
      }
    };

    connectSocket();

    // Setup all listeners
    // Note: socketService.on* methods typically return void, not unsubscribe functions
    socketService.onNewMessage(handleNewMessage);
    socketService.onTyping(handleTyping);
    socketService.onStopTyping(handleStopTyping);
    socketService.onGroupTyping(handleGroupTyping);
    socketService.onGroupStopTyping(handleGroupStopTyping);
    socketService.onMessageSent(handleMessageSent);
    socketService.onGroupMessageSent(handleGroupMessageSent);
    socketService.onUserOnlineStatus(handleUserOnlineStatus);
    socketService.onDisconnect(handleSocketDisconnect);

    if (onNewNotification) {
      socketService.onNewNotification(onNewNotification);
    }

    return () => {
      // Just remove all listeners on cleanup
      socketService.removeAllListeners();
    };
  }, [
    userId, onError, onNewNotification, connectionState, 
    handleNewMessage, handleTyping, handleStopTyping, 
    handleGroupTyping, handleGroupStopTyping, 
    handleMessageSent, handleGroupMessageSent, 
    handleUserOnlineStatus, handleSocketDisconnect
  ]);

const sendMessage = useCallback(
  async (messageData: {
    ciphertext: string;
    type: "text" | "image" | "audio" | "video" | "document";
    media?: Array<{ file: File; type: "image" | "audio" | "video" | "document" }>;
  }) => {
    if (!userId || !selectedUser || !isMountedRef.current) return;

    try {
      setIsSending(true);

      // ✅ 1. Get public keys
      const recipientPublicKey = await getUserPublicKey(selectedUser._id);
      const senderPublicKey = await getUserPublicKey(userId);
      if (!recipientPublicKey || !senderPublicKey) {
        throw new Error("Public key missing");
      }

      // ✅ 2. Encrypt TEXT
      const textAESKey = await generateAESKey();
      const encryptedText = await encryptWithAES(textAESKey, messageData.ciphertext);

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

      const encryptedTextAESKeyForRecipient = Array.from(new Uint8Array(encKeyRecipient))
        .map(b => b.toString(16).padStart(2, "0")).join("");

      const encryptedTextAESKeyForSender = Array.from(new Uint8Array(encKeySender))
        .map(b => b.toString(16).padStart(2, "0")).join("");

      // ✅ 3. Prepare FormData
      const formData = new FormData();

      const messagePayload = {
        sender: userId,
        receiver: selectedUser._id,
        ciphertext: encryptedText,
        type: "ratcheted",
        contentType: messageData.type, // ✅ FIXED (was textType)
        encryptedKey: encryptedTextAESKeyForRecipient,
        senderEncryptedKey: encryptedTextAESKeyForSender,
        isGroup: false
      };

      formData.append("data", JSON.stringify(messagePayload));

      // ✅ 4. Temp UI Message
      const tempMessage: Message = {
        _id: `temp-${Date.now()}`,
        sender: userId,
        receiver: selectedUser._id,
        ciphertext: encryptedText,
        text: messageData.ciphertext,
        type: "ratcheted",
        media: [],
        sentAt: new Date().toISOString(),
        isTemp: true,
        delivered: false,
        read: false
      };

      // ✅ 5. MEDIA ENCRYPTION (BINARY ONLY)
     if (messageData.media?.length) {
  for (let i = 0; i < messageData.media.length; i++) {
    const item = messageData.media[i];
    
    const { encryptedBlob, encryptedAESKeyForRecipient, encryptedAESKeyForSender } = 
      await encryptFileForRecipient(item.file, recipientPublicKey, senderPublicKey);

    // Create File object with proper name
    const encryptedFile = new File(
      [encryptedBlob],
      `encrypted_${item.file.name}`,
      { type: 'application/octet-stream' }
    );

    formData.append("media", encryptedFile);
    
    // Send metadata
    formData.append(`mediaType${i}`, item.type);
    formData.append(`mediaEncryptedKey${i}`, encryptedAESKeyForRecipient);
    formData.append(`mediaSenderEncryptedKey${i}`, encryptedAESKeyForSender);
    formData.append(`originalName${i}`, item.file.name);
    formData.append(`fileSize${i}`, item.file.size.toString());
    
    // For temp message preview
    const previewUrl = URL.createObjectURL(item.file);
    tempMessage.media!.push({
      url: previewUrl,
      type: item.type,
      encryptedKey: encryptedAESKeyForRecipient,
      senderEncryptedKey: encryptedAESKeyForSender,
      fileName: item.file.name,
      fileSize: item.file.size
    });
  }
}

      // ✅ 6. Add temp message immediately
      setMessages(prev => [...prev, tempMessage]);
      setNewMessage("");

      // ✅ 7. SEND TO BACKEND (✅ NO MANUAL CONTENT-TYPE)
      const response = await api.post("/messages/send", formData, {
        timeout: 30000
      });

      const realMessage = response.data?.data || response.data;

      // ✅ 8. Replace temp with real
      if (realMessage?._id) {
        setMessages(prev =>
          prev.map(msg =>
            msg._id === tempMessage._id
              ? { ...realMessage, text: messageData.ciphertext, isTemp: false }
              : msg
          )
        );
      }

      // ✅ 9. Typing stopped
      socketService.stopTypingEnhanced(selectedUser._id);

      // ✅ 10. Store plaintext locally
      if (isMountedRef.current) {
        setDecryptedMessages(prev => ({
          ...prev,
          [tempMessage._id]: messageData.ciphertext
        }));
      }

    } catch (error) {
      console.error("❌ Failed to send message:", error);

      setMessages(prev => prev.filter(msg => !msg.isTemp));
      onError?.("Failed to send message. Please try again.");

      // ✅ Correct cleanup
    // ✅ Correct object URL cleanup (TypeScript safe)
document.querySelectorAll("audio, video, img").forEach((el) => {
  if (el instanceof HTMLImageElement || el instanceof HTMLMediaElement) {
    if (el.src) URL.revokeObjectURL(el.src);
  }
});

    } finally {
      if (isMountedRef.current) setIsSending(false);
    }
  },
  [userId, selectedUser, isMountedRef, onError]
);

  

  // Memoized derived values
  const typingStatus = useMemo(() => {
    if (selectedUser && typingUsers.includes(selectedUser._id)) {
      return 'typing...';
    }
    if (selectedGroup && groupTypingUsers[selectedGroup._id]?.length) {
      const count = groupTypingUsers[selectedGroup._id].length;
      return `${count} member${count > 1 ? 's' : ''} typing...`;
    }
    return null;
  }, [selectedUser, selectedGroup, typingUsers, groupTypingUsers]);

  const startTyping = useCallback((receiverId: string) => { 
    if (userId) socketService.startTypingEnhanced(receiverId); 
  }, [userId]);

  const stopTyping = useCallback((receiverId: string) => { 
    if (userId) socketService.stopTypingEnhanced(receiverId); 
  }, [userId]);

  const startGroupTyping = useCallback((groupId: string) => { 
    if (userId && selectedGroup) socketService.groupTyping({ groupId, sender: userId }); 
  }, [userId, selectedGroup]);

  const stopGroupTyping = useCallback((groupId: string) => { 
    if (userId && selectedGroup) socketService.groupStopTyping({ groupId, sender: userId }); 
  }, [userId, selectedGroup]);

  const markMessagesAsSeen = useCallback(async (messageId: string, from: string) => {
    try {
      socketService.markMessageSeen(messageId, from);
      await api.patch(`/messages/ack/${messageId}`, { status: 'seen' });
      if (isMountedRef.current) {
        setMessages(prev => prev.map(msg => 
          msg._id === messageId ? { ...msg, read: true } : msg
        ));
      }
    } catch (error) { 
      console.error('Failed to mark message as seen:', error); 
    }
  }, []);

 // Enhanced decrypt function that works for both sender and receiver
const decryptEnhanced = useCallback(async (message: Message | GroupMessage): Promise<string> => {
  // If already decrypted, return cached value
  if (decryptedMessages[message._id]) {
    return decryptedMessages[message._id];
  }

  // Decrypt based on message type and encryption method
  // We need to handle both Message and GroupMessage types
  // Assuming GroupMessage extends Message or they share common properties
  const messageToDecrypt: Message = message as Message;
  return await decryptMessageContent(messageToDecrypt);
}, [decryptedMessages, decryptMessageContent]);

const refreshChatList = useCallback(async () => { 
  if (userId) await loadChatUsers(); 
}, [userId, loadChatUsers]);

const refreshMessages = useCallback(async () => { 
  await loadMessages(); 
}, [loadMessages]);

// Initialize on mount
useEffect(() => {
  if (!userId || isInitialLoadRef.current) return;

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
    selectedUser,
    selectedGroup,
    decryptedMessages,
    typingUsers,
    groupTypingUsers,
    newMessage,
    isLoading,
    isSending,
    connectionState,
    typingStatus,
    
    // Setters
    setNewMessage,
    setSelectedUser,
    setSelectedGroup,
    setUsers,
    setMessages,
    setDecryptedMessages,
    
    // Actions
    sendMessage,
    // sendGroupMessage,
 
    startTyping,
    stopTyping,
    startGroupTyping,
    stopGroupTyping,
    markMessagesAsSeen,
    decryptMessage: decryptEnhanced,
    loadChatUsers,
    loadMessages,
    refreshChatList,
    refreshMessages,
    searchUsers,
    getUserPublicKey,
    decryptedMedia,
    decryptSingleMedia,
    
    // Derived
    isConnected: socketService.isConnected(),
    socketId: socketService.getSocketId(),
  };
};

export default useChatLogic;