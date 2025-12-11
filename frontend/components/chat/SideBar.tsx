import React, { useState, useEffect } from 'react';
import { ChatItem, User } from '@/types';
import { Search, Users, X } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import UserProfile from '@/components/chat/UserProfile';
import styles from './SideBar.module.css';

type SearchResultItem = {
  _id: string;
  fullName: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isOnline?: boolean;
  username?: string;
  memberCount?: number;
  admin?: string;
  lastMessageSenderId?: string;
  tickStatus?: 'none' | 'sent' | 'delivered' | 'read';
  lastMessageMedia?: "image" | "video" | "audio" | "document";
  type?: 'user' | 'group';
};

interface SidebarProps {
  users: ChatItem[];
  currentUserId: string;
  selectedId?: string;
  onSelectUser: (user: ChatItem | SearchResultItem) => void;
  onSearch: (query: string) => Promise<SearchResultItem[]>; 
  currentUser: User;
}

const Sidebar: React.FC<SidebarProps> = ({
  users,
  currentUserId,
  selectedId,
  onSelectUser,
  onSearch,
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);

  // Log users prop changes to see duplicates
  useEffect(() => {
    console.log('👥 [Sidebar] users prop received:', users);
    console.log('👥 [Sidebar] users prop length:', users.length);
    
    // Check for duplicates
    const seen = new Set();
    const duplicates: string[] = [];
    
    users.forEach(user => {
      if (seen.has(user._id)) {
        duplicates.push(user._id);
        console.log(`🚨 [Sidebar] DUPLICATE FOUND: ${user._id} - ${user.fullName || user.username}`);
      }
      seen.add(user._id);
    });
    
    if (duplicates.length > 0) {
      console.log(`🚨 [Sidebar] Found ${duplicates.length} duplicate users in users prop`);
      console.log(`🚨 [Sidebar] Duplicate IDs:`, duplicates);
      
      // Show the actual duplicate data
      duplicates.forEach(duplicateId => {
        const duplicateUsers = users.filter(u => u._id === duplicateId);
        console.log(`🚨 [Sidebar] Duplicate instances for ${duplicateId}:`, duplicateUsers);
      });
    } else {
      console.log('✅ [Sidebar] No duplicates found in users prop');
    }
  }, [users]);

  // Clear search when clicking outside or selecting an item
  useEffect(() => {
    console.log('🔄 [Sidebar] useEffect triggered, searchQuery:', searchQuery);
    if (searchQuery.trim().length === 0) {
      console.log('🧹 [Sidebar] Clearing search results because query is empty');
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Determine display items based on search state
  const getDisplayItems = () => {
    console.log('📋 [Sidebar] getDisplayItems called');
    console.log('   searchQuery:', searchQuery);
    console.log('   searchQuery.trim().length > 0:', searchQuery.trim().length > 0);
    console.log('   searchResults.length:', searchResults.length);
    console.log('   users prop length:', users.length);
    
    if (searchQuery.trim().length > 0 && searchResults.length > 0) {
      console.log('   🔍 [Sidebar] Returning searchResults');
      return searchResults;
    }
    console.log('   👥 [Sidebar] Returning regular users');
    return users;
  };

  const displayItems = getDisplayItems();
  
  console.log('📊 [Sidebar] displayItems:', displayItems);
  console.log('📊 [Sidebar] displayItems length:', displayItems.length);
  
  // Check for duplicates in displayItems
  useEffect(() => {
    if (displayItems.length > 0) {
      const seen = new Set();
      const duplicates: string[] = [];
      
      displayItems.forEach(item => {
        if (seen.has(item._id)) {
          duplicates.push(item._id);
        }
        seen.add(item._id);
      });
      
      if (duplicates.length > 0) {
        console.log(`🚨 [Sidebar] Found ${duplicates.length} duplicates in displayItems:`, duplicates);
      }
    }
  }, [displayItems]);

  const isSearchActive = searchQuery.trim().length > 0 && searchResults.length > 0;
  console.log('🎯 [Sidebar] isSearchActive:', isSearchActive);
  console.log('   - searchQuery.trim().length > 0:', searchQuery.trim().length > 0);
  console.log('   - searchResults.length > 0:', searchResults.length > 0);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    console.log('🔤 [Sidebar] handleSearch called with value:', q);
    console.log('   Previous searchQuery:', searchQuery);
    setSearchQuery(q);

    if (q.trim().length > 1) {
      console.log('🔍 [Sidebar] Starting search for:', q);
      setIsSearching(true);
      try {
        const results = await onSearch(q);
        console.log('✅ [Sidebar] Search results received:', results);
        console.log('   Number of results:', results.length);
        
        // Check for duplicates in search results
        const seen = new Set();
        const uniqueResults = results.filter(result => {
          if (seen.has(result._id)) {
            console.log(`🚨 [Sidebar] Duplicate in search results: ${result._id} - ${result.fullName}`);
            return false;
          }
          seen.add(result._id);
          return true;
        });
        
        if (uniqueResults.length !== results.length) {
          console.log(`🚨 [Sidebar] Filtered out ${results.length - uniqueResults.length} duplicates from search results`);
        }
        
        setSearchResults(uniqueResults);
        console.log('📤 [Sidebar] searchResults state set to:', uniqueResults);
      } catch (error) {
        console.error('❌ [Sidebar] Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    } else {
      console.log('🚫 [Sidebar] Search query too short, clearing results');
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    const name = target.alt || 'User';
    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  };

  const formatLastMessage = (item: SearchResultItem | ChatItem): string => {
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

  const handleSelectItem = (item: SearchResultItem | ChatItem) => {
    console.log('👆 [Sidebar] handleSelectItem called');
    console.log('   Selected item:', item);
    console.log('   Selected item ID:', item._id);
    console.log('   Selected item name:', item.fullName || item.username);
    console.log('   Current searchQuery:', searchQuery);
    console.log('   Is search active:', isSearchActive);
    
    // If it's a SearchResultItem, we need to convert it to ChatItem format
    if (isSearchResultItem(item)) {
      console.log('   🔍 [Sidebar] Item is from search results');
      const formattedLastMessage = formatLastMessage(item);
      
      const chatItem: ChatItem = {
        _id: item._id,
        username: item.username,
        fullName: item.fullName ,
        profilePic: item.profilePic,
        lastMessage: formattedLastMessage,
        lastMessageTime: item.lastMessageTime,
        unreadCount: item.unreadCount || 0,
        isOnline: item.isOnline,
        lastMessageSenderId: item.lastMessageSenderId,
        tickStatus: item.tickStatus || 'none',
        lastMessageMedia: item.lastMessageMedia,
      };
      
      console.log('👤 [Sidebar] Selected search result:', chatItem);
      onSelectUser(chatItem);
    } else {
      console.log('   👥 [Sidebar] Item is from regular users');
      // It's already a ChatItem
      onSelectUser(item);
    }
  };

  const isSearchResultItem = (item: SearchResultItem | ChatItem): item is SearchResultItem => {
    return 'type' in item || 'memberCount' in item || 'admin' in item;
  };

  const clearSearch = () => {
    console.log('🗑️ [Sidebar] clearSearch called');
    console.log('   Before clear - searchQuery:', searchQuery);
    console.log('   Before clear - searchResults:', searchResults);
    console.log('   Before clear - users prop:', users);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    console.log('   After clear - searchQuery should be empty');
  };

  const renderItem = (item: SearchResultItem | ChatItem, index: number) => {
    const isSelected = selectedId === item._id;
    const isLastMessageFromCurrentUser = item.lastMessageSenderId === currentUserId;
    const formattedLastMessage = formatLastMessage(item);
    const isSearchItem = isSearchResultItem(item);
    
    console.log(`🎨 [Sidebar] renderItem #${index}: ${item._id} - ${item.fullName || item.username} (selected: ${isSelected})`);
    
    return (
      <div
        key={`${item._id}-${index}`} // Added index to ensure unique keys
        onClick={() => handleSelectItem(item)}
        className={`${styles.chatItem} ${isSelected ? styles.chatItemSelected : styles.chatItemHover}`}
      >
        {isSelected && <div className={styles.activeBar} />}

        <div className={styles.avatarWrapper}>
          <img
            src={item.profilePic || `https://ui-avatars.com/api/?name=${item.username}&background=random`}
            alt={item.username  || 'User'}
            className={styles.avatar}
            onError={handleImageError}
          />
          {item.isOnline && (
            <div className={styles.onlineBadge} title="Online" />
          )}
        </div>

        <div className={styles.itemContent}>
          <div className={styles.itemHeader}>
            <h4 className={`${styles.itemName} ${isSelected && styles.itemNameSelected}`}>
              {item.fullName || item.username}
              {isSearchItem && item.type === 'group' && (
                <span className={styles.groupBadge}>Group</span>
              )}
            </h4>
            {item.lastMessageTime && (
              <span className={`${styles.itemTime} ${isSelected && styles.itemTimeSelected}`}>
                {formatRelativeTime(item.lastMessageTime)}
              </span>
            )}
          </div>

          <div className={styles.itemFooter}>
            <div className={styles.lastMessageContainer}>
              <p className={`${styles.lastMessage} ${isSelected && styles.lastMessageSelected}`}>
                {formattedLastMessage}
              </p>
              
              {isLastMessageFromCurrentUser && item.tickStatus && item.tickStatus !== 'none' && (
                <span className={`${styles.tickContainer} ${isSelected && styles.tickContainerSelected}`}>
                  {item.tickStatus === 'sent' && (
                    <span className={`${styles.tick} ${styles.tickSent}`}>✓</span>
                  )}
                  
                  {item.tickStatus === 'delivered' && (
                    <>
                      <span className={`${styles.tick} ${styles.tickDelivered}`}>✓</span>
                      <span className={`${styles.tick} ${styles.tickDelivered}`}>✓</span>
                    </>
                  )}
                  
                  {item.tickStatus === 'read' && (
                    <>
                      <span className={`${styles.tick} ${styles.tickRead}`}>✓</span>
                      <span className={`${styles.tick} ${styles.tickRead}`}>✓</span>
                    </>
                  )}
                </span>
              )}
            </div>
            
            <div className={styles.footerRight}>
              {item.unreadCount > 0 && (
                <span className={styles.unreadBadge}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  console.log('🔄 [Sidebar] Component render');
  console.log('🔍 [Sidebar] Current state:');
  console.log('   searchQuery:', searchQuery);
  console.log('   searchResults:', searchResults);
  console.log('   users prop (first 3):', users.slice(0, 3));
  console.log('   displayItems (first 3):', displayItems.slice(0, 3));

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
            placeholder="Search users or groups"
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