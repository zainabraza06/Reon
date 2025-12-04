import React, { useState } from 'react';
import { User, Group, Message } from '@/types';
import { Search, Users } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import UserProfile from '@/components/chat/UserProfile';
import styles from './SideBar.module.css';

// Define a unified type for search results
type SearchResultItem = {
  _id: string;
  type: 'user' | 'group';
  name: string;
  profilePic?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isOnline?: boolean;
  // Additional user fields
  username?: string;
  fullName?: string;
  // Additional group fields
  memberCount?: number;
  admin?: string;
};

interface SidebarProps {
  users: (User | Group)[];
  currentUserId: string;
  selectedId?: string;
  onSelectUser: (user: User) => void;
  onSelectGroup: (group: Group) => void;
  onSearch: (query: string) => Promise<SearchResultItem[]>; // Updated to unified type
  currentUser: User;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  users, 
  currentUserId, 
  selectedId, 
  onSelectUser, 
  onSelectGroup,
  onSearch,
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // UserProfile menu state
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    
    if (q.length > 1) {
      setIsSearching(true);
      try {
        const results = await onSearch(q);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      }
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  const isGroup = (item: User | Group | SearchResultItem): item is Group | (SearchResultItem & { type: 'group' }) => {
    if ('type' in item) {
      return item.type === 'group';
    }
    return 'members' in item;
  };

  const getDisplayData = (item: User | Group | SearchResultItem) => {
    if ('type' in item && item.type === 'group') {
      // Search result group
      const group = item as SearchResultItem;
      return {
        id: group._id,
        name: group.name,
        avatar: group.profilePic || `https://ui-avatars.com/api/?name=${group.name}&background=random`,
        lastMessage: group.lastMessage || 'No messages yet',
        time: group.lastMessageTime,
        unread: group.unreadCount || 0,
        isOnline: false,
        isGroup: true,
        memberCount: group.memberCount || 0
      };
    } else if ('type' in item && item.type === 'user') {
      // Search result user
      const user = item as SearchResultItem;
      return {
        id: user._id,
        name: user.fullName || user.name || user.username || 'User',
        avatar: user.profilePic || `https://ui-avatars.com/api/?name=${user.name || user.username}&background=random`,
        lastMessage: user.lastMessage || 'Start a conversation',
        time: user.lastMessageTime,
        unread: user.unreadCount || 0,
        isOnline: user.isOnline,
        isGroup: false,
        username: user.username
      };
    } else if ('members' in item) {
      // Regular Group from users prop
      const group = item as Group;
      let lastMsgContent = 'No messages yet';
      let lastMsgTime: string | undefined;

      if (typeof group.lastMessage === 'string') {
        lastMsgContent = group.lastMessage;
      } else if (group.lastMessage && typeof group.lastMessage === 'object') {
        const message = group.lastMessage as Message;
        lastMsgContent = message.text || message.ciphertext || 'Encrypted message';
        lastMsgTime = message.sentAt;
      }

      const unreadCount = group.metadata?.unreadCount || 0;

      return {
        id: group._id,
        name: group.name,
        avatar: group.profilePic || `https://ui-avatars.com/api/?name=${group.name}&background=random`,
        lastMessage: lastMsgContent,
        time: lastMsgTime || group.lastActivity?.toString() || group.updatedAt?.toString(),
        unread: unreadCount,
        isOnline: false,
        isGroup: true,
        memberCount: group.members?.length || group.metadata?.memberCount || 0
      };
    } else {
      // Regular User from users prop
      const user = item as User;
      return {
        id: user._id,
        name: user.fullName || user.username,
        avatar: user.profilePic || `https://ui-avatars.com/api/?name=${user.username}&background=random`,
        lastMessage: user.lastMessage || 'Start a conversation',
        time: user.lastMessageTime,
        unread: user.unreadCount || 0,
        isOnline: user.isOnline,
        isGroup: false,
        username: user.username
      };
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    const name = target.alt || 'User';
    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  };

  const handleSelectSearchResult = (item: SearchResultItem) => {
    if (item.type === 'user') {
      // Convert SearchResultItem to User for onSelectUser
      const user: User = {
        _id: item._id,
        username: item.username || item.name.split(' ').join('').toLowerCase(),
        profilePic: item.profilePic,
        isOnline: item.isOnline,
        lastSeen: undefined,
        fullName: item.fullName || item.name,
        unreadCount: item.unreadCount,
        lastMessage: item.lastMessage,
        lastMessageTime: item.lastMessageTime,
        isOnboarded: undefined,
        pendingFriendRequests: undefined,
        location: undefined,
        bio: undefined,
        friends: undefined,
        chats: undefined
      };
      onSelectUser(user);
    } else {
      // Convert SearchResultItem to Group for onSelectGroup
      const group: Group = {
        _id: item._id,
        name: item.name,
        profilePic: item.profilePic,
        admin: item.admin || '',
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: item.lastMessageTime || undefined,
        lastMessage: item.lastMessage ? {
          _id: 'temp-search-' + item._id,
          sender: '',
          receiver: item._id,
          ciphertext: item.lastMessage,
          text: item.lastMessage,
          type: 'text',
          sentAt: item.lastMessageTime || new Date().toISOString(),
          delivered: false,
          read: false
        } as Message : undefined,
        settings: {
          allowInvites: true,
          adminOnlyMessages: false,
          membersCanAddMembers: true,
          approvalRequired: false
        },
        metadata: {
          memberCount: item.memberCount || 0,
          unreadCount: item.unreadCount,
          isMuted: false,
          isPinned: false
        }
      };
      onSelectGroup(group);
    }
    
    setSearchQuery('');
    setIsSearching(false);
  };

  return (
    <div className={styles.container}>
      {/* Header with UserProfile */}
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
            placeholder="Search users or groups..." 
            value={searchQuery}
            onChange={handleSearch}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* List */}
      <div className={`${styles.listContainer} custom-scrollbar`}>
        {/* Global Search Results */}
        {isSearching && searchResults.length > 0 && (
          <div className={styles.searchResults}>
            <h3 className={styles.searchResultsTitle}>Search Results</h3>
            {searchResults.map(item => {
              const data = getDisplayData(item);
              
              return (
                <div 
                  key={item._id}
                  onClick={() => handleSelectSearchResult(item)}
                  className={styles.searchResultItem}
                >
                  {item.profilePic ? (
                    <img 
                      src={item.profilePic} 
                      alt={data.name}
                      className={styles.searchResultAvatar}
                      onError={handleImageError}
                    />
                  ) : (
                    <div className={`${styles.searchResultAvatar} ${styles.avatarGradient}`}>
                      {data.name.charAt(0)}
                    </div>
                  )}
                  
                  <div className={styles.searchResultInfo}>
                    <div className={styles.searchResultHeader}>
                      <p className={styles.searchResultName}>
                        {data.name}
                        {item.type === 'group' && (
                          <span className={styles.searchResultType}>Group</span>
                        )}
                      </p>
                      {data.unread > 0 && (
                        <span className={styles.searchResultUnread}>
                          {data.unread > 99 ? '99+' : data.unread}
                        </span>
                      )}
                    </div>
                    
                    <p className={styles.searchResultSubtitle}>
                      {item.type === 'user' ? (
                        <>
                          {data.isOnline ? (
                            <span className={styles.onlineStatus}>🟢 Online</span>
                          ) : (
                            <span className={styles.offlineStatus}>⚫ Offline</span>
                          )}
                          {item.username && <span> • @{item.username}</span>}
                        </>
                      ) : (
                        <>
                          <span className={styles.groupInfo}>
                            👥 {item.memberCount || 0} members
                          </span>
                          {data.lastMessage && <span> • {data.lastMessage}</span>}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Chat List (regular users/groups) */}
        {!isSearching && users.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <Users className={styles.emptyStateIconSvg} size={24} />
            </div>
            <p className={styles.emptyStateText}>No chats yet</p>
            <p className={styles.emptyStateSubtext}>Start a conversation with friends</p>
          </div>
        ) : !isSearching && users.length > 0 ? (
          users.map((item) => {
            const data = getDisplayData(item);
            const isSelected = selectedId === data.id;

            return (
              <div 
                key={data.id}
                onClick={() => isGroup(item) ? onSelectGroup(item as Group) : onSelectUser(item as User)}
                className={`${styles.chatItem} ${
                  isSelected ? styles.chatItemSelected : styles.chatItemHover
                }`}
              >
                {isSelected && <div className={styles.activeBar} />}

                <div className={styles.avatarWrapper}>
                  {data.isGroup ? (
                    <div className={styles.groupAvatarWrapper}>
                      <img 
                        src={data.avatar} 
                        alt={data.name}
                        className={styles.avatar}
                        onError={handleImageError}
                      />
                      <div className={styles.groupBadge}>
                        <Users size={10} className={styles.groupBadgeIcon} />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.userAvatarWrapper}>
                      <img 
                        src={data.avatar} 
                        alt={data.name}
                        className={styles.avatar}
                        onError={handleImageError}
                      />
                      {data.isOnline && <div className={styles.onlineBadge} />}
                    </div>
                  )}
                </div>

                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <h4 className={`${styles.itemName} ${
                      isSelected && styles.itemNameSelected
                    }`}>
                      {data.name}
                      {data.isGroup && (item as Group).metadata?.isPinned && (
                        <span className={styles.pinnedIcon} title="Pinned">📍</span>
                      )}
                      {data.isGroup && (item as Group).metadata?.isMuted && (
                        <span className={styles.mutedIcon} title="Muted">🔇</span>
                      )}
                    </h4>
                    {data.time && (
                      <span className={`${styles.itemTime} ${
                        isSelected && styles.itemTimeSelected
                      }`}>
                        {formatRelativeTime(data.time)}
                      </span>
                    )}
                  </div>
                  <div className={styles.itemFooter}>
                    <p className={`${styles.lastMessage} ${
                      isSelected && styles.lastMessageSelected
                    }`}>
                      {data.lastMessage}
                    </p>
                    {data.unread > 0 && (
                      <span className={styles.unreadBadge}>
                        {data.unread > 99 ? '99+' : data.unread}
                      </span>
                    )}
                  </div>
                  {data.isGroup && data.memberCount && (
                    <p className={styles.memberCount}>
                      {data.memberCount} members
                    </p>
                  )}
                </div>
              </div>
            );
          })
        ) : null}

        {/* Search empty state */}
        {isSearching && searchResults.length === 0 && (
          <div className={styles.noResults}>
            <Search className={styles.noResultsIcon} size={24} />
            <p className={styles.noResultsText}>
              No results found for &quot;{searchQuery}&quot;
            </p>
          </div>
        )}
      </div>

      {/* User status indicator */}
      <div className={styles.statusBar}>
        <div className={styles.statusInfo}>
          <div className={styles.statusIndicator}>
            <div className={styles.statusDot}></div>
            <span className={styles.statusText}>Connected</span>
          </div>
          <span className={styles.chatCount}>
            {users.length} {users.length === 1 ? 'chat' : 'chats'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;