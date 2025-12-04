'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiArrowLeft,
  FiUsers,
  FiX,
  FiSearch,
  FiCheck,
  FiImage,
  FiUpload,
  FiUser
} from 'react-icons/fi';
import { api } from '@/lib/api';
import { useNotification } from '@/context/NotificationContext';
import UserProfile from '@/components/chat/UserProfile';
import { User } from '@/types';
import { socketService } from '@/lib/socket';
import styles from './CreateGroupPage.module.css';
import Image from 'next/image';

interface Friend {
  _id: string;
  fullName: string;
  username: string;
  profilePic: string;
  location: string;
  nativeLanguage: string;
}

interface FriendsResponse {
  page: number;
  limit: number;
  total: number;
  friends: Friend[];
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

interface Group {
  _id: string;
  name: string;
  profilePic?: string;
}

export default function CreateGroupPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupProfilePic, setGroupProfilePic] = useState<File | null>(null);
  const [groupProfilePicPreview, setGroupProfilePicPreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [existingGroupNames, setExistingGroupNames] = useState<string[]>([]);
  
  // UserProfile states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load current user data and connect socket
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        let user: User;

        if (userData) {
          user = JSON.parse(userData);
          setCurrentUser(user);
        } else {
          const response = await api.get<User>('/users/me');
          user = response.data;
          setCurrentUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        }

        // Connect socket with current user
        if (user._id && user._id !== 'default') {
          setTimeout(() => {
            socketService.connect(user._id);
          }, 1000);
        }
      } catch (error) {
        console.error('Error loading current user:', error);
        const defaultUser = {
          _id: 'default',
          username: 'user',
          profilePic: '',
          fullName: 'User',
          unreadCount: 0
        };
        setCurrentUser(defaultUser);
      }
    };

    loadCurrentUser();
  }, []);

  // Load friends
  const loadFriends = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get<FriendsResponse>('/users/friends');
      const data = response.data;
      setFriends(data.friends);
    } catch (error: unknown) {
      console.error('Error loading friends:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to load friends'
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  // Load existing group names
  const loadExistingGroupNames = async () => {
    try {
      const response = await api.get<Group[]>('/groups/my-groups');
      const groupNames = response.data.map(group => group.name.toLowerCase());
      setExistingGroupNames(groupNames);
    } catch (error) {
      console.error('Error loading existing groups:', error);
    }
  };

  // Initial load
  useEffect(() => {
    loadFriends();
    loadExistingGroupNames();
  }, [loadFriends]);

  // Filter friends based on search
  const filteredFriends = friends.filter(friend => 
    friend.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle friend selection
  const toggleFriendSelection = (friend: Friend) => {
    setSelectedFriends(prev => {
      const isSelected = prev.some(f => f._id === friend._id);
      if (isSelected) {
        return prev.filter(f => f._id !== friend._id);
      } else {
        return [...prev, friend];
      }
    });
  };

  // Remove selected friend
  const removeSelectedFriend = (friendId: string) => {
    setSelectedFriends(prev => prev.filter(f => f._id !== friendId));
  };

  // Handle profile picture upload
  const handleProfilePicUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        addNotification({
          type: 'error',
          title: 'Invalid File',
          message: 'Please select an image file (JPEG, PNG, etc.)'
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        addNotification({
          type: 'error',
          title: 'File Too Large',
          message: 'Please select an image smaller than 5MB'
        });
        return;
      }

      setGroupProfilePic(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setGroupProfilePicPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove profile picture
  const removeProfilePic = () => {
    setGroupProfilePic(null);
    setGroupProfilePicPreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Check if group name is valid
  const isGroupNameValid = () => {
    const trimmedName = groupName.trim();
    return trimmedName.length >= 2 && trimmedName.length <= 50 && 
           !existingGroupNames.includes(trimmedName.toLowerCase());
  };

  // Create group
  const handleCreateGroup = async () => {
    if (!isGroupNameValid() || selectedFriends.length === 0) return;

    try {
      setIsCreating(true);
      
      const memberIds = selectedFriends.map(friend => friend._id);
      
      // Create form data to handle file upload
      const formData = new FormData();
      formData.append('name', groupName.trim());
      formData.append('members', JSON.stringify(memberIds));
      if (groupProfilePic) {
        formData.append('profilePic', groupProfilePic);
      }

      const response = await api.post('/groups/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      addNotification({
        type: 'success',
        title: 'Success',
        message: `Group "${groupName}" created successfully!`
      });

      // Redirect to chat with the new group
      router.push(`/chat?group=${response.data._id}`);
    } catch (error: unknown) {
      console.error('Error creating group:', error);
      const apiError = error as ApiError;
      addNotification({
        type: 'error',
        title: 'Error',
        message: apiError.response?.data?.message || 'Failed to create group'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  // Generate group avatar preview based on selected members
  const getGroupAvatarPreview = () => {
    if (groupProfilePicPreview) return groupProfilePicPreview;
    
    // Show first few members' avatars as preview
    const previewMembers = selectedFriends.slice(0, 4);
    if (previewMembers.length === 0) return null;
    
    return (
      <div className={styles.groupAvatarPreview}>
        {previewMembers.map((member, index) => (
          <div key={member._id} className={styles.miniAvatar} style={{
            position: 'absolute',
            top: index < 2 ? '5%' : '55%',
            left: index % 2 === 0 ? '5%' : '55%',
            width: '40%',
            height: '40%'
          }}>
            {member.profilePic ? (
              <Image
                src={member.profilePic}
                alt={member.fullName}
                width={40}
                height={40}
                className={styles.miniAvatarImage}
              />
            ) : (
              <div className={styles.miniDefaultAvatar}>
                {member.fullName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.fullPage}>
      {/* Background elements */}
      <div className={`${styles.blob} ${styles.blobPurple}`}></div>
      <div className={`${styles.blob} ${styles.blobBlue}`}></div>
      <div className={`${styles.blob} ${styles.blobTeal}`}></div>
      
      {/* Floating particles */}
      <div className={styles.particlesContainer} id="particles"></div>

      <div className={styles.container}>
        {/* Header with UserProfile */}
        <div className={styles.headerWithProfile}>
          <div className={styles.headerMain}>
            <button 
              className={styles.backButton}
              onClick={() => router.back()}
              aria-label="Go back"
            >
              <FiArrowLeft />
            </button>
            
            <div className={styles.headerContent}>
              <h1 className={styles.title}>Create Group</h1>
              <p className={styles.subtitle}>
                Create a new group chat with your friends
              </p>
            </div>
          </div>

          {/* Integrated UserProfile */}
          <div className={styles.userProfileSection}>
            <UserProfile
              currentUser={currentUser || { 
                _id: 'default',
                username: 'user',
                profilePic: '',
                fullName: 'User',
                unreadCount: 0,
                isOnboarded: true
              }}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
            />
          </div>
        </div>

        {/* Group Creation Form */}
        <div className={styles.creationSection}>
          {/* Group Name Input */}
          <div className={styles.groupNameSection}>
            <label className={styles.inputLabel}>Group Name</label>
            <input
              type="text"
              placeholder="Enter group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={styles.groupNameInput}
              maxLength={50}
            />
            <div className={styles.inputHelp}>
              {groupName.trim() && (
                <>
                  {existingGroupNames.includes(groupName.trim().toLowerCase()) ? (
                    <span className={styles.errorText}>Group name already exists</span>
                  ) : (
                    <span className={styles.successText}>Group name available</span>
                  )}
                </>
              )}
              <span className={styles.charCount}>
                {groupName.length}/50
              </span>
            </div>
          </div>

          {/* Group Profile Picture */}
          <div className={styles.profilePicSection}>
            <label className={styles.inputLabel}>Group Profile Picture (Optional)</label>
            <div className={styles.profilePicContainer}>
              <div className={styles.profilePicPreview}>
                {groupProfilePicPreview ? (
                  <>
                    <Image
                      src={groupProfilePicPreview}
                      alt="Group profile preview"
                      width={120}
                      height={120}
                      className={styles.profilePicImage}
                    />
                    <button
                      className={styles.removeProfilePic}
                      onClick={removeProfilePic}
                      aria-label="Remove profile picture"
                    >
                      <FiX />
                    </button>
                  </>
                ) : selectedFriends.length > 0 ? (
                  <div className={styles.groupAvatarPreviewContainer}>
                    {getGroupAvatarPreview()}
                    <div className={styles.memberCount}>
                      <FiUsers />
                      {selectedFriends.length + 1}
                    </div>
                  </div>
                ) : (
                  <div className={styles.profilePicPlaceholder}>
                    <FiImage className={styles.placeholderIcon} />
                    <span>No image selected</span>
                  </div>
                )}
              </div>
              
              <div className={styles.uploadButtons}>
                <button
                  className={styles.uploadButton}
                  onClick={triggerFileInput}
                  type="button"
                >
                  <FiUpload />
                  {groupProfilePicPreview ? 'Change Image' : 'Upload Image'}
                </button>
                
                {selectedFriends.length > 0 && !groupProfilePicPreview && (
                  <div className={styles.autoGenerateNote}>
                    Group avatar will be auto-generated from members
                  </div>
                )}
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePicUpload}
                className={styles.fileInput}
                aria-label='file'
              />
            </div>
            <p className={styles.uploadHelp}>
              Recommended: Square image, max 5MB
            </p>
          </div>

          {/* Selected Friends */}
          {selectedFriends.length > 0 && (
            <div className={styles.selectedSection}>
              <label className={styles.inputLabel}>
                Selected Friends ({selectedFriends.length})
                <span className={styles.totalMembers}>
                  • Total members: {selectedFriends.length + 1} (including you)
                </span>
              </label>
              <div className={styles.selectedFriends}>
                {selectedFriends.map(friend => (
                  <div key={friend._id} className={styles.selectedFriend}>
                    <div className={styles.selectedAvatar}>
                      {friend.profilePic ? (
                        <Image
                          src={friend.profilePic}
                          alt={friend.fullName}
                          width={32}
                          height={32}
                          className={styles.avatarImage}
                        />
                      ) : (
                        <div className={styles.selectedDefaultAvatar}>
                          {friend.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className={styles.selectedName}>{friend.fullName}</span>
                    <button
                      className={styles.removeSelected}
                      onClick={() => removeSelectedFriend(friend._id)}
                      aria-label='remove'
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Friends */}
          <div className={styles.searchSection}>
            <div className={styles.searchWrapper}>
              <div className={styles.searchIconContainer}>
                <FiSearch className={styles.searchIcon} />
              </div>
              <input
                type="text"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
              {searchQuery && (
                <button 
                  className={styles.clearSearch}
                  onClick={clearSearch}
                  title="Clear search"
                >
                  <FiX />
                </button>
              )}
            </div>
          </div>

          {/* Friends List */}
          <div className={styles.friendsSection}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner}></div>
                <p>Loading your friends...</p>
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className={styles.emptyState}>
                <FiUsers className={styles.emptyIcon} />
                <h3>No friends found</h3>
                <p>
                  {searchQuery 
                    ? `No friends match "${searchQuery}"`
                    : "You haven't added any friends yet."
                  }
                </p>
              </div>
            ) : (
              <div className={styles.friendsGrid}>
                {filteredFriends.map(friend => {
                  const isSelected = selectedFriends.some(f => f._id === friend._id);
                  return (
                    <div 
                      key={friend._id} 
                      className={`${styles.friendCard} ${isSelected ? styles.selected : ''}`}
                      onClick={() => toggleFriendSelection(friend)}
                    >
                      <div className={styles.cardHeader}>
                        <div className={styles.userAvatar}>
                          {friend.profilePic ? (
                            <Image
                              src={friend.profilePic}
                              alt={friend.fullName}
                              width={50}
                              height={50}
                              className={styles.avatarImage}
                            />
                          ) : (
                            <div className={styles.defaultAvatar}>
                              {friend.fullName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isSelected && (
                            <div className={styles.selectedIndicator}>
                              <FiCheck />
                            </div>
                          )}
                        </div>
                        
                        <div className={styles.userInfo}>
                          <h3 className={styles.userName}>{friend.fullName}</h3>
                          <p className={styles.username}>@{friend.username}</p>
                          
                          <div className={styles.userDetails}>
                            {friend.location && (
                              <div className={styles.detailItem}>
                                <span>{friend.location}</span>
                              </div>
                            )}
                            {friend.nativeLanguage && (
                              <div className={styles.detailItem}>
                                <span>{friend.nativeLanguage}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create Button */}
          <div className={styles.createSection}>
            <button
              className={styles.createButton}
              onClick={handleCreateGroup}
              disabled={!isGroupNameValid() || selectedFriends.length === 0 || isCreating}
            >
              {isCreating ? (
                <>
                  <div className={styles.buttonSpinner}></div>
                  Creating Group...
                </>
              ) : (
                <>
                  <FiUsers />
                  Create Group ({selectedFriends.length + 1} members)
                </>
              )}
            </button>
            
            {(!isGroupNameValid() || selectedFriends.length === 0) && (
              <div className={styles.requirements}>
                {!isGroupNameValid() && (
                  <p>Group name must be 2-50 characters and unique</p>
                )}
                {selectedFriends.length === 0 && (
                  <p>Select at least one friend to create a group</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}