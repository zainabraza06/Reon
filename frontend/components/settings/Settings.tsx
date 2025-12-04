'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiUser, 
  FiMail, 
  FiMapPin, 
  FiEdit3, 
  FiLock, 
  FiEye, 
  FiEyeOff,
  FiArrowLeft,
  FiCamera,
  FiCheck,
  FiX,
  FiCheckCircle,
  FiXCircle
} from 'react-icons/fi';
import { api } from '@/lib/api';
import Toast from '@/components/chat/Toast';
import UserProfile from '@/components/chat/UserProfile';
import { User } from '@/types';
import styles from './Settings.module.css';

interface ApiFieldError {
  location: string;
  msg: string;
  path: string;
  type: string;
  value: string;
}

interface ApiError {
  response?: {
    data?: {
      errors?: ApiFieldError[];
      message?: string;
      error?: string;
      // Add other possible error fields
      details?: string;
      msg?: string;
    };
  };
  message?: string;
}

interface ToastState {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface PasswordRequirements {
  hasMinLength: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
  hasDigit: boolean;
  hasSpecialChar: boolean;
}

// Create a type for the form that doesn't require all User properties
interface ProfileFormData {
  fullName: string;
  username: string;
  bio: string;
  location: string;
  profilePic: null | File;
  profilePicUrl: string;
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Profile form state - use the new type
  const [profileForm, setProfileForm] = useState<ProfileFormData>({
    fullName: '',
    username: '',
    bio: '',
    location: '',
    profilePic: null,
    profilePicUrl: ''
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: ''
  });

  // Password requirements state
  const [passwordRequirements, setPasswordRequirements] = useState<PasswordRequirements>({
    hasMinLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasDigit: false,
    hasSpecialChar: false
  });

  // Use ref to track toast IDs and prevent duplicates
  const toastIdsRef = useRef<Set<string>>(new Set());

  // Add useEffect to close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add toast function with duplicate prevention
  const addToast = useCallback((
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string,
    duration: number = 5000
  ) => {
    const toastId = `${type}-${title}-${message}`;
    
    if (toastIdsRef.current.has(toastId)) {
      return;
    }

    toastIdsRef.current.add(toastId);
    
    setToasts(prev => {
      if (prev.some(t => t.title === title && t.message === message)) {
        return prev;
      }
      
      const id = Math.random().toString(36).substring(2, 9);
      return [...prev, { id, type, title, message, duration }];
    });
  }, []);

  // Remove toast function
  const removeToast = useCallback((id: string) => {
    setToasts(prev => {
      const newToasts = prev.filter(toast => toast.id !== id);
      
      // Also clean up the ref
      const removedToast = prev.find(t => t.id === id);
      if (removedToast) {
        const toastId = `${removedToast.type}-${removedToast.title}-${removedToast.message}`;
        toastIdsRef.current.delete(toastId);
      }
      
      return newToasts;
    });
  }, []);

  // Improved error handler function
  const handleApiError = useCallback((error: unknown, defaultMessage: string, context?: string) => {
    console.error(`API Error${context ? ` in ${context}` : ''}:`, error);
    
    const apiError = error as ApiError;
    let errorMessage = defaultMessage;
    
    // Log the full response for debugging
    if (apiError.response?.data) {
      console.log('Full error response:', apiError.response.data);
    }
    
    if (apiError.response?.data) {
      const errorData = apiError.response.data;
      
      // Handle different error response formats
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData.msg) {
        errorMessage = errorData.msg;
      } else if (errorData.details) {
        errorMessage = errorData.details;
      } else if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        // Handle array of field errors - take the first one
        errorMessage = errorData.errors[0].msg || errorData.errors[0].msg || defaultMessage;
      } else if (typeof errorData === 'object') {
        // Try to get first property if it's an object
        const firstKey = Object.keys(errorData)[0];
        if (firstKey) {
          const firstValue = errorData[firstKey as keyof typeof errorData];
          if (Array.isArray(firstValue)) {
            errorMessage = firstValue[0].msg || defaultMessage;
          } else if (typeof firstValue === 'string') {
            errorMessage = firstValue;
          }
        }
      }
    } else if (apiError.message) {
      errorMessage = apiError.message;
    }
    
    addToast('error', 'Error', errorMessage);
  }, [addToast]);

  // Load current user data
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setCurrentUser(parsedUser);
          setProfileForm({
            fullName: parsedUser.fullName || '',
            username: parsedUser.username || '',
            bio: parsedUser.bio || '',
            location: parsedUser.location || '',
            profilePic: null,
            profilePicUrl: parsedUser.profilePic || ''
          });
          
          // Load additional user data like notifications and friend requests
          await loadUserStats(parsedUser._id);
        } else {
          // Fallback: fetch user data from API
          const response = await api.get<User>('/users/me');
          setCurrentUser(response.data);
          setProfileForm({
            fullName: response.data.fullName || '',
            username: response.data.username || '',
            bio: response.data.bio || '',
            location: response.data.location || '',
            profilePic: null,
            profilePicUrl: response.data.profilePic || ''
          });
          await loadUserStats(response.data._id);
        }
      } catch (error) {
        handleApiError(error, 'Failed to load profile data', 'loadCurrentUser');
        // Create a default user object
        setCurrentUser({
          _id: 'default',
          username: 'user',
          profilePic: '',
          fullName: 'User',
          unreadCount: 0,
          isOnboarded: true
        });
      }
    };

    loadCurrentUser();
  }, [addToast, handleApiError]);

  // Load user statistics (notifications, friend requests)
  const loadUserStats = async (userId: string) => {
    try {
      // Load unread notifications count
      const notificationsResponse = await api.get('/notifications/unread-count');
      setUnreadNotifications(notificationsResponse.data.count || 0);

      // Load pending friend requests count
      const friendsResponse = await api.get('/users/friend-request/pending-count');
      setPendingFriendRequests(friendsResponse.data.count || 0);
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  // Check password requirements
  const checkPasswordRequirements = (password: string) => {
    const requirements = {
      hasMinLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasDigit: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
    setPasswordRequirements(requirements);
  };

  // Check if password meets all requirements
  const isPasswordValid = () => {
    return Object.values(passwordRequirements).every(requirement => requirement === true);
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        addToast('error', 'Invalid File', 'Please select an image file');
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        addToast('error', 'File Too Large', 'Please select an image smaller than 5MB');
        return;
      }

      setProfileForm(prev => ({ ...prev, profilePic: file }));
    }
  };

  const removeProfileImage = () => {
    setProfileForm(prev => ({ 
      ...prev, 
      profilePic: null,
      profilePicUrl: '' // Clear the profile picture URL
    }));
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData();
      
      // Only append fields that have values (make fields optional)
      if (profileForm.fullName.trim()) {
        formData.append('fullName', profileForm.fullName.trim());
      }
      if (profileForm.username.trim()) {
        formData.append('username', profileForm.username.trim());
      }
      if (profileForm.bio.trim()) {
        formData.append('bio', profileForm.bio.trim());
      }
      if (profileForm.location.trim()) {
        formData.append('location', profileForm.location.trim());
      }
      
      if (profileForm.profilePic) {
        formData.append('profilePic', profileForm.profilePic);
      }

      console.log('Sending profile update with data:', {
        fullName: profileForm.fullName,
        username: profileForm.username,
        bio: profileForm.bio,
        location: profileForm.location,
        hasProfilePic: !!profileForm.profilePic
      });

      const response = await api.put('/settings/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      addToast('success', 'Profile Updated', 'Your profile has been updated successfully');
      
      // Reload user data to get updated profile information
      const updatedUserResponse = await api.get<User>('/auth/me');
      setCurrentUser(updatedUserResponse.data);
      
      // Update localStorage with new user data
      localStorage.setItem('user', JSON.stringify(updatedUserResponse.data));

    } catch (error: unknown) {
      handleApiError(error, 'Failed to update profile', 'handleProfileUpdate');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isPasswordValid()) {
      addToast('error', 'Invalid Password', 'Please meet all password requirements');
      return;
    }

    setIsLoading(true);

    try {
      await api.put('/settings/change-password', passwordForm);
      
      addToast('success', 'Password Updated', 'Your password has been changed successfully');
      
      // Clear password form
      setPasswordForm({
        currentPassword: '',
        newPassword: ''
      });
      
      // Reset password requirements
      setPasswordRequirements({
        hasMinLength: false,
        hasUpperCase: false,
        hasLowerCase: false,
        hasDigit: false,
        hasSpecialChar: false
      });

    } catch (error: unknown) {
      handleApiError(error, 'Failed to change password', 'handlePasswordChange');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'newPassword') {
      checkPasswordRequirements(value);
    }
    
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  // UserProfile handlers
  const handleUserProfileLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleUserProfileSettings = () => {
    setShowUserMenu(false);
  };

  const handleUserProfileCreateGroup = () => {
    addToast('info', 'Create Group', 'Group creation feature coming soon');
    setShowUserMenu(false);
  };

  const handleUserProfileNotifications = () => {
    router.push('/notifications');
  };

  const handleUserProfileFriendRequests = () => {
    router.push('/friends/requests');
  };

  const handleUserProfileRecommendations = () => {
    router.push('/recommendations');
  };

  const handleUserProfileMessages = () => {
    router.push('/chat');
  };

  const handleUserProfileHome = () => {
    router.push('/');
  };

  // FIXED: Check if profile form has changes - should enable button when any optional field has input
  const hasProfileChanges = () => {
    if (!currentUser) return false;
    
    const hasFormChanges = 
      profileForm.fullName.trim() !== (currentUser.fullName || '') ||
      profileForm.username.trim() !== (currentUser.username || '') ||
      profileForm.bio.trim() !== (currentUser.bio || '') ||
      profileForm.location.trim() !== (currentUser.location || '') ||
      profileForm.profilePic !== null;

    // Also check if any optional field has been filled (even if it's the same as current)
    const hasAnyInput = 
      profileForm.fullName.trim().length > 0 ||
      profileForm.username.trim().length > 0 ||
      profileForm.bio.trim().length > 0 ||
      profileForm.location.trim().length > 0 ||
      profileForm.profilePic !== null;

    return hasFormChanges || hasAnyInput;
  };

  return (
    <div className={styles.fullPage}>
      {/* Toast Container */}
      <div className={styles.toastContainer}>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            type={toast.type}
            title={toast.title}
            message={toast.message}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>

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
              <h1 className={styles.title}>Profile Settings</h1>
              <p className={styles.subtitle}>
                Manage your profile information and security settings
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
              unreadNotifications={unreadNotifications}
              pendingFriendRequests={pendingFriendRequests}
              currentPage="settings"
              onLogout={handleUserProfileLogout}
              onCreateGroup={handleUserProfileCreateGroup}
              onSettings={handleUserProfileSettings}
              onNotificationsClick={handleUserProfileNotifications}
              onFriendRequestsClick={handleUserProfileFriendRequests}
              onRecommendationsClick={handleUserProfileRecommendations}
              onMessagesClick={handleUserProfileMessages}
              onHomeClick={handleUserProfileHome}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabsContainer}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'profile' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <FiUser />
              Profile Information
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'password' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('password')}
            >
              <FiLock />
              Change Password
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {activeTab === 'profile' ? (
            <form onSubmit={handleProfileUpdate} className={styles.form}>
              {/* Profile Picture Section */}
              <div className={styles.profilePictureSection}>
                <div className={styles.profilePictureContainer}>
                  <div className={styles.profilePicture}>
                    {profileForm.profilePic ? (
                      <>
                        <img 
                          src={URL.createObjectURL(profileForm.profilePic)} 
                          alt="Profile preview" 
                          className={styles.profileImage}
                        />
                        <button
                          type="button"
                          className={styles.removeImageButton}
                          onClick={removeProfileImage}
                          title="Remove image"
                        >
                          <FiX />
                        </button>
                      </>
                    ) : profileForm.profilePicUrl ? (
                      <>
                        <img 
                          src={profileForm.profilePicUrl} 
                          alt="Current profile" 
                          className={styles.profileImage}
                        />
                        <button
                          type="button"
                          className={styles.removeImageButton}
                          onClick={removeProfileImage}
                          title="Remove image"
                        >
                          <FiX />
                        </button>
                      </>
                    ) : (
                      <div className={styles.defaultAvatar}>
                        <FiUser className={styles.defaultAvatarIcon} />
                      </div>
                    )}
                  </div>
                  
                  <div className={styles.profilePictureActions}>
                    <input
                      type="file"
                      id="profilePic"
                      accept="image/*"
                      onChange={handleProfileImageChange}
                      className={styles.fileInput}
                    />
                    <label htmlFor="profilePic" className={styles.uploadButton}>
                      <FiCamera />
                      {profileForm.profilePicUrl || profileForm.profilePic ? 'Change Photo' : 'Upload Photo'}
                    </label>
                    <p className={styles.uploadHint}>
                      JPG, PNG or WebP. Max 5MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label htmlFor="fullName" className={styles.label}>
                    Full Name
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    value={profileForm.fullName}
                    onChange={handleProfileInputChange}
                    className={styles.input}
                    placeholder={currentUser?.fullName || "Enter your full name"}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="username" className={styles.label}>
                    Username
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={profileForm.username}
                    onChange={handleProfileInputChange}
                    className={styles.input}
                    placeholder={currentUser?.username || "Enter your username"}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="location" className={styles.label}>
                    <FiMapPin className={styles.labelIcon} />
                    Location
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={profileForm.location}
                    onChange={handleProfileInputChange}
                    className={styles.input}
                    placeholder={currentUser?.location || "Enter your location"}
                  />
                </div>

                <div className={styles.formGroupFull}>
                  <label htmlFor="bio" className={styles.label}>
                    <FiEdit3 className={styles.labelIcon} />
                    Bio
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    value={profileForm.bio}
                    onChange={handleProfileInputChange}
                    className={styles.textarea}
                    placeholder={currentUser?.bio || "Tell us something about yourself..."}
                    rows={4}
                    maxLength={500}
                  />
                  <div className={styles.charCount}>
                    {profileForm.bio.length}/500
                  </div>
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={!hasProfileChanges() || isLoading}
                >
                  {isLoading ? (
                    <div className={styles.loadingSpinner}></div>
                  ) : (
                    <FiCheck />
                  )}
                  {isLoading ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className={styles.form}>
              <div className={styles.passwordForm}>
                <div className={styles.formGroup}>
                  <label htmlFor="currentPassword" className={styles.label}>
                    Current Password *
                  </label>
                  <div className={styles.passwordInputContainer}>
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      id="currentPassword"
                      name="currentPassword"
                      value={passwordForm.currentPassword}
                      onChange={handlePasswordInputChange}
                      className={styles.input}
                      required
                      placeholder="Enter your current password"
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="newPassword" className={styles.label}>
                    New Password *
                  </label>
                  <div className={styles.passwordInputContainer}>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      id="newPassword"
                      name="newPassword"
                      value={passwordForm.newPassword}
                      onChange={handlePasswordInputChange}
                      className={styles.input}
                      required
                      placeholder="Enter your new password"
                      minLength={8}
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  <div className={styles.passwordHint}>
                    Password must be at least 8 characters long and contain uppercase, lowercase, digit, and special character
                  </div>
                </div>

                {/* Password Requirements */}
                <div className={styles.passwordRequirements}>
                  <h4>Password Requirements:</h4>
                  <ul className={styles.requirementsList}>
                    <li className={passwordRequirements.hasMinLength ? styles.requirementMet : styles.requirementNotMet}>
                      {passwordRequirements.hasMinLength ? <FiCheckCircle /> : <FiXCircle />}
                      At least 8 characters long
                    </li>
                    <li className={passwordRequirements.hasUpperCase ? styles.requirementMet : styles.requirementNotMet}>
                      {passwordRequirements.hasUpperCase ? <FiCheckCircle /> : <FiXCircle />}
                      At least one uppercase letter (A-Z)
                    </li>
                    <li className={passwordRequirements.hasLowerCase ? styles.requirementMet : styles.requirementNotMet}>
                      {passwordRequirements.hasLowerCase ? <FiCheckCircle /> : <FiXCircle />}
                      At least one lowercase letter (a-z)
                    </li>
                    <li className={passwordRequirements.hasDigit ? styles.requirementMet : styles.requirementNotMet}>
                      {passwordRequirements.hasDigit ? <FiCheckCircle /> : <FiXCircle />}
                      At least one digit (0-9)
                    </li>
                    <li className={passwordRequirements.hasSpecialChar ? styles.requirementMet : styles.requirementNotMet}>
                      {passwordRequirements.hasSpecialChar ? <FiCheckCircle /> : <FiXCircle />}
                      At least one special character (!@#$%^&* etc.)
                    </li>
                  </ul>
                </div>

                <div className={styles.formActions}>
                  <button
                    type="submit"
                    className={styles.saveButton}
                    disabled={isLoading || !passwordForm.currentPassword || !passwordForm.newPassword || !isPasswordValid()}
                  >
                    {isLoading ? (
                      <div className={styles.loadingSpinner}></div>
                    ) : (
                      <FiCheck />
                    )}
                    {isLoading ? 'Updating...' : 'Change Password'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}