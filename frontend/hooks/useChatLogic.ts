import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { 
  Message,  
  Notification,
  User, 
  ChatItem, 
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

// Import new socket types
import type {
  MessageDeliveredData,
  MessageReadData,
  ConversationReadData,
  TypingStatusData,
  UserStatusChangedData,
  AuthenticatedData,
  OnlineFriendsResponseData
} from '@/lib/socket';

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

export const useChatLogic = (options: UseChatLogicOptions) => {
  const { userId, onError, onNewNotification } = options;

  // -------------------- State --------------------
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<ChatItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatItem| null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [decryptedMedia, setDecryptedMedia] = useState<Record<string, DecryptedMediaForUI[]>>({});
  const [onlineFriends, setOnlineFriends] = useState<Set<string>>(new Set());

  // -------------------- Refs --------------------
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(false);
  const pendingDecryptionRef = useRef<PendingDecryption>({});
  const userPublicKeyCache = useRef<Map<string, CryptoKey>>(new Map());
  const onlineFriendsRef = useRef<Set<string>>(new Set());

  // Refs for state access inside callbacks to prevent dependency loops
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

  const decryptMessageContent = useCallback(async (
    message: Message
  ): Promise<string> => {
    if (!isMountedRef.current) return '';

    const messageId = message._id;
    
    // Skip if already decrypted (use ref to avoid dependency)
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
      
      // 1. Try to decrypt TEXT message
      if (message.ciphertext && (message as ExtendedMessage).encryptedKey) {
        try {
          const aesKey = await decryptAESKey(userId, (message as ExtendedMessage).encryptedKey!);
          decryptedText = await decryptWithAES(aesKey, message.ciphertext);
        } catch (error) {
          console.error(`🔓 [decryptMessageContent] Failed to decrypt text for ${messageId}:`, error);
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
                  const result = await decryptFile(
                    media.url,
                    encryptedKey,
                    userId
                  );
                  decryptedBlob = result.decryptedBlob;
                  mimeType = result.mimeType;
                  fileName = result.fileName || media.fileName!;
                } else if (media.url instanceof File) {
                  decryptedBlob = media.url;
                  mimeType = media.url.type || getMimeTypeFromFilename(media.fileName!);
                  fileName = media.fileName!;
                } else if (media.url instanceof Blob) {
                  decryptedBlob = media.url;
                  mimeType = media.url.type || getMimeTypeFromFilename(media.fileName!);
                  fileName = media.fileName!;
                } else {
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
                  _previewUrl: URL.createObjectURL(decryptedBlob)
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
                
              } catch (decryptError) {
                console.error(`🔓 [decryptMessageContent] Failed to process media ${index}:`, decryptError);
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
              console.error(`🔓 [decryptMessageContent] Error processing media ${index}:`, error);
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
      console.error(`🔓 [decryptMessageContent] ❌ Decryption failed for ${messageId}:`, error);
      return '';
    } finally {
      delete pendingDecryptionRef.current[messageId];
    }
  }, [userId]);

  const decryptMessage = async (message: Message) => {
    try {
      const decrypted = await decryptMessageContent(message);
      setDecryptedMessages(prev => ({ ...prev, [message._id]: decrypted }));
      return decrypted;
    } catch (err) {
      return null;
    }
  };

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

  // Load Messages with Decryption
  const loadMessages = useCallback(async () => {
    if (!userId || (!selectedUser)) {
      return;
    }

    try {
      setIsLoading(true);
      let response;

      if (selectedUser) {
        response = await api.get(`/messages/${selectedUser._id}`);
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
      console.error('📥 [loadMessages] ❌ Failed to load messages:', error);
      onError?.('Failed to load messages');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, selectedUser, onError, decryptMessageContent]);

  const decryptSingleMedia = useCallback(async (
    messageId: string,
    mediaIndex: number
  ): Promise<DecryptedMediaForUI | undefined> => {
    try {
      // Find the message
      const message = messages.find(m => m._id === messageId);
      if (!message || !message.media || !message.media[mediaIndex]) {
        return undefined;
      }

      const media = message.media[mediaIndex];
      
      // Determine which encrypted key to use
      const isSender = message.sender === userId;
      const encryptedKey = isSender ? media.senderEncryptedKey : media.encryptedKey;
      
      if (!encryptedKey) {
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
        const result = await decryptFile(
          media.url,
          encryptedKey,
          userId
        );
        decryptedBlob = result.decryptedBlob;
        mimeType = result.mimeType;
        fileName = result.fileName || media.fileName || `file_${mediaIndex}`;
      } else if (media.url instanceof File) {
        decryptedBlob = media.url;
        mimeType = media.url.type || getMimeTypeFromFilename(media.fileName || `file_${mediaIndex}`);
        fileName = media.fileName || media.url.name || `file_${mediaIndex}`;
      } else if (media.url instanceof Blob) {
        decryptedBlob = media.url;
        mimeType = media.url.type || getMimeTypeFromFilename(media.fileName || `file_${mediaIndex}`);
        fileName = media.fileName || `file_${mediaIndex}`;
      } else {
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
      console.error(`🔓 [decryptSingleMedia] ❌ Failed to decrypt media ${mediaIndex} in message ${messageId}:`, error);
      
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
              } else {
                tickStatus = 'sent';
              }
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

  const handleNewMessage = useCallback(async (message: Message) => {
    console.log(`📩 [SOCKET EVENT] handleNewMessage received:`, {
      messageId: message._id,
      sender: message.sender,
      receiver: message.receiver
    });

    if (!isMountedRef.current) return;

    const decryptedText = await decryptMessageContent(message);

    setMessages(prev => [...prev, message]);

    const isCurrentUserSender = message.sender === userId;
    // Use refs to avoid dependency on selectedUser and users state
    const isChatOpen = selectedUserRef.current?._id === message.sender;
    const otherUserId = isCurrentUserSender ? message.receiver : message.sender;

    // ----------------------------
    // STEP 1: FETCH USER (if needed)
    // ----------------------------
    let fetchedUser: User|null = null;

    // Access users via Ref to avoid dependency loop
    const userExists = usersRef.current.find(u => u._id === otherUserId);

    if (!userExists) {
      try {
        const res = await api.get(`/auth/details/${otherUserId}`);
        console.log("res data", res);
        fetchedUser = res.data.data;
      } catch (err) {
        console.error("Failed to fetch user:", err);
      }
    }

    // STEP 2: UPDATE SIDEBAR STATE
    setUsers(prev => {
      const existingUserIndex = prev.findIndex(u => u._id === otherUserId);
      let updatedUsers: ChatItem[];

      let lastMessageMedia: "image" | "video" | "audio" | "document" | undefined;
      if (message.media?.length) {
        const mediaType = message.media[0].type;
        if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
          lastMessageMedia = mediaType as "image" | "video" | "audio" | "document";
        }
      }

      let sidebarPreview = decryptedText || "";
      if (message.media?.length) {
        const mediaType = message.media[0].type;
        sidebarPreview =
          mediaType === 'image' ? "📷 Photo" :
          mediaType === 'video' ? "🎬 Video" :
          mediaType === 'audio' ? "🎵 Audio" : "📎 Document";
      }

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
        if (!fetchedUser) return prev; // fallback

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

    // MARK AS READ IF WINDOW OPEN
    if (selectedUserRef.current && selectedUserRef.current._id === message.sender) {
      try {
        await api.put(`/messages/chat/read/${selectedUserRef.current._id}`);
        setUsers(prev =>
          prev.map(u =>
            u._id === selectedUserRef.current?._id ? { ...u, unreadCount: 0 } : u
          )
        );
      } catch (err) {
        console.error("Failed to mark messages as read:", err);
      }
    }
  }, [userId, decryptMessageContent]);

  const handleMessageDelivered = useCallback(async (data: MessageDeliveredData) => {
    console.log(`✅ [SOCKET EVENT] Message delivered:`, data.messageId);

    if (!isMountedRef.current) return;

    // Update sidebar - show double gray ticks
    setUsers(prev => {
      return prev.map(user => {
        // Check if this user is the receiver of the delivered message
        // AND if current user is the sender (we sent this message)
        const shouldUpdate = user._id === data.receiverId && 
                            user.lastMessageSenderId === userId &&
                            user.tickStatus === 'sent';
        
        if (shouldUpdate) {
          return { 
            ...user, 
            tickStatus: 'delivered', // Double gray ticks
            delivered: true
          };
        }

        console.log("after delivered",user);
        return user;
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

  const handleMessageRead = useCallback(async (data: MessageReadData) => {
    console.log(`👁️ [SOCKET EVENT] Message read:`, data.messageId);

    if (!isMountedRef.current) return;

    // Update sidebar - show double blue ticks
    setUsers(prev => {
      return prev.map(user => {
        // Scenario 1: Current user sent the message, update chat with reader
        if (userId === data.senderId && user._id === data.readerId) {
          return { 
            ...user, 
            tickStatus: 'read', // Double blue ticks
            read: true
          };
        }
        
        // Scenario 2: Current user is the reader, update chat with sender
        if (userId === data.readerId && user._id === data.senderId) {
          return { 
            ...user, 
            unreadCount: 0,
            ...(user.tickStatus === 'delivered' ? { tickStatus: 'read' as const } : {})
          };
        }
        
        return user;
      });
    });

    // Update message in messages array
    setMessages(prev =>
      prev.map(msg => {
        if (msg._id === data.messageId) {
          return { ...msg, read: true };
        }
        return msg;
      })
    );

    // Send read status
    try {
      socketService.markMessageRead({
        messageId: data.messageId,
        senderId: data.senderId,
        readerId: data.readerId
      });
    } catch (err) {
      console.error('Failed to send read status:', err);
    }
  }, [userId]);

  const handleConversationRead = useCallback(async (data: ConversationReadData) => {
    console.log(`💬 [SOCKET EVENT] Conversation read`);

    if (!isMountedRef.current) return;

    // Update sidebar tick status to blue double ticks
    if (userId === data.senderId) {
      // Current user sent messages that were read
      setUsers(prev =>
        prev.map(user => {
          if (user._id === data.readerId) {
            return {
              ...user,
              tickStatus: 'read', // Blue double ticks
              unreadCount: 0,
              read: true
            };
          }
          return user;
        })
      );
    } else if (userId === data.readerId) {
      // Current user read messages
      setUsers(prev =>
        prev.map(user => {
          if (user._id === data.senderId) {
            return {
              ...user,
              unreadCount: 0
            };
          }
          return user;
        })
      );
    }
  }, [userId]);

const handleMessageSent = useCallback(async (message: Message) => {
  console.log(`📤 [SOCKET EVENT] Message sent:`, message._id);
  console.log(`📤 [handleMessageSent] Starting, users length before:`, users?.length || 0);

  if (!isMountedRef.current) return;

  // Decrypt for sidebar preview
  const decryptedText = await decryptMessageContent(message);
  
  // Update messages list
  setMessages(prev => prev.map(msg => 
    msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
      ? { ...message, isTemp: false, status: 'sent' }
      : msg
  ));

  // Update sidebar with one tick
  setUsers(prev => {
    console.log(`📤 [handleMessageSent] setUsers called, prev users length:`, prev.length);
    const receiverId = message.receiver;
    
    // Check if user exists in sidebar
    const existingUserIndex = prev.findIndex(u => u._id === receiverId);
    console.log(`📤 [handleMessageSent] Existing user index:`, existingUserIndex);
    
    if (existingUserIndex >= 0) {
      console.log(`📤 [handleMessageSent] User exists, updating`);
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
            tickStatus: 'sent', // One tick
            lastMessageSenderId: message.sender,
            lastMessageMedia,
            unreadCount: 0,
            sent: true,
            delivered: false,
            read: false
          };
        }
        return user;
      });
      
      // Sort by most recent message
      const sorted = updatedUsers.sort((a, b) => {
        const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return timeB - timeA;
      });
      
      console.log(`📤 [handleMessageSent] Updated existing user, returning ${sorted.length} users`);
      return sorted;
    } else {
      console.log(`📤 [handleMessageSent] User doesn't exist, will add async`);
      // User doesn't exist in sidebar, add them
      // We'll handle this async
      const addUserToSidebar = async () => {
        console.log(`📤 [addUserToSidebar] Starting to fetch user ${receiverId}`);
        try {
          const response = await api.get(`/auth/details/${receiverId}`);
          
          if (response.data?.success && response.data.data) {
            const userData = response.data.data;
            
            // Determine sidebar preview
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
              lastSeen: userData.lastSeen,
              lastMessage: sidebarPreview,
              lastMessageTime: message.sentAt || new Date().toISOString(),
              lastMessageSenderId: message.sender,
              lastMessageMedia,
              unreadCount: 0,
              tickStatus: 'sent',
              sent: true,
              delivered: false,
              read: false
            };
            
            // Add to sidebar
            setUsers(prevUsers => {
              console.log(`📤 [addUserToSidebar] setUsers called inside async, prevUsers length:`, prevUsers.length);
              
              // Check if user was already added (race condition)
              const alreadyExists = prevUsers.some(u => u._id === receiverId);
              if (alreadyExists) {
                console.log(`📤 [addUserToSidebar] User ${receiverId} already exists, not adding duplicate`);
                return prevUsers; // Don't add duplicate
              }
              
              const updated = [newUser, ...prevUsers];
              const sorted = updated.sort((a, b) => {
                const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                return timeB - timeA;
              });
              
              console.log(`📤 [addUserToSidebar] Added new user, returning ${sorted.length} users`);
              return sorted;
            });
          }
        } catch (error) {
          console.error('Failed to fetch user details:', error);
          
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
          
          const fallbackUser: ChatItem = {
            _id: receiverId,
            username: `User ${receiverId.substring(0, 6)}`,
            fullName: `User ${receiverId.substring(0, 6)}`,
            lastMessage: sidebarPreview,
            lastMessageTime: message.sentAt || new Date().toISOString(),
            lastMessageSenderId: message.sender,
            lastMessageMedia,
            unreadCount: 0,
            tickStatus: 'sent',
            isOnline: false,
            sent: true,
            delivered: false,
            read: false
          };
          
          setUsers(prevUsers => {
            console.log(`📤 [addUserToSidebar] setUsers called in fallback, prevUsers length:`, prevUsers.length);
            
            // Check if user was already added (race condition)
            const alreadyExists = prevUsers.some(u => u._id === receiverId);
            if (alreadyExists) {
              console.log(`📤 [addUserToSidebar] User ${receiverId} already exists in fallback, not adding duplicate`);
              return prevUsers; // Don't add duplicate
            }
            
            const updated = [fallbackUser, ...prevUsers];
            const sorted = updated.sort((a, b) => {
              const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
              const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
              return timeB - timeA;
            });
            
            console.log(`📤 [addUserToSidebar] Added fallback user, returning ${sorted.length} users`);
            return sorted;
          });
        }
      };
      
      // Start fetching user details
      addUserToSidebar();
      
      // Return current state while fetching
      console.log(`📤 [handleMessageSent] Returning current state while fetching, length:`, prev.length);
      return prev;
    }
  });
}, [userId, decryptMessageContent]);
  const handleUserTyping = useCallback((data: TypingStatusData) => {
    console.log(`⌨️ [SOCKET EVENT] handleUserTyping received from backend:`, {
      senderId: data.senderId,
      receiverId: data.receiverId,
      isTyping: data.isTyping,
      timestamp: data.timestamp,
      currentUserId: userId,
      timestampReceived: new Date().toISOString()
    });

    if (!isMountedRef.current || data.receiverId !== userId) {
      return;
    }
    
    if (data.isTyping) {
      // Add user to typing users if not already there
      setTypingUsers(prev => {
        if (prev.includes(data.senderId)) {
          return prev;
        }
        return [...prev, data.senderId];
      });
    } else {
      // Remove user from typing users
      setTypingUsers(prev => {
        const newList = prev.filter(id => id !== data.senderId);
        return newList;
      });
    }
  }, [userId]);

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
          isOnline: data.isOnline
        };
      }
      return item;
    }));
  }, []);

  const handleAuthenticated = useCallback((data: AuthenticatedData) => {
    console.log(`✅ [SOCKET EVENT] handleAuthenticated received from backend`);
    
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
    console.log(`👥 [SOCKET EVENT] Online friends response:`, {
      success: data.success,
      friendCount: data.onlineFriends?.length || 0,
      timestamp: data.timestamp
    });

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

    console.log(`✅ Updated ${data.onlineFriends.length} online friends`);
  }, []);

  const handleAuthenticationError = useCallback((error: { message: string }) => {
    console.error(`❌ [SOCKET EVENT] handleAuthenticationError received`);
    
    setConnectionState('error');
    onError?.(error.message);
  }, [onError]);

  const handleSocketDisconnect = useCallback(() => {
    console.log(`❌ [SOCKET EVENT] handleSocketDisconnect received`);
    setConnectionState('disconnected');
  }, []);

  const handleSocketError = useCallback((error: { message: string }) => {
    console.error(`❌ [SOCKET EVENT] handleSocketError received:`, error.message);
    onError?.(error.message);
  }, [onError]);
const searchUsers = useCallback(async (query: string): Promise<Array<{
  _id: string;
  type: 'user' | 'group';
  fullName: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageMedia?: "image" | "video" | "audio" | "document";
  unreadCount: number;
  isOnline?: boolean;
  lastMessageDelivered?: boolean;
  lastMessageRead?: boolean;
  lastMessageSender?: string;
}>> => {
  try {
    console.log(`🔍 [searchUsers] Starting search for: "${query}"`);
    
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
    }

    interface SearchResponse {
      success: boolean;
      results: BackendSearchResultItem[];
    }

    const response = await api.get<SearchResponse>(`/messages/search?q=${encodeURIComponent(query)}`);
    console.log(response.data);
    
    if (response.data.success) {
      console.log(`🔍 Found ${response.data.results.length} results from backend`);
      
      const formattedResults = await Promise.all(
        response.data.results.map(async (item) => {
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
          
          // 🔥 KEY: Get online status from our tracked online friends
          // This works because:
          // 1. We get online friends list from backend on connect
          // 2. We track real-time updates via user-status-changed
          // 3. All friends (in search) are tracked in onlineFriends Set
          const isOnline = onlineFriendsRef.current.has(id);
          
          console.log(`🔍 ${item.name} (${id}): isOnline = ${isOnline} (in onlineFriends: ${onlineFriendsRef.current.has(id)})`);
          
          return {
            _id: id,
            type: item.type,
            fullName: item.name,
            profilePic: item.profilePic || undefined,
            isOnline: item.type === 'user' ? isOnline : undefined, // Only users have online status
            lastMessage: displayMessage,
            lastMessageTime: item.lastMessageTime || undefined,
            lastMessageMedia: lastMessageMediaType,
            unreadCount: item.unreadCount || 0,
            lastMessageDelivered: item.lastMessageDelivered,
            lastMessageRead: item.lastMessageRead,
            lastMessageSender: undefined
          };
        })
      );

      console.log("formated search results", formattedResults);
      
      return formattedResults;
    }
    
    return [];
  } catch (error: unknown) {
    console.error('🔍 Search failed:', error);
    return [];
  }
}, [userId]); // Keep userId for decryption

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
          onError?.('Failed to connect to socket server');
        }
      } catch (error) {
        if (isMountedRef.current) {
          setConnectionState('error');
          onError?.('Failed to connect to socket server');
        }
      }
    };

    connectSocket();

    console.log(`🔌 [useEffect] Setting up socket listeners`);
    // Setup socket listeners with new event names
    socketService.onAuthenticated(handleAuthenticated);
    socketService.onAuthenticationError(handleAuthenticationError);
    socketService.onMessageSent(handleMessageSent);
    socketService.onNewMessage(handleNewMessage);
    socketService.onMessageDelivered(handleMessageDelivered);
    socketService.onMessageRead(handleMessageRead);
    socketService.onConversationRead(handleConversationRead);
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
      socketService.removeListener('conversation-read', handleConversationRead);
      socketService.removeListener('user-typing', handleUserTyping);
      socketService.removeListener('user-status-changed', handleUserStatusChanged);
      socketService.removeListener('online-friends-response', handleOnlineFriendsResponse);
      socketService.removeListener('disconnected', handleSocketDisconnect);
      socketService.removeListener('socket-error', handleSocketError);
    };
  }, [
    userId,
    onError,
    handleAuthenticated,
    handleAuthenticationError,
    handleMessageSent,
    handleNewMessage,
    handleMessageDelivered,
    handleMessageRead,
    handleConversationRead,
    handleUserTyping,
    handleUserStatusChanged,
    handleOnlineFriendsResponse,
    handleSocketDisconnect,
    handleSocketError
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

  const sendMessage = useCallback(
    async (messageData: {
      ciphertext: string;
      type: "text" | "image" | "audio" | "video" | "document";
      media?: Array<{ file: File; type: "image" | "audio" | "video" | "document" }>;
    }) => {
      // Access selectedUser from ref to maintain stable callback
      const currentSelectedUser = selectedUserRef.current;
      
      if (!userId || !currentSelectedUser || !isMountedRef.current) {
        console.log(`📤 [sendMessage] ❌ Validation failed`);
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

        // ✅ 3. Prepare FormData for HTTP request
        const formData = new FormData();

        const messagePayload = {
          sender: userId,
          receiver: currentSelectedUser._id,
          ciphertext: encryptedText,
          type: "ratcheted",
          contentType: messageData.type,
          encryptedKey: encryptedTextAESKeyForRecipient,
          senderEncryptedKey: encryptedTextAESKeyForSender,
          isGroup: false
        };

        formData.append("data", JSON.stringify(messagePayload));

        // ✅ 4. Temp UI Message
        const tempMessage: Message = {
          _id: `temp-${Date.now()}`,
          sender: userId,
          receiver: currentSelectedUser._id,
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

        // ✅ 7. Send typing stopped notification via socket
        socketService.stopTyping(currentSelectedUser._id, userId);

        // ✅ 8. SEND VIA HTTP API ONLY (NO SOCKET SENDING)
        try {
          const response = await api.post("/messages/send", formData, {
            timeout: 30000,
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });
          
          const realMessage = response.data?.data || response.data;

          // ✅ Replace temp with real message
          if (realMessage?._id) {
            setMessages(prev =>
              prev.map(msg =>
                msg._id === tempMessage._id
                  ? { ...realMessage, text: messageData.ciphertext, isTemp: false }
                  : msg
              )
            );
          }
        } catch (error) {
          console.error("📤 [sendMessage] ❌ Failed to send message via HTTP:", error);
          onError?.("Failed to send message. Please try again.");
        }

        // ✅ 9. Store plaintext locally for temp message
        if (isMountedRef.current) {
          setDecryptedMessages(prev => ({
            ...prev,
            [tempMessage._id]: messageData.ciphertext
          }));
        }

      } catch (error) {
        console.error("📤 [sendMessage] ❌ Failed to send message:", error);

        setMessages(prev => prev.filter(msg => !msg.isTemp));
        onError?.("Failed to send message. Please try again.");

        // Clean up object URLs
        document.querySelectorAll("audio, video, img").forEach((el) => {
          if (el instanceof HTMLImageElement || el instanceof HTMLMediaElement) {
            if (el.src) URL.revokeObjectURL(el.src);
          }
        });
      } finally {
        if (isMountedRef.current) {
          setIsSending(false);
        }
      }
    },
    [userId, isMountedRef, onError, getUserPublicKey]
  );

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
      await api.put(`/messages/chat/read/${userId}`);
      resetUnreadCount(userId);
      
      // Also mark conversation as read via socket
      if (socketService.isConnected()) {
        socketService.markConversationRead({
          senderId: userId,
          receiverId: userId // Current user
        });
      }
    } catch (error) {
      console.error(`👁️ [markMessagesAsRead] ❌ Failed to mark messages as read:`, error);
    }
  };

  const markMessagesAsSeen = useCallback(async (messageId: string, from: string) => {
    try {
      // Use new socket service method
      socketService.markMessageRead({
        messageId,
        senderId: from,
        readerId: userId
      });
      
      await api.patch(`/messages/ack/${messageId}`, { status: 'seen' });
      
      if (isMountedRef.current) {
        setMessages(prev => prev.map(msg => 
          msg._id === messageId ? { ...msg, read: true } : msg
        ));
      }
    } catch (error) { 
      console.error('👁️ [markMessagesAsSeen] ❌ Failed to mark message as seen:', error); 
    }
  }, [userId]);

  const refreshChatList = useCallback(async () => { 
    if (userId) {
      await loadChatUsers();
    }
  }, [userId, loadChatUsers]);

  const refreshMessages = useCallback(async () => { 
    await loadMessages();
  }, [loadMessages]);

  // Typing indicator methods
  const startTyping = useCallback(() => {
    if (selectedUserRef.current && socketService.isConnected()) {
      socketService.startTyping(selectedUserRef.current._id, userId);
    }
  }, [userId]);

  const stopTyping = useCallback(() => {
    if (selectedUserRef.current && socketService.isConnected()) {
      socketService.stopTyping(selectedUserRef.current._id, userId);
    }
  }, [userId]);

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
    selectedUser,
    decryptedMessages,
    typingUsers,
    newMessage,
    isLoading,
    isSending,
    connectionState,
    decryptedMedia,
    onlineFriends: Array.from(onlineFriends), // Export as array
    
    // Setters
    setNewMessage,
    setSelectedUser,
    setUsers,
    setMessages,
    setDecryptedMessages,
    resetUnreadCount,
    
    // Actions
    sendMessage,
    markMessagesAsSeen,
    loadChatUsers,
    handleNewMessage,
    handleMessageDelivered,
    handleMessageRead,
    handleMessageSent,
    loadMessages,
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
    
    // Derived
    isConnected: socketService.isConnected(),
    socketId: socketService.getSocketId(),
  };
};

export default useChatLogic;