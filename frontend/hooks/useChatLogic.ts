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
    console.log("selectedUser", selectedUser);
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
      onErrorRef.current?.('Failed to load messages');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, selectedUser?._id, decryptMessageContent]);

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
      console.log("response", response.data);

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
              console.log("tick", tickStatus);
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
       console.log("processedChats",processedChats);
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
  console.log(`📩 [SOCKET EVENT] handleNewMessage received:`, {
    messageId: message._id,
    sender: message.sender,
    receiver: message.receiver
  });

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

    console.log(`🔍 [handleNewMessage] Updating search result for ${otherUserId}`);

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
      console.log("calling api");
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
  console.log(`✅ [SOCKET EVENT] Message delivered:`, data.messageId);

  if (!isMountedRef.current) return;
 

  // Update sidebar
  setUsers(prev => {
    return prev.map(user => {
      console.log("lastMessageSenderId", user.lastMessageSenderId);
      const shouldUpdate = user._id === data.receiverId && 
                          user.lastMessageSenderId === userId &&
                          (user.tickStatus === 'sent' || user.tickStatus=='none');
      console.log("shouldUpdate", shouldUpdate);
      if (shouldUpdate) {
        return { 
          ...user, 
          tickStatus: 'delivered',
          delivered: true
        };
      }
      console.log(user);
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
        console.log(`🔍 [handleMessageDelivered] Updating search result for ${data.receiverId}`);
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
  console.log(`👁️ [SOCKET EVENT] Messages read:`, data.messageIds);

  if (!isMountedRef.current) return;

  const { messageIds, readerId } = data;

    console.log(`👁️  Messages read:`, messageIds);

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
      console.log("User", user);
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
  console.log(`📤 [SOCKET EVENT] Message sent:`, message._id, `Status: ${message.status}`);
  
  if (!isMountedRef.current) return;

  const decryptedText = await decryptMessageContent(message);
  
  // Determine tick status based on backend status field
  let tickStatus: 'sent' | 'delivered' = 'sent';
  if (message.status === 'delivered') {
    tickStatus = 'delivered';
  }

  // Update messages list - ONLY update status for the real message ID
  setMessages(prev => {
    console.log(`🔍 Looking for message ${message._id} in ${prev.length} messages`);
    
    const messageExists = prev.some(msg => msg._id === message._id);
    
    if (!messageExists) {
      console.log(`❌ Message ${message._id} not found in current messages`);
      console.log(`   Current message IDs:`, prev.map(msg => msg._id));
      return prev; // Don't add new messages, only update existing ones
    }
    
    const updated = prev.map(msg => {
      // Only update if it's the exact same message ID
      if (msg._id === message._id) {
        console.log(`✅ Updating status for message ${msg._id}: ${message.status}`);
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
          console.log(`📡 Fetching user details for ${receiverId}...`);
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
            
            console.log(`✅ Adding new user to sidebar:`, newUser.fullName, `Tick status: ${tickStatus}`);
            
            setUsers(prevUsers => {
              const alreadyExists = prevUsers.some(u => u._id === receiverId);
              if (alreadyExists) {
                console.log(`⚠️ User already added in async, skipping`);
                return prevUsers;
              }
              
              const updated = [newUser, ...prevUsers].sort((a, b) => {
                const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                return timeB - timeA;
              });
              
              console.log(`📊 New sidebar count:`, updated.length);
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
      console.log(`⏳ User addition in progress...`);
      return prev;
    }
  });

  // 🔥 Update search results
  setSearchResults(prev => {
    console.log(`🔍 Updating search results for message sent with status: ${message.status}`);
    
    const userInSearchResults = prev.find(item => item._id === message.receiver);
    
    if (!userInSearchResults) {
      console.log(`⚠️ User not in search results, skipping`);
      return prev;
    }

    console.log(`✅ Updating search result for ${message.receiver} with tickStatus: ${tickStatus}`);
    
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
    
    console.log(`✅ Search results updated with status: ${message.status}`);
    return updatedResults;
  });
  
  // Log final state
  setTimeout(() => {
    console.log(`✅ Expected: tickStatus should be '${tickStatus}' for user ${message.receiver}`);
    console.log(`✅ Expected: message status from backend: ${message.status}`);
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
          isOnline: data.isOnline
        };
      }
      return item;
    }));

      setSearchResults(prev => prev.map(item => {
    if (item._id === data.userId) {
      console.log(`🔍 [handleUserStatusChanged] Updating search result for ${data.userId}`);
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
    onErrorRef.current?.(error.message);
  }, []);

  const handleSocketDisconnect = useCallback(() => {
    console.log(`❌ [SOCKET EVENT] handleSocketDisconnect received`);
    setConnectionState('disconnected');
  }, []);

  const handleSocketError = useCallback((error: { message: string }) => {
    console.error(`❌ [SOCKET EVENT] handleSocketError received:`, error.message);
    onErrorRef.current?.(error.message);
  }, []);

  const searchUsers = useCallback(async (query: string): Promise<ChatItem[]> => {
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
      console.log(`🔍 Found ${response.data.results.length} results from backend`);
      
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
            console.log(`🔍 ${item.name} (${id}): Found in users list, merging with real-time data`);
            
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
          
          // New user (not in our current chat list) - return search data
          console.log(`🔍 ${item.name} (${id}): New user from search`);
          
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

      console.log(`📤 Setting searchResults state with ${formattedResults.length} items`);
      
      // Update search results state
      setSearchResults(formattedResults);

      console.log("results",searchResults);
      
      return formattedResults;
    } else {
      console.log(`⚠️ No results or API error`);
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
    console.log(`⌨️ [stopTyping] Sending stop typing to ${currentSelectedUser._id}`);
    
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
  
  console.log(`⌨️ [startTyping] Sending typing to ${currentSelectedUser._id}`);
  
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
      console.log('⌨️ [cleanup] Sending final stop typing');
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

    console.log(`🔌 [useEffect] Setting up socket listeners`);
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

  // const sendMessage = useCallback(
  //   async (messageData: {
  //     ciphertext: string;
  //     type: "text" | "image" | "audio" | "video" | "document";
  //     media?: Array<{ file: File; type: "image" | "audio" | "video" | "document" }>;
  //   }) => {
  //     // Access selectedUser from ref to maintain stable callback
  //     const currentSelectedUser = selectedUserRef.current;
      
  //     if (!userId || !currentSelectedUser || !isMountedRef.current) {
  //       console.log(`📤 [sendMessage] ❌ Validation failed`);
  //       return;
  //     }

  //     try {
  //       setIsSending(true);

  //       // ✅ 1. Get public keys
  //       const recipientPublicKey = await getUserPublicKey(currentSelectedUser._id);
  //       const senderPublicKey = await getUserPublicKey(userId);
        
  //       if (!recipientPublicKey || !senderPublicKey) {
  //         throw new Error("Public key missing");
  //       }

  //       // ✅ 2. Encrypt TEXT
  //       const textAESKey = await generateAESKey();
  //       const encryptedText = await encryptWithAES(textAESKey, messageData.ciphertext);

  //       const rawAES = await crypto.subtle.exportKey("raw", textAESKey);

  //       const encKeyRecipient = await crypto.subtle.encrypt(
  //         { name: "RSA-OAEP" },
  //         recipientPublicKey,
  //         rawAES
  //       );

  //       const encKeySender = await crypto.subtle.encrypt(
  //         { name: "RSA-OAEP" },
  //         senderPublicKey,
  //         rawAES
  //       );

  //       const encryptedTextAESKeyForRecipient = Array.from(new Uint8Array(encKeyRecipient))
  //         .map(b => b.toString(16).padStart(2, "0")).join("");

  //       const encryptedTextAESKeyForSender = Array.from(new Uint8Array(encKeySender))
  //         .map(b => b.toString(16).padStart(2, "0")).join("");

  //       // ✅ 3. Prepare FormData for HTTP request
  //       const formData = new FormData();

  //       const messagePayload = {
  //         sender: userId,
  //         receiver: currentSelectedUser._id,
  //         ciphertext: encryptedText,
  //         type: "ratcheted",
  //         contentType: messageData.type,
  //         encryptedKey: encryptedTextAESKeyForRecipient,
  //         senderEncryptedKey: encryptedTextAESKeyForSender,
  //         isGroup: false
  //       };

  //       formData.append("data", JSON.stringify(messagePayload));

  //       // ✅ 4. Temp UI Message
  //       const tempMessage: Message = {
  //         _id: `temp-${Date.now()}`,
  //         sender: userId,
  //         receiver: currentSelectedUser._id,
  //         ciphertext: encryptedText,
  //         text: messageData.ciphertext,
  //         type: "ratcheted",
  //         media: [],
  //         sentAt: new Date().toISOString(),
  //         isTemp: true,
  //         delivered: false,
  //         read: false
  //       };

  //       // ✅ 5. MEDIA ENCRYPTION (BINARY ONLY)
  //       if (messageData.media?.length) {
  //         for (let i = 0; i < messageData.media.length; i++) {
  //           const item = messageData.media[i];
            
  //           const { encryptedBlob, encryptedAESKeyForRecipient, encryptedAESKeyForSender } = 
  //             await encryptFileForRecipient(item.file, recipientPublicKey, senderPublicKey);

  //           // Create File object with proper name
  //           const encryptedFile = new File(
  //             [encryptedBlob],
  //             `encrypted_${item.file.name}`,
  //             { type: 'application/octet-stream' }
  //           );

  //           formData.append("media", encryptedFile);
            
  //           // Send metadata
  //           formData.append(`mediaType${i}`, item.type);
  //           formData.append(`mediaEncryptedKey${i}`, encryptedAESKeyForRecipient);
  //           formData.append(`mediaSenderEncryptedKey${i}`, encryptedAESKeyForSender);
  //           formData.append(`originalName${i}`, item.file.name);
  //           formData.append(`fileSize${i}`, item.file.size.toString());
            
  //           // For temp message preview
  //           const previewUrl = URL.createObjectURL(item.file);
  //           tempMessage.media!.push({
  //             url: previewUrl,
  //             type: item.type,
  //             encryptedKey: encryptedAESKeyForRecipient,
  //             senderEncryptedKey: encryptedAESKeyForSender,
  //             fileName: item.file.name,
  //             fileSize: item.file.size
  //           });
  //         }
  //       }

  //       // ✅ 6. Add temp message immediately
  //       setMessages(prev => [...prev, tempMessage]);
  //       setNewMessage("");

      

  //       // ✅ 8. SEND VIA HTTP API ONLY (NO SOCKET SENDING)
  //       try {
  //         const response = await api.post("/messages/send", formData, {
  //           timeout: 30000,
  //           headers: {
  //             'Content-Type': 'multipart/form-data'
  //           }
  //         });
          
  //         const realMessage = response.data?.data || response.data;

  //         // ✅ Replace temp with real message
  //         if (realMessage?._id) {
  //           setMessages(prev =>
  //             prev.map(msg =>
  //               msg._id === tempMessage._id
  //                 ? { ...realMessage, text: messageData.ciphertext, isTemp: false }
  //                 : msg
  //             )
  //           );
  //         }
  //       } catch (error) {
  //         console.error("📤 [sendMessage] ❌ Failed to send message via HTTP:", error);
  //         onErrorRef.current?.("Failed to send message. Please try again.");
  //       }

  //       // ✅ 9. Store plaintext locally for temp message
  //       if (isMountedRef.current) {
  //         setDecryptedMessages(prev => ({
  //           ...prev,
  //           [tempMessage._id]: messageData.ciphertext
  //         }));
  //       }

  //     } catch (error) {
  //       console.error("📤 [sendMessage] ❌ Failed to send message:", error);

  //       setMessages(prev => prev.filter(msg => !msg.isTemp));
  //       onErrorRef.current?.("Failed to send message. Please try again.");

  //       // Clean up object URLs
  //       document.querySelectorAll("audio, video, img").forEach((el) => {
  //         if (el instanceof HTMLImageElement || el instanceof HTMLMediaElement) {
  //           if (el.src) URL.revokeObjectURL(el.src);
  //         }
  //       });
  //     } finally {
  //       if (isMountedRef.current) {
  //         setIsSending(false);
  //       }
  //     }
  //   },
  //   [userId, getUserPublicKey]
  // );

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

      // For voice messages, we want the text to be empty unless user typed something
      const isVoiceMessage = messageData.media?.some(m => m.type === "audio") && 
                             (!messageData.ciphertext || messageData.ciphertext === "Voice message");

      // If it's a voice message with default text, update it
      let finalText = messageData.ciphertext;
      if (isVoiceMessage && (!finalText || finalText === "Voice message")) {
        finalText = "🎤 Voice message";
      }

      // ✅ 2. Encrypt TEXT (skip if no text)
      let encryptedText = "";
      let encryptedTextAESKeyForRecipient = "";
      let encryptedTextAESKeyForSender = "";
      
      if (finalText.trim()) {
        const textAESKey = await generateAESKey();
        encryptedText = await encryptWithAES(textAESKey, finalText);

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

        encryptedTextAESKeyForRecipient = Array.from(new Uint8Array(encKeyRecipient))
          .map(b => b.toString(16).padStart(2, "0")).join("");

        encryptedTextAESKeyForSender = Array.from(new Uint8Array(encKeySender))
          .map(b => b.toString(16).padStart(2, "0")).join("");
      }

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
        isGroup: false,
        isVoiceMessage: isVoiceMessage, // Add flag for voice messages
      };

      formData.append("data", JSON.stringify(messagePayload));

      // ✅ 4. Temp UI Message
      const tempMessage: Message = {
        _id: `temp-${Date.now()}`,
        sender: userId,
        receiver: currentSelectedUser._id,
        ciphertext: encryptedText,
        text: finalText,
        type: "ratcheted",
        media: [],
        sentAt: new Date().toISOString(),
        isTemp: true,
        delivered: false,
        read: false,
        isVoiceMessage: isVoiceMessage, // Add flag for voice messages
      };

      // ✅ 5. MEDIA ENCRYPTION (BINARY ONLY)
      if (messageData.media?.length) {
        for (let i = 0; i < messageData.media.length; i++) {
          const item = messageData.media[i];
          const isAudioFile = item.type === "audio";
          
          const { encryptedBlob, encryptedAESKeyForRecipient, encryptedAESKeyForSender } = 
            await encryptFileForRecipient(item.file, recipientPublicKey, senderPublicKey);

          // Create File object with proper name
          const encryptedFile = new File(
            [encryptedBlob],
            `encrypted_${item.file.name}`,
            { type: isAudioFile ? 'audio/webm' : 'application/octet-stream' }
          );

          formData.append("media", encryptedFile);
          
          // Send metadata
          formData.append(`mediaType${i}`, item.type);
          formData.append(`mediaEncryptedKey${i}`, encryptedAESKeyForRecipient);
          formData.append(`mediaSenderEncryptedKey${i}`, encryptedAESKeyForSender);
          formData.append(`originalName${i}`, item.file.name);
          formData.append(`fileSize${i}`, item.file.size.toString());
          formData.append(`isVoiceMessage${i}`, isVoiceMessage ? "true" : "false");
          
          // For temp message preview - handle voice specially
          let previewUrl = "";
          if (isAudioFile) {
            // For voice messages, we'll create an audio element preview
            previewUrl = URL.createObjectURL(item.file);
          } else if (item.type === "image") {
            previewUrl = URL.createObjectURL(item.file);
          } else if (item.type === "video") {
            previewUrl = URL.createObjectURL(item.file);
          }
          
          tempMessage.media!.push({
            url: previewUrl,
            type: item.type,
            encryptedKey: encryptedAESKeyForRecipient,
            senderEncryptedKey: encryptedAESKeyForSender,
            fileName: item.file.name,
            fileSize: item.file.size,
            isVoiceMessage: isVoiceMessage,
            duration: isAudioFile ? await getAudioDuration(item.file) : undefined
          });
        }
      }

      // ✅ 6. Add temp message immediately
      setMessages(prev => [...prev, tempMessage]);
      setNewMessage("");

      // ✅ 8. SEND VIA HTTP API ONLY (NO SOCKET SENDING)
      try {
        const response = await api.post("/messages/send", formData, {
          timeout: 60000, // Longer timeout for voice messages
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
                ? { 
                    ...realMessage, 
                    text: finalText, 
                    isTemp: false,
                    isVoiceMessage: isVoiceMessage,
                    media: tempMessage.media // Keep preview URLs
                  }
                : msg
            )
          );
        }
      } catch (error) {
        console.error("📤 [sendMessage] ❌ Failed to send message via HTTP:", error);
        onErrorRef.current?.("Failed to send message. Please try again.");
        
        // Mark temp message as failed
        setMessages(prev =>
          prev.map(msg =>
            msg._id === tempMessage._id
              ? { ...msg, isFailed: true }
              : msg
          )
        );
      }

      // ✅ 9. Store plaintext locally for temp message
      if (isMountedRef.current && finalText.trim()) {
        setDecryptedMessages(prev => ({
          ...prev,
          [tempMessage._id]: finalText
        }));
      }

    } catch (error) {
      console.error("📤 [sendMessage] ❌ Failed to send message:", error);

      setMessages(prev => prev.filter(msg => !msg.isTemp));
      onErrorRef.current?.("Failed to send message. Please try again.");

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
  [userId, getUserPublicKey]
);

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
      console.log("marking Messages REad");
      const res=await api.put(`/messages/chat/read/${userId}`);
      console.log("res", res);
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