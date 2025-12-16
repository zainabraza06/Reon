import React, { useState, useEffect, useMemo } from 'react';
import { ChatItem, User } from '@/types';
import { Search, Users, X, Clock, Check, CheckCheck } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import UserProfile from '@/components/chat/UserProfile';
import styles from './SideBar.module.css';

interface SidebarProps {
  users: ChatItem[];
  currentUserId: string;
  selectedId?: string;
  onSelectUser: (user: ChatItem) => void;
  onSearch: (query: string) => Promise<ChatItem[]>; 
  currentUser: User;
  searchResults?: ChatItem[];
  clearSearchResults?: () => void;
  onMessageStatusUpdate?: (chatId: string, status: 'sent' | 'delivered' | 'read') => void;
  onUserTyping?: (chatId: string, isTyping: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  users,
  currentUserId,
  selectedId,
  onSelectUser,
  onSearch,
  currentUser,
  searchResults = [],
  clearSearchResults,
  onMessageStatusUpdate,
  onUserTyping,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [optimizedUsers, setOptimizedUsers] = useState<ChatItem[]>(users);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);

  // Optimize user updates - only update when necessary
  useEffect(() => {
    // Create a map for quick lookup
    const currentMap = new Map(optimizedUsers.map(u => [u._id, u]));
    const newMap = new Map(users.map(u => [u._id, u]));
    
    // Check if we need to update
    let needsUpdate = false;
    
    // Check for new users or removed users
    if (optimizedUsers.length !== users.length) {
      needsUpdate = true;
    } else {
      // Check if any user data has changed
      for (const user of users) {
        const existingUser = currentMap.get(user._id);
        if (!existingUser || 
            existingUser.tickStatus !== user.tickStatus ||
            existingUser.unreadCount !== user.unreadCount ||
            existingUser.lastMessage !== user.lastMessage ||
            existingUser.lastMessageTime !== user.lastMessageTime ||
            existingUser.isOnline !== user.isOnline ||
            existingUser.isTyping !== user.isTyping) { // Added isTyping check
          needsUpdate = true;
          break;
        }
      }
    }
    
    if (needsUpdate) {
      setOptimizedUsers(users);
    }
  }, [users, optimizedUsers]);

  // Determine display items based on search state
  const getDisplayItems = () => {
    if (searchQuery.trim().length > 0 && searchResults.length > 0) {
      return searchResults;
    }
    return optimizedUsers;
  };

  const displayItems = getDisplayItems();
  const isSearchActive = searchQuery.trim().length > 0;

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);

    if (q.trim().length > 1) {
      setIsSearching(true);
      try {
        await onSearch(q);
      } catch (error) {
        console.error('❌ [Sidebar] Search error:', error);
        if (clearSearchResults) {
          clearSearchResults();
        }
      } finally {
        setIsSearching(false);
      }
    } else {
      setIsSearching(false);
      if (clearSearchResults) {
        clearSearchResults();
      }
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    const name = target.alt || 'User';
    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  };

  const formatLastMessage = (item: ChatItem): string => {
    if (item.isTyping) {
      return 'Typing...';
    }
    
    if (item.lastMessage && item.lastMessage.trim() !== '') {
      return item.lastMessage;
    }
    
    if (item.lastMessageMedia) {
      const mediaType = item.lastMessageMedia;
      if (mediaType === 'image') return '📷 Photo';
      if (mediaType === 'video') return '🎬 Video';
      if (mediaType === 'audio') return '🎵 Audio';
      if (mediaType === 'document') return '📎 Document';
      return '📎 File';
    }
    
    return 'No messages yet';
  };

  const handleSelectItem = (item: ChatItem) => {
    onSelectUser(item);
  };

  const clearSearch = () => {
    setSearchQuery('');
    if (clearSearchResults) {
      clearSearchResults();
    }
    setIsSearching(false);
  };

  // Render tick status icons
  const renderTickStatus = (status: 'none' | 'sent' | 'delivered' | 'read', isSelected: boolean) => {
    switch (status) {
      case 'sent':
        return (
          <Check 
            size={12} 
            className={`${styles.tickIcon} ${styles.tickSent} ${isSelected ? styles.tickSelected : ''}`} 
          />
        );
      case 'delivered':
        return (
          <div className={styles.doubleTickContainer}>
            <Check size={10} className={`${styles.tickIcon} ${styles.tickDelivered} ${isSelected ? styles.tickSelected : ''}`} />
            <Check size={10} className={`${styles.tickIcon} ${styles.tickDelivered} ${isSelected ? styles.tickSelected : ''}`} />
          </div>
        );
      case 'read':
        return (
          <div className={styles.doubleTickContainer}>
            <CheckCheck size={10} className={`${styles.tickIcon} ${styles.tickRead} ${isSelected ? styles.tickSelected : ''}`} />
          </div>
        );
      default:
        return null;
    }
  };

  const renderItem = (item: ChatItem, index: number) => {
    const isSelected = selectedId === item._id;
    const isLastMessageFromCurrentUser = item.lastMessageSenderId === currentUserId;
    const formattedLastMessage = formatLastMessage(item);
    const showTicks = isLastMessageFromCurrentUser && item.tickStatus && item.tickStatus !== 'none';
    
    return (
      <div
        key={`${item._id}-${index}`}
        onClick={() => handleSelectItem(item)}
        className={`${styles.chatItem} ${isSelected ? styles.chatItemSelected : styles.chatItemHover}`}
      >
        {isSelected && <div className={styles.activeBar} />}

        <div className={styles.avatarWrapper}>
          <img
            src={item.profilePic || `https://ui-avatars.com/api/?name=${item.username}&background=random`}
            alt={item.username || 'User'}
            className={styles.avatar}
            onError={handleImageError}
          />
          
          {/* Double status indicator: Online + Typing */}
          <div className={styles.statusIndicators}>
            {item.isOnline && (
              <div className={styles.onlineBadge} title="Online" />
            )}
           
          </div>
        </div>

        <div className={styles.itemContent}>
          <div className={styles.itemHeader}>
            <div className={styles.itemNameContainer}>
              <h4 className={`${styles.itemName} ${isSelected && styles.itemNameSelected}`}>
                {item.fullName || item.username}
              </h4>
              
              
            </div>
            
            <div className={styles.headerRight}>
              {item.lastMessageTime && (
                <span className={`${styles.itemTime} ${isSelected && styles.itemTimeSelected}`}>
                  {formatRelativeTime(item.lastMessageTime)}
                </span>
              )}
              
              {/* Unread badge */}
              {!item.isTyping && item.unreadCount > 0 && (
                <div className={styles.unreadBadge}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </div>
              )}
              
              
            </div>
          </div>

          <div className={styles.itemFooter}>
            <div className={styles.lastMessageContainer}>
              <p className={`${styles.lastMessage} ${isSelected && styles.lastMessageSelected} ${item.isTyping ? styles.typingText : ''}`}>
                {formattedLastMessage}
              </p>
              
              {/* Message area typing indicator */}
              {item.isTyping && (
                <div className={styles.messageTypingIndicator}>
                  <div className={styles.typingDots}>
                    <span className={styles.typingDot}></span>
                    <span className={styles.typingDot}></span>
                    <span className={styles.typingDot}></span>
                  </div>
                </div>
              )}
              
              {showTicks && !item.isTyping && (
                <div className={`${styles.tickContainer} ${isSelected && styles.tickContainerSelected}`}>
                  {renderTickStatus(item.tickStatus!, isSelected)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Global typing indicator for sidebar
  const typingUsersCount = displayItems.filter(item => item.isTyping).length;
  
  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <UserProfile
          currentUser={currentUser}
          showUserMenu={showUserMenu}
          setShowUserMenu={setShowUserMenu}
          userMenuRef={userMenuRef}
          pendingFriendRequests={currentUser?.pendingFriendRequests || 0}
          currentPage="messages"
        />
      </div>

      {/* Search */}
      <div className={styles.searchContainer}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={16} />
          <input
            type="text"
            placeholder="Search users"
            value={searchQuery}
            onChange={handleSearch}
            className={styles.searchInput}
          />
          {searchQuery && (
            <button 
              onClick={clearSearch}
              className={styles.clearSearchButton}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Global typing indicator */}
      {typingUsersCount > 0 && (
        <div className={styles.globalTypingHeader}>
          <div className={styles.globalTypingBadge}>
            <div className={styles.globalTypingCount}>
              {typingUsersCount}
            </div>
            <span className={styles.globalTypingText}>
              {typingUsersCount === 1 ? 'User is typing' : `${typingUsersCount} users typing`}
            </span>
            <div className={styles.globalTypingDots}>
              <span className={styles.globalTypingDot}></span>
              <span className={styles.globalTypingDot}></span>
              <span className={styles.globalTypingDot}></span>
            </div>
          </div>
        </div>
      )}

      {/* List Container */}
      <div className={`${styles.listContainer} custom-scrollbar`}>
        {/* Search header when in search mode */}
        {isSearchActive && (
          <div className={styles.searchResultsHeader}>
            <p className={styles.searchResultsTitle}>
              {isSearching 
                ? 'Searching...' 
                : searchResults.length > 0 
                  ? `Search Results (${searchResults.length})`
                  : 'Search Results'}
            </p>
            {searchQuery && (
              <button 
                className={styles.clearResultsButton}
                onClick={clearSearch}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Display items list */}
        {isSearching ? (
          <div className={styles.searchingIndicator}>
            <div className={styles.spinner} />
            <p>Searching...</p>
          </div>
        ) : displayItems.length > 0 ? (
          <div className={styles.userList}>
            {displayItems.map((item, index) => renderItem(item, index))}
          </div>
        ) : isSearchActive ? (
          <div className={styles.noResults}>
            <Users className={styles.noResultsIcon} size={32} />
            <p className={styles.noResultsText}>
              No results found for &quot;{searchQuery}&quot;
            </p>
            <button 
              onClick={clearSearch}
              className={styles.noResultsButton}
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <Users className={styles.emptyStateIconSvg} size={24} />
            </div>
            <p className={styles.emptyStateText}>No chats yet</p>
            <p className={styles.emptyStateSubtext}>
              Search for users to start a conversation
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;