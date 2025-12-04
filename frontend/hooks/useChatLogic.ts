// hooks/useChatLogic.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api';
import { 
  Message,  
  OnlineStatusEvent,
  Notification,
  User,
  Group,
  TypingEvent,
} from '@/types';
import { ChatItem } from '@/types';

interface UseChatLogicOptions {
  userId: string;
  onError?: (error: string) => void;
  onNewNotification?: (notification: Notification) => void;
}

interface DecryptedMessage {
  [messageId: string]: string;
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

  // -------------------- Refs --------------------
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(false);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // -------------------- Load Messages --------------------
  const loadMessages = useCallback(async () => {
    if (!userId || (!selectedUser && !selectedGroup)) return;

    try {
      setIsLoading(true);
      let response;

      if (selectedUser) {
        response = await api.get(`/messages/${selectedUser._id}`);
      } else if (selectedGroup) {
        response = await api.get(`/messages/${selectedGroup._id}?isGroup=true`);
      }

      if (isMountedRef.current && response?.data) {
        setMessages(response.data);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      onError?.('Failed to load messages');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [userId, selectedUser, selectedGroup, onError]);

  // -------------------- Load Chat Users --------------------
  const loadChatUsers = useCallback(async () => {
    if (!userId || !isMountedRef.current || isLoadingRef.current) return;

    try {
      setIsLoading(true);
      isLoadingRef.current = true;
      const response = await api.get('/messages/sidebar/list');

      if (isMountedRef.current) {
        setUsers(response.data || []);
      }
    } catch (error) {
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
  const handleNewMessage = useCallback((message: Message) => {
    if (!isMountedRef.current) return;

    setMessages(prev => [...prev, message]);

    if (selectedUser && message.sender === selectedUser._id) {
      // current conversation
    } else if (selectedGroup && message.receiver === selectedGroup._id) {
      // current group conversation
    } else {
      setUsers(prev => prev.map(item =>
        item._id === message.sender
          ? { ...item, lastMessage: message.text || message.ciphertext, lastMessageTime: message.sentAt }
          : item
      ));
    }
  }, [selectedUser, selectedGroup]);

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
      
      interface SearchResultItem {
        _id: unknown;
        type: 'user' | 'group';
        name: string;
        profilePic?: string | null;
        isOnline?: boolean;
        lastMessage?: string | null;
        lastMessageTime?: string | null;
        lastMessageMedia?: Array<{ url: string; type: string }> | null;
        unreadCount?: number;
        lastMessageDelivered?: boolean;
        lastMessageRead?: boolean;
        lastMessageSender?: string;
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
        const formattedResults = response.data.results.map(item => {
          const id = typeof item._id === 'object' && item._id !== null && 'toString' in item._id
            ? item._id.toString()
            : String(item._id);
          
          return {
            _id: id,
            type: item.type,
            name: item.name,
            profilePic: item.profilePic || undefined,
            isOnline: Boolean(item.isOnline),
            lastMessage: item.lastMessage || undefined,
            lastMessageTime: item.lastMessageTime || undefined,
            lastMessageMedia: item.lastMessageMedia || undefined,
            unreadCount: item.unreadCount || 0,
            lastMessageDelivered: item.lastMessageDelivered,
            lastMessageRead: item.lastMessageRead,
            lastMessageSender: item.lastMessageSender
          };
        });
        
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

  const handleMessageSent = useCallback((message: Message) => {
    if (!isMountedRef.current) return;

    setMessages(prev => prev.map(msg =>
      msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
        ? { ...message, isTemp: false }
        : msg
    ));
  }, []);

  const handleGroupMessageSent = useCallback((message: Message) => {
    if (!isMountedRef.current) return;

    setMessages(prev => prev.map(msg =>
      msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
        ? { ...message, isTemp: false }
        : msg
    ));
  }, []);

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

    // Setup all listeners once
    socketService.onNewMessage(handleNewMessage);
    socketService.onTyping(handleTyping);
    socketService.onStopTyping(handleStopTyping);
    socketService.onGroupTyping(handleGroupTyping);
    socketService.onGroupStopTyping(handleGroupStopTyping);
    socketService.onMessageSent(handleMessageSent);
    socketService.onGroupMessageSent(handleGroupMessageSent);
    socketService.onUserOnlineStatus(handleUserOnlineStatus);
    socketService.onDisconnect(handleSocketDisconnect);

    if (onNewNotification) socketService.onNewNotification(onNewNotification);

    return () => { socketService.removeAllListeners(); };
  }, [userId, handleNewMessage, handleTyping, handleStopTyping, handleGroupTyping, handleGroupStopTyping, handleMessageSent, handleGroupMessageSent, handleUserOnlineStatus, handleSocketDisconnect, onNewNotification, connectionState, onError]);

  // -------------------- Initial Load --------------------
  useEffect(() => {
    if (!userId || isInitialLoadRef.current) return;

    const loadInitialData = async () => {
      isInitialLoadRef.current = true;
      await loadChatUsers();
    };

    loadInitialData();
  }, [userId, loadChatUsers]);

  // -------------------- Periodic Refresh --------------------
  useEffect(() => {
    if (!userId || !socketService.isConnected()) return;

    const intervalId = setInterval(async () => {
      if (isMountedRef.current && !isLoadingRef.current) await loadChatUsers();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [userId, loadChatUsers]);

  // -------------------- Load Messages on Selection --------------------
  useEffect(() => { if (userId && (selectedUser || selectedGroup)) loadMessages(); }, [userId, selectedUser, selectedGroup, loadMessages]);

  // -------------------- Send Messages --------------------
  const sendMessage = useCallback(async (messageData: {
    sender: string; receiver: string; ciphertext: string; type: string;
    media?: Array<{ url: string; type: string; encryptedKey?: string }>;
  }) => {
    if (!userId || !selectedUser || !isMountedRef.current) return;
    try {
      setIsSending(true);
      const tempMessage: Message = {
        _id: `temp-${Date.now()}`,
        sender: userId,
        receiver: selectedUser._id,
        ciphertext: messageData.ciphertext,
        text: messageData.ciphertext,
        type:messageData.type as "text" | "image" | "audio" | "video" | "document",
        media: messageData.media,
        sentAt: new Date().toISOString(),
        isTemp: true, delivered: false, read: false
      };
      setMessages(prev => [...prev, tempMessage]);
      setNewMessage('');
      if (socketService.isConnected()) socketService.sendMessage(messageData);
      else {
        const formData = new FormData();
        formData.append('sender', userId);
        formData.append('receiver', selectedUser._id);
        formData.append('ciphertext', messageData.ciphertext);
        formData.append('type', messageData.type);
        await api.post('/messages/send', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      socketService.stopTypingEnhanced(selectedUser._id);
    } catch (error) {
      console.error(error);
      setMessages(prev => prev.filter(msg => !msg.isTemp));
      onError?.('Failed to send message');
    } finally { if (isMountedRef.current) setIsSending(false); }
  }, [userId, selectedUser, onError]);

  const sendGroupMessage = useCallback(async (messageData: {
    groupId: string; sender: string; ciphertext: string; type: string; media?: unknown[];
  }) => {
    if (!userId || !selectedGroup || !isMountedRef.current) return;
    try {
      setIsSending(true);
      const tempMessage: Message = {
  _id: `temp-${Date.now()}`,
  sender: userId,
  receiver: selectedGroup._id,
  ciphertext: messageData.ciphertext,
  text: messageData.ciphertext,
  type: messageData.type as "text" | "image" | "audio" | "video" | "document",
  media: (messageData.media as { url: string; type: string; encryptedKey?: string }[]) || [],
  sentAt: new Date().toISOString(),
  isTemp: true,
  delivered: false,
  read: false
};

      setMessages(prev => [...prev, tempMessage]);
      setNewMessage('');
      if (socketService.isConnected()) socketService.sendGroupMessage(messageData);
      else {
        const formData = new FormData();
        formData.append('groupId', messageData.groupId);
        formData.append('sender', userId);
        formData.append('ciphertext', messageData.ciphertext);
        formData.append('type', messageData.type);
        await api.post('/group/message', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      socketService.groupStopTyping({ groupId: selectedGroup._id, sender: userId });
    } catch (error) {
      console.error(error);
      setMessages(prev => prev.filter(msg => !msg.isTemp));
      onError?.('Failed to send group message');
    } finally { if (isMountedRef.current) setIsSending(false); }
  }, [userId, selectedGroup, onError]);

  // -------------------- New Chat / Typing --------------------
  const startNewChat = useCallback((user: User) => {
    if (!isMountedRef.current) return;
    setSelectedUser(user); setSelectedGroup(null);
    if (!users.some(u => u._id === user._id)) setUsers(prev => [user, ...prev]);
  }, [users]);

  const startNewGroupChat = useCallback((group: Group) => {
    if (!isMountedRef.current) return;
    setSelectedGroup(group); setSelectedUser(null);
    if (!users.some(u => u._id === group._id)) setUsers(prev => [group, ...prev]);
  }, [users]);

  const startTyping = useCallback((receiverId: string) => { if (userId) socketService.startTypingEnhanced(receiverId); }, [userId]);
  const stopTyping = useCallback((receiverId: string) => { if (userId) socketService.stopTypingEnhanced(receiverId); }, [userId]);
  const startGroupTyping = useCallback((groupId: string) => { if (userId && selectedGroup) socketService.groupTyping({ groupId, sender: userId }); }, [userId, selectedGroup]);
  const stopGroupTyping = useCallback((groupId: string) => { if (userId && selectedGroup) socketService.groupStopTyping({ groupId, sender: userId }); }, [userId, selectedGroup]);

  // -------------------- Mark as Seen --------------------
  const markMessagesAsSeen = useCallback(async (messageId: string, from: string) => {
    try {
      socketService.markMessageSeen(messageId, from);
      await api.patch(`/messages/ack/${messageId}`, { status: 'seen' });
      if (isMountedRef.current) setMessages(prev => prev.map(msg => msg._id === messageId ? { ...msg, read: true } : msg));
    } catch (error) { console.error('Failed to mark message as seen:', error); }
  }, []);

  // -------------------- Decryption --------------------
  const decryptMessage = useCallback((messageId: string, decryptedText: string) => {
    if (isMountedRef.current) setDecryptedMessages(prev => ({ ...prev, [messageId]: decryptedText }));
  }, []);

  // -------------------- Refresh --------------------
  const refreshChatList = useCallback(async () => { if (userId) await loadChatUsers(); }, [userId, loadChatUsers]);
  const refreshMessages = useCallback(async () => { await loadMessages(); }, [loadMessages]);

  return {
    messages, users, selectedUser, selectedGroup, decryptedMessages,
    typingUsers, groupTypingUsers, newMessage, isLoading, isSending, connectionState,
    setNewMessage, setSelectedUser, setSelectedGroup, setUsers, setMessages, setDecryptedMessages,
    sendMessage, sendGroupMessage, startNewChat, startNewGroupChat,
    startTyping, stopTyping, startGroupTyping, stopGroupTyping,
    markMessagesAsSeen, decryptMessage, loadChatUsers, loadMessages, refreshChatList, refreshMessages,searchUsers,
    isConnected: socketService.isConnected(),
    socketId: socketService.getSocketId(),
  };
};

export default useChatLogic;



// // hooks/useChatLogic.ts - FIXED INFINITE LOOP
// import { useState, useEffect, useRef, useCallback } from 'react';
// import { socketService } from '@/lib/socket';
// import { api } from '@/lib/api';
// import { 
//   Message,  
//   OnlineStatusEvent,
//   Notification,
//   User,
//   Group,
//   TypingEvent,
// } from '@/types';

// // Define ChatItem locally
// import { ChatItem } from '@/types';

// interface UseChatLogicOptions {
//   userId: string;
//   onError?: (error: string) => void;
//   onNewNotification?: (notification: Notification) => void;
// }

// interface DecryptedMessage {
//   [messageId: string]: string;
// }

// export const useChatLogic = (options: UseChatLogicOptions) => {
//   const { userId, onError, onNewNotification } = options;
  
//   // Chat State
//   const [messages, setMessages] = useState<Message[]>([]);
//   const [users, setUsers] = useState<ChatItem[]>([]);
//   const [selectedUser, setSelectedUser] = useState<User | null>(null);
//   const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
//   const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage>({});
//   const [typingUsers, setTypingUsers] = useState<string[]>([]);
//   const [groupTypingUsers, setGroupTypingUsers] = useState<Record<string, string[]>>({});
//   const [newMessage, setNewMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [isSending, setIsSending] = useState(false);
  
//   // Socket connection state
//   const [connectionState, setConnectionState] = useState<string>('disconnected');
  
//   // Refs to prevent re-renders and track state
//   const optionsRef = useRef(options);
//   const isMountedRef = useRef(true);
//   const isLoadingRef = useRef(false);
//   const isInitialLoadRef = useRef(false);
  
//   // Update options ref when options change
//   useEffect(() => {
//     optionsRef.current = options;
//   }, [options]);

//   // Update ref when isLoading changes
//   useEffect(() => {
//     isLoadingRef.current = isLoading;
//   }, [isLoading]);

//   // Load messages for selected user or group
//   const loadMessages = useCallback(async () => {
//   if (!userId || (!selectedUser && !selectedGroup)) return;

//   try {
//     setIsLoading(true);

//     let response;

//     if (selectedUser) {
//       // ✅ Private chat
//       response = await api.get(`/messages/${selectedUser._id}`);
//     } else if (selectedGroup) {
//       // ✅ Group chat (using query param like your controller expects)
//       response = await api.get(
//         `/messages/${selectedGroup._id}?isGroup=true`
//       );
//     }

//     if (isMountedRef.current && response?.data) {
//       // ✅ Your controller returns the array directly (not wrapped in { messages })
//       setMessages(response.data);
//       console.log(response);
//     }

//   } catch (error) {
//     console.error('Failed to load messages:', error);
//     onError?.('Failed to load messages');
//   } finally {
//     if (isMountedRef.current) {
//       setIsLoading(false);
//     }
//   }
// }, [userId, selectedUser, selectedGroup, onError]);


//   // Load sidebar chat list
// const loadChatUsers = useCallback(async () => {
//   if (!userId || !isMountedRef.current) return;

//   if (isLoadingRef.current) {
//     console.log('⚠️ loadChatUsers already in progress, skipping...');
//     return;
//   }

//   try {
//     setIsLoading(true);
//     isLoadingRef.current = true;

//     console.log('🔄 Loading chat list from sidebar/list endpoint...');

//     const response = await api.get('/messages/sidebar/list');

//     if (isMountedRef.current) {
//       console.log('✅ Successfully loaded chats:', response.data?.length || 0, 'items');
//       setUsers(response.data || []);
//     }

//   } catch (error) {
//     console.error('Failed to load chat list:', error);
//     if (isMountedRef.current) {
//       onError?.('Failed to load chat list');
//       setUsers([]);
//     }
//   } finally {
//     if (isMountedRef.current) {
//       setIsLoading(false);
//       isLoadingRef.current = false;
//     }
//   }
// }, [userId, onError]);


//   // Socket event handlers
//   const handleNewMessage = useCallback((message: Message) => {
//     if (!isMountedRef.current) return;
    
//     setMessages(prev => [...prev, message]);
    
//     if (selectedUser && message.sender === selectedUser._id) {
//       // Current conversation
//     } else if (selectedGroup && message.receiver === selectedGroup._id) {
//       // Current group conversation
//     } else {
//       setUsers(prev => prev.map(item => 
//         item._id === message.sender ? { 
//           ...item, 
//           lastMessage: message.text || message.ciphertext,
//           lastMessageTime: message.sentAt
//         } : item
//       ));
//     }
//   }, [selectedUser, selectedGroup]);

//   const handleTyping = useCallback((data: TypingEvent) => {
//     if (!isMountedRef.current) return;
    
//     if (data.to === userId && data.isTyping) {
//       setTypingUsers(prev => [...prev.filter(id => id !== data.from), data.from]);
//     }
//   }, [userId]);

//   const handleStopTyping = useCallback((data: TypingEvent) => {
//     if (!isMountedRef.current) return;
    
//     if (data.to === userId && !data.isTyping) {
//       setTypingUsers(prev => prev.filter(id => id !== data.from));
//     }
//   }, [userId]);

//   const handleGroupTyping = useCallback((data: { groupId: string; sender: string }) => {
//     if (!isMountedRef.current || !selectedGroup) return;
    
//     if (data.groupId === selectedGroup._id) {
//       setGroupTypingUsers(prev => ({
//         ...prev,
//         [data.groupId]: [...(prev[data.groupId] || []).filter(id => id !== data.sender), data.sender]
//       }));
//     }
//   }, [selectedGroup]);

//   const handleGroupStopTyping = useCallback((data: { groupId: string; sender: string }) => {
//     if (!isMountedRef.current || !selectedGroup) return;
    
//     if (data.groupId === selectedGroup._id) {
//       setGroupTypingUsers(prev => ({
//         ...prev,
//         [data.groupId]: (prev[data.groupId] || []).filter(sender => sender !== data.sender)
//       }));
//     }
//   }, [selectedGroup]);

//   const handleUserOnlineStatus = useCallback((data: OnlineStatusEvent) => {
//     if (!isMountedRef.current) return;
    
//     setUsers(prev => prev.map(item => 
//       item._id === data.userId ? { ...item, isOnline: data.isOnline, lastSeen: data.lastSeen } : item
//     ));
//   }, []);

//   const handleMessageSent = useCallback((message: Message) => {
//     if (!isMountedRef.current) return;
    
//     setMessages(prev => prev.map(msg => 
//       msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
//         ? { ...message, isTemp: false }
//         : msg
//     ));
//   }, []);

//   const handleGroupMessageSent = useCallback((message: Message) => {
//     if (!isMountedRef.current) return;
    
//     setMessages(prev => prev.map(msg => 
//       msg._id.startsWith('temp-') && msg.sender === message.sender && msg.receiver === message.receiver
//         ? { ...message, isTemp: false }
//         : msg
//     ));
//   }, []);

//   const handleSocketDisconnect = useCallback(() => {
//     if (!isMountedRef.current) return;
    
//     setConnectionState('disconnected');
//   }, []);

//   // Connect to socket when userId is available - SIMPLIFIED VERSION
//   useEffect(() => {
//     if (!userId) return;

//     isMountedRef.current = true;
    
//     const connectSocket = async () => {
//       // Check if already connected or connecting
//       if (socketService.isConnected() || connectionState === 'connecting') {
//         console.log('✅ Socket already connected or connecting, skipping...');
//         return;
//       }
      
//       console.log('🔄 Attempting socket connection...');
      
//       try {
//         if (isMountedRef.current) {
//           setConnectionState('connecting');
//         }
        
//         const connected = await socketService.connect(userId);
        
//         if (!isMountedRef.current) return;
        
//         if (connected) {
//           setConnectionState('connected');
//           console.log('✅ Socket connected successfully to:', socketService.getSocketId());
//         } else {
//           setConnectionState('error');
//         }
//       } catch (error) {
//         console.error('Failed to connect socket:', error);
//         if (isMountedRef.current) {
//           setConnectionState('error');
//           onError?.('Failed to connect to socket server');
//         }
//       }
//     };

//     connectSocket();

//     // Setup socket listeners
//     const cleanupSocketListeners = () => {
//       socketService.onNewMessage(handleNewMessage);
//       socketService.onTyping(handleTyping);
//       socketService.onStopTyping(handleStopTyping);
//       socketService.onGroupTyping(handleGroupTyping);
//       socketService.onGroupStopTyping(handleGroupStopTyping);
//       socketService.onMessageSent(handleMessageSent);
//       socketService.onGroupMessageSent(handleGroupMessageSent);
//       socketService.onUserOnlineStatus(handleUserOnlineStatus);
//       socketService.onDisconnect(handleSocketDisconnect);
      
//       if (onNewNotification) {
//         socketService.onNewNotification(onNewNotification);
//       }
      
//       // Return cleanup function
//       return () => {
//         socketService.removeAllListeners();
//       };
//     };

//     const socketCleanup = cleanupSocketListeners();

//     return () => {
//       isMountedRef.current = false;
      
//       // Cleanup socket listeners
//       socketCleanup();
      
//       // Don't disconnect socket - keep it connected for the app
//     };
//   }, []); // REMOVED onNewNotification from dependencies to prevent loops

//   // Setup notification listener separately
//   useEffect(() => {
//     if (!onNewNotification) return;
    
//     socketService.onNewNotification(onNewNotification);
    
//     return () => {
   
//     };
//   }, [onNewNotification]);

//   // Load initial chat data when userId is available
//   useEffect(() => {
//     if (!userId || isInitialLoadRef.current) return;
    
//     const loadInitialData = async () => {
//       isInitialLoadRef.current = true;
//       console.log('📱 Loading initial chat data...');
//       await loadChatUsers();
//     };
    
//     loadInitialData();
//   }, [userId, loadChatUsers]);

//   // Refresh chat list periodically when connected
//   useEffect(() => {
//     if (!userId || !socketService.isConnected()) return;
    
//     const intervalId = setInterval(async () => {
//       if (isMountedRef.current && !isLoadingRef.current) {
//         console.log('🔄 Refreshing chat list...');
//         await loadChatUsers();
//       }
//     }, 60000);
    
//     return () => clearInterval(intervalId);
//   }, [userId, loadChatUsers]);

//   // Load messages when selected user/group changes
//   useEffect(() => {
//     if (userId && (selectedUser || selectedGroup) && isMountedRef.current) {
//       loadMessages();
//     }
//   }, [userId, selectedUser, selectedGroup, loadMessages]);

//   // Send message functions
//   const sendMessage = useCallback(async (messageData: {
//     sender: string;
//     receiver: string;
//     ciphertext: string;
//     type: string;
//     media?: Array<{ url: string; type: string; encryptedKey?: string }>;
//   }) => {
//     if (!userId || !selectedUser || !isMountedRef.current) return;
    
//     try {
//       setIsSending(true);
      
//       const tempMessage: Message = {
//         _id: `temp-${Date.now()}`,
//         sender: userId,
//         receiver: selectedUser._id,
//         ciphertext: messageData.ciphertext,
//         text: messageData.ciphertext,
//         type: messageData.type as "text" | "image" | "audio" | "video" | "document",
//         media: messageData.media,
//         sentAt: new Date().toISOString(),
//         isTemp: true,
//         delivered: false,
//         read: false
//       };
      
//       if (isMountedRef.current) {
//         setMessages(prev => [...prev, tempMessage]);
//         setNewMessage('');
//       }
      
//       if (socketService.isConnected()) {
//         socketService.sendMessage(messageData);
//       } else {
//         const formData = new FormData();
//         formData.append('sender', userId);
//         formData.append('receiver', selectedUser._id);
//         formData.append('ciphertext', messageData.ciphertext);
//         formData.append('type', messageData.type);
        
//         await api.post('/messages/send', formData, {
//           headers: {
//             'Content-Type': 'multipart/form-data',
//           },
//         });
//       }
      
//       socketService.stopTypingEnhanced(selectedUser._id);
      
//     } catch (error) {
//       console.error('Failed to send message:', error);
//       if (isMountedRef.current) {
//         onError?.('Failed to send message');
//         setMessages(prev => prev.filter(msg => !msg.isTemp));
//       }
//     } finally {
//       if (isMountedRef.current) {
//         setIsSending(false);
//       }
//     }
//   }, [userId, selectedUser, onError]);

//   const sendGroupMessage = useCallback(async (messageData: {
//     groupId: string;
//     sender: string;
//     ciphertext: string;
//     type: string;
//     media?: unknown[];
//   }) => {
//     if (!userId || !selectedGroup || !isMountedRef.current) return;
    
//     try {
//       setIsSending(true);
      
//       const tempMessage: Message = {
//         _id: `temp-${Date.now()}`,
//         sender: userId,
//         receiver: selectedGroup._id,
//         ciphertext: messageData.ciphertext,
//         text: messageData.ciphertext,
//         type: messageData.type as "text" | "image" | "audio" | "video" | "document",
//         media: messageData.media as Array<{ url: string; type: string; encryptedKey?: string }>,
//         sentAt: new Date().toISOString(),
//         isTemp: true,
//         delivered: false,
//         read: false
//       };
      
//       if (isMountedRef.current) {
//         setMessages(prev => [...prev, tempMessage]);
//         setNewMessage('');
//       }
      
//       if (socketService.isConnected()) {
//         socketService.sendGroupMessage(messageData);
//       } else {
//         const formData = new FormData();
//         formData.append('groupId', messageData.groupId);
//         formData.append('sender', userId);
//         formData.append('ciphertext', messageData.ciphertext);
//         formData.append('type', messageData.type);
        
//         await api.post('/group/message', formData, {
//           headers: {
//             'Content-Type': 'multipart/form-data',
//           },
//         });
//       }
      
//       socketService.groupStopTyping({ groupId: selectedGroup._id, sender: userId });
      
//     } catch (error) {
//       console.error('Failed to send group message:', error);
//       if (isMountedRef.current) {
//         onError?.('Failed to send group message');
//         setMessages(prev => prev.filter(msg => !msg.isTemp));
//       }
//     } finally {
//       if (isMountedRef.current) {
//         setIsSending(false);
//       }
//     }
//   }, [userId, selectedGroup, onError]);

//   // Start new chat functions
//   const startNewChat = useCallback(async (user: User) => {
//     if (!isMountedRef.current) return;
    
//     setSelectedUser(user);
//     setSelectedGroup(null);
    
//     const exists = users.some(u => u._id === user._id);
//     if (!exists) {
//       setUsers(prev => [user, ...prev]);
//     }
    
//     await loadMessages();
//   }, [users, loadMessages]);

//   const startNewGroupChat = useCallback(async (group: Group) => {
//     if (!isMountedRef.current) return;
    
//     setSelectedGroup(group);
//     setSelectedUser(null);
    
//     const exists = users.some(u => u._id === group._id);
//     if (!exists) {
//       setUsers(prev => [group, ...prev]);
//     }
    
//     await loadMessages();
//   }, [users, loadMessages]);

//   // Typing indicators
//   const startTyping = useCallback((receiverId: string) => {
//     if (!userId) return;
//     socketService.startTypingEnhanced(receiverId);
//   }, [userId]);

//   const stopTyping = useCallback((receiverId: string) => {
//     if (!userId) return;
//     socketService.stopTypingEnhanced(receiverId);
//   }, [userId]);

//   const startGroupTyping = useCallback((groupId: string) => {
//     if (!userId || !selectedGroup) return;
//     socketService.groupTyping({ groupId, sender: userId });
//   }, [userId, selectedGroup]);

//   const stopGroupTyping = useCallback((groupId: string) => {
//     if (!userId || !selectedGroup) return;
//     socketService.groupStopTyping({ groupId, sender: userId });
//   }, [userId, selectedGroup]);

//   // Mark messages as seen
//   const markMessagesAsSeen = useCallback(async (messageId: string, from: string) => {
//     try {
//       socketService.markMessageSeen(messageId, from);
      
//       await api.patch(`/messages/ack/${messageId}`, { status: 'seen' });
      
//       if (isMountedRef.current) {
//         setMessages(prev => prev.map(msg => 
//           msg._id === messageId ? { ...msg, read: true } : msg
//         ));
//       }
//     } catch (error) {
//       console.error('Failed to mark message as seen:', error);
//     }
//   }, []);

//   // Search function
//   const searchUsers = useCallback(async (query: string): Promise<Array<{
//     _id: string;
//     type: 'user' | 'group';
//     name: string;
//     profilePic?: string;
//     lastMessage?: string;
//     lastMessageTime?: string;
//     lastMessageMedia?: Array<{ url: string; type: string }>;
//     unreadCount: number;
//     isOnline?: boolean;
//     lastMessageDelivered?: boolean;
//     lastMessageRead?: boolean;
//     lastMessageSender?: string;
//   }>> => {
//     try {
//       console.log(`🔍 [Frontend] Searching for: "${query}"`);
      
//       interface SearchResultItem {
//         _id: unknown;
//         type: 'user' | 'group';
//         name: string;
//         profilePic?: string | null;
//         isOnline?: boolean;
//         lastMessage?: string | null;
//         lastMessageTime?: string | null;
//         lastMessageMedia?: Array<{ url: string; type: string }> | null;
//         unreadCount?: number;
//         lastMessageDelivered?: boolean;
//         lastMessageRead?: boolean;
//         lastMessageSender?: string;
//       }

//       interface SearchResponse {
//         success: boolean;
//         results: SearchResultItem[];
//       }

//       const response = await api.get<SearchResponse>(`/messages/search?q=${encodeURIComponent(query)}`);
      
//       console.log(`📥 [Frontend] Search response:`, {
//         success: response.data.success,
//         count: response.data.results?.length || 0
//       });
      
//       if (response.data.success) {
//         const formattedResults = response.data.results.map(item => {
//           const id = typeof item._id === 'object' && item._id !== null && 'toString' in item._id
//             ? item._id.toString()
//             : String(item._id);
          
//           return {
//             _id: id,
//             type: item.type,
//             name: item.name,
//             profilePic: item.profilePic || undefined,
//             isOnline: Boolean(item.isOnline),
//             lastMessage: item.lastMessage || undefined,
//             lastMessageTime: item.lastMessageTime || undefined,
//             lastMessageMedia: item.lastMessageMedia || undefined,
//             unreadCount: item.unreadCount || 0,
//             lastMessageDelivered: item.lastMessageDelivered,
//             lastMessageRead: item.lastMessageRead,
//             lastMessageSender: item.lastMessageSender
//           };
//         });
        
//         console.log(`✅ [Frontend] Returning ${formattedResults.length} results`);
//         return formattedResults;
//       }
      
//       return [];
//     } catch (error: unknown) {
//       console.error('❌ [Frontend] Search failed:', error);
//       return [];
//     }
//   }, []);

//   // Handle decryption
//   const decryptMessage = useCallback((messageId: string, decryptedText: string) => {
//     if (isMountedRef.current) {
//       setDecryptedMessages(prev => ({
//         ...prev,
//         [messageId]: decryptedText
//       }));
//     }
//   }, []);

//   // Manual refresh functions
//   const refreshChatList = useCallback(async () => {
//     if (!userId) return;
//     await loadChatUsers();
//   }, [userId, loadChatUsers]);

//   const refreshMessages = useCallback(async () => {
//     await loadMessages();
//   }, [loadMessages]);

//   return {
//     // State
//     messages,
//     users,
//     selectedUser,
//     selectedGroup,
//     decryptedMessages,
//     typingUsers,
//     groupTypingUsers,
//     newMessage,
//     isLoading,
//     isSending,
//     connectionState,
    
//     // Setters
//     setNewMessage,
//     setSelectedUser,
//     setSelectedGroup,
//     setUsers,
//     setMessages,
//     setDecryptedMessages,
    
//     // Actions
//     sendMessage,
//     sendGroupMessage,
//     startNewChat,
//     startNewGroupChat,
//     startTyping,
//     stopTyping,
//     startGroupTyping,
//     stopGroupTyping,
//     markMessagesAsSeen,
//     searchUsers,
//     decryptMessage,
//     loadChatUsers,
//     loadMessages,
//     refreshChatList,
//     refreshMessages,
    
//     // Socket info
//     isConnected: socketService.isConnected(),
//     socketId: socketService.getSocketId(),
//   };
// };

// export default useChatLogic;