
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUser, FiMapPin, FiEdit3, FiLock, FiEye, FiEyeOff,
  FiArrowLeft, FiCamera, FiCheck, FiX, FiCheckCircle, FiXCircle
} from 'react-icons/fi';
import { api } from '@/lib/api';
import Toast from '@/components/chat/Toast';
import UserProfile from '@/components/chat/UserProfile';
import { User } from '@/types';

interface ApiFieldError { location: string; msg: string; path: string; type: string; value: string; }
interface ApiError {
  response?: { data?: { errors?: ApiFieldError[]; message?: string; error?: string; details?: string; msg?: string; }; };
  message?: string;
}
interface ToastState { id: string; type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string; duration?: number; }
interface PasswordRequirements { hasMinLength: boolean; hasUpperCase: boolean; hasLowerCase: boolean; hasDigit: boolean; hasSpecialChar: boolean; }
interface ProfileFormData { fullName: string; username: string; bio: string; location: string; profilePic: null | File; profilePicUrl: string; }

const fieldInput = "w-full px-4 py-3 bg-white/[0.08] border border-white/15 rounded-[0.75rem] text-white text-base transition-all font-[inherit] outline-none placeholder:text-white/40 focus:border-blue-500/60 focus:bg-white/[0.12] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]";

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

  const [profileForm, setProfileForm] = useState<ProfileFormData>({
    fullName: '', username: '', bio: '', location: '', profilePic: null, profilePicUrl: ''
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordRequirements, setPasswordRequirements] = useState<PasswordRequirements>({
    hasMinLength: false, hasUpperCase: false, hasLowerCase: false, hasDigit: false, hasSpecialChar: false
  });
  const toastIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addToast = useCallback((type: 'success' | 'error' | 'info' | 'warning', title: string, message: string, duration = 5000) => {
    const toastId = `${type}-${title}-${message}`;
    if (toastIdsRef.current.has(toastId)) return;
    toastIdsRef.current.add(toastId);
    setToasts(prev => {
      if (prev.some(t => t.title === title && t.message === message)) return prev;
      const id = Math.random().toString(36).substring(2, 9);
      return [...prev, { id, type, title, message, duration }];
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => {
      const newToasts = prev.filter(toast => toast.id !== id);
      const removedToast = prev.find(t => t.id === id);
      if (removedToast) toastIdsRef.current.delete(`${removedToast.type}-${removedToast.title}-${removedToast.message}`);
      return newToasts;
    });
  }, []);

  const handleApiError = useCallback((error: unknown, defaultMessage: string) => {
    const apiError = error as ApiError;
    let errorMessage = defaultMessage;
    if (apiError.response?.data) {
      const d = apiError.response.data;
      if (typeof d === 'string') errorMessage = d;
      else if (d.message) errorMessage = d.message;
      else if (d.error) errorMessage = d.error;
      else if (d.msg) errorMessage = d.msg;
      else if (d.details) errorMessage = d.details;
      else if (Array.isArray(d.errors) && d.errors.length > 0) errorMessage = d.errors[0].msg || defaultMessage;
    } else if (apiError.message) {
      errorMessage = apiError.message;
    }
    addToast('error', 'Error', errorMessage);
  }, [addToast]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setCurrentUser(parsedUser);
          setProfileForm({ fullName: parsedUser.fullName || '', username: parsedUser.username || '', bio: parsedUser.bio || '', location: parsedUser.location || '', profilePic: null, profilePicUrl: parsedUser.profilePic || '' });
          await loadUserStats(parsedUser._id);
        } else {
          const response = await api.get<User>('/users/me');
          setCurrentUser(response.data);
          setProfileForm({ fullName: response.data.fullName || '', username: response.data.username || '', bio: response.data.bio || '', location: response.data.location || '', profilePic: null, profilePicUrl: response.data.profilePic || '' });
          await loadUserStats(response.data._id);
        }
      } catch (error) {
        handleApiError(error, 'Failed to load profile data');
        setCurrentUser({ _id: 'default', username: 'user', profilePic: '', fullName: 'User', unreadCount: 0, isOnboarded: true });
      }
    };
    loadCurrentUser();
  }, [addToast, handleApiError]);

  const loadUserStats = async (userId: string) => {
    try {
      const [notifRes, friendsRes] = await Promise.all([
        api.get('/notifications/unread-count'),
        api.get('/users/friend-request/pending-count')
      ]);
      setUnreadNotifications(notifRes.data.count || 0);
      setPendingFriendRequests(friendsRes.data.count || 0);
    } catch { /* silent */ }
  };

  const checkPasswordRequirements = (password: string) => {
    setPasswordRequirements({
      hasMinLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasDigit: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    });
  };

  const isPasswordValid = () => Object.values(passwordRequirements).every(r => r === true);

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { addToast('error', 'Invalid File', 'Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { addToast('error', 'File Too Large', 'Please select an image smaller than 5MB'); return; }
    setProfileForm(prev => ({ ...prev, profilePic: file }));
  };

  const removeProfileImage = () => setProfileForm(prev => ({ ...prev, profilePic: null, profilePicUrl: '' }));

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new FormData();
      if (profileForm.fullName.trim()) formData.append('fullName', profileForm.fullName.trim());
      if (profileForm.username.trim()) formData.append('username', profileForm.username.trim());
      if (profileForm.bio.trim()) formData.append('bio', profileForm.bio.trim());
      if (profileForm.location.trim()) formData.append('location', profileForm.location.trim());
      if (profileForm.profilePic) formData.append('profilePic', profileForm.profilePic);
      await api.put('/settings/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast('success', 'Profile Updated', 'Your profile has been updated successfully');
      const updatedUserResponse = await api.get<User>('/auth/me');
      setCurrentUser(updatedUserResponse.data);
      localStorage.setItem('user', JSON.stringify(updatedUserResponse.data));
    } catch (error: unknown) {
      handleApiError(error, 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid()) { addToast('error', 'Invalid Password', 'Please meet all password requirements'); return; }
    setIsLoading(true);
    try {
      await api.put('/settings/change-password', passwordForm);
      addToast('success', 'Password Updated', 'Your password has been changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setPasswordRequirements({ hasMinLength: false, hasUpperCase: false, hasLowerCase: false, hasDigit: false, hasSpecialChar: false });
    } catch (error: unknown) {
      handleApiError(error, 'Failed to change password');
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
    if (name === 'newPassword') checkPasswordRequirements(value);
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  const hasProfileChanges = () => {
    if (!currentUser) return false;
    return (
      profileForm.fullName.trim() !== (currentUser.fullName || '') ||
      profileForm.username.trim() !== (currentUser.username || '') ||
      profileForm.bio.trim() !== (currentUser.bio || '') ||
      profileForm.location.trim() !== (currentUser.location || '') ||
      profileForm.profilePic !== null ||
      profileForm.fullName.trim().length > 0 ||
      profileForm.username.trim().length > 0 ||
      profileForm.bio.trim().length > 0 ||
      profileForm.location.trim().length > 0
    );
  };

  const defaultUser = { _id: 'default', username: 'user', profilePic: '', fullName: 'User', unreadCount: 0, isOnboarded: true };
  const reqItem = (met: boolean, label: string) => (
    <li className={`flex items-center gap-2 text-sm ${met ? 'text-emerald-400' : 'text-white/40'}`}>
      {met ? <FiCheckCircle size={14} /> : <FiXCircle size={14} />}
      {label}
    </li>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e1e2f] to-[#111117] relative overflow-x-hidden text-white">
      {/* Toast container */}
      <div className="fixed top-5 right-5 z-[1000] flex flex-col gap-2.5">
        {toasts.map(toast => (
          <Toast key={toast.id} type={toast.type} title={toast.title} message={toast.message} duration={toast.duration} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      {/* Background blobs */}
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(128,90,213,0.3)] -top-32 -right-32 pointer-events-none" />
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(59,130,246,0.3)] -bottom-32 -left-32 [animation-delay:2s] pointer-events-none" />
      <div className="fixed w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(45,212,191,0.25)] top-1/2 left-[60%] [animation-delay:4s] pointer-events-none" />

      <div className="relative z-[1] max-w-[800px] mx-auto p-8 sm:p-4">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8 sm:flex-col sm:mb-6">
          <div className="flex items-start gap-4 flex-1">
            <button
              className="bg-white/10 border border-white/20 text-white/80 rounded-[0.75rem] p-3 cursor-pointer transition-all flex items-center justify-center hover:bg-white/15 hover:-translate-x-0.5 shrink-0"
              onClick={() => router.back()}
              aria-label="Go back"
            >
              <FiArrowLeft size={20} />
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent leading-tight sm:text-4xl">
                Profile Settings
              </h1>
              <p className="text-white/70 text-xl sm:text-base">Manage your profile information and security settings</p>
            </div>
          </div>
          <div className="shrink-0 sm:self-end" ref={userMenuRef}>
            <UserProfile
              currentUser={currentUser || defaultUser}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
              pendingFriendRequests={pendingFriendRequests}
              currentPage="settings"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-white/5 border border-white/10 rounded-2xl p-2 backdrop-blur-xl">
            {(['profile', 'password'] as const).map(tab => {
              const Icon = tab === 'profile' ? FiUser : FiLock;
              return (
                <button
                  key={tab}
                  className={`flex items-center gap-2 px-6 py-3 rounded-[0.75rem] text-base font-semibold cursor-pointer transition-all border-0 font-[inherit] ${
                    activeTab === tab ? 'text-white bg-blue-500/20 border border-blue-500/30' : 'text-white/60 bg-transparent hover:text-white/80 hover:bg-white/5'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  <Icon size={18} />
                  {tab === 'profile' ? 'Profile Information' : 'Change Password'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl sm:p-4">
          {activeTab === 'profile' ? (
            <form onSubmit={handleProfileUpdate} className="w-full">
              {/* Profile picture */}
              <div className="flex justify-center mb-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-[120px] h-[120px] rounded-full bg-white/10 border-[3px] border-white/20 overflow-hidden">
                    {profileForm.profilePic ? (
                      <>
                        <img src={URL.createObjectURL(profileForm.profilePic)} alt="Profile preview" className="w-full h-full object-cover" />
                        <button type="button" onClick={removeProfileImage} title="Remove image"
                          className="absolute top-[5px] right-[5px] bg-red-500/90 border-0 rounded-full w-7 h-7 flex items-center justify-center text-white cursor-pointer transition-all hover:bg-red-500 hover:scale-110">
                          <FiX size={14} />
                        </button>
                      </>
                    ) : profileForm.profilePicUrl ? (
                      <>
                        <img src={profileForm.profilePicUrl} alt="Current profile" className="w-full h-full object-cover" />
                        <button type="button" onClick={removeProfileImage} title="Remove image"
                          className="absolute top-[5px] right-[5px] bg-red-500/90 border-0 rounded-full w-7 h-7 flex items-center justify-center text-white cursor-pointer transition-all hover:bg-red-500 hover:scale-110">
                          <FiX size={14} />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
                        <FiUser size={48} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <input type="file" id="profilePic" accept="image/*" onChange={handleProfileImageChange} className="hidden" />
                    <label htmlFor="profilePic" className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-[0.75rem] cursor-pointer text-sm font-semibold transition-all hover:bg-blue-500/30 hover:-translate-y-0.5">
                      <FiCamera size={14} />
                      {profileForm.profilePicUrl || profileForm.profilePic ? 'Change Photo' : 'Upload Photo'}
                    </label>
                    <p className="text-white/50 text-[0.8rem] text-center">JPG, PNG or WebP. Max 5MB.</p>
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-6 mb-8 sm:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <label htmlFor="fullName" className="flex items-center gap-2 text-white/90 text-[0.9rem] font-semibold">
                    Full Name <span className="text-white/40 font-normal text-sm">(optional)</span>
                  </label>
                  <input type="text" id="fullName" name="fullName" value={profileForm.fullName} onChange={handleProfileInputChange} className={fieldInput} placeholder={currentUser?.fullName || "Enter your full name"} />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="username" className="flex items-center gap-2 text-white/90 text-[0.9rem] font-semibold">
                    Username <span className="text-white/40 font-normal text-sm">(optional)</span>
                  </label>
                  <input type="text" id="username" name="username" value={profileForm.username} onChange={handleProfileInputChange} className={fieldInput} placeholder={currentUser?.username || "Enter your username"} />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="location" className="flex items-center gap-2 text-white/90 text-[0.9rem] font-semibold">
                    <FiMapPin size={16} className="text-white/60" />
                    Location <span className="text-white/40 font-normal text-sm">(optional)</span>
                  </label>
                  <input type="text" id="location" name="location" value={profileForm.location} onChange={handleProfileInputChange} className={fieldInput} placeholder={currentUser?.location || "Enter your location"} />
                </div>
                <div className="flex flex-col gap-2 col-span-2 sm:col-span-1">
                  <label htmlFor="bio" className="flex items-center gap-2 text-white/90 text-[0.9rem] font-semibold">
                    <FiEdit3 size={16} className="text-white/60" />
                    Bio <span className="text-white/40 font-normal text-sm">(optional)</span>
                  </label>
                  <textarea id="bio" name="bio" value={profileForm.bio} onChange={handleProfileInputChange}
                    className={`${fieldInput} resize-y min-h-[100px]`}
                    placeholder={currentUser?.bio || "Tell us something about yourself..."} rows={4} maxLength={500} />
                  <div className="text-right text-white/50 text-[0.8rem]">{profileForm.bio.length}/500</div>
                </div>
              </div>

              <div className="flex justify-center mt-8">
                <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-green-500/20 text-green-300 border border-green-500/30 rounded-[0.75rem] text-base font-semibold cursor-pointer transition-all font-[inherit] hover:bg-green-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0" disabled={!hasProfileChanges() || isLoading}>
                  {isLoading ? <div className="w-4 h-4 border-2 border-transparent border-l-green-300 rounded-full animate-spin-ring" /> : <FiCheck size={16} />}
                  {isLoading ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className="w-full">
              <div className="max-w-[500px] mx-auto flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="currentPassword" className="text-white/90 text-[0.9rem] font-semibold">Current Password *</label>
                  <div className="relative flex items-center">
                    <input type={showCurrentPassword ? 'text' : 'password'} id="currentPassword" name="currentPassword" value={passwordForm.currentPassword} onChange={handlePasswordInputChange} className={`${fieldInput} pr-12`} required placeholder="Enter your current password" />
                    <button type="button" className="absolute right-4 text-white/50 hover:text-white/80 transition-colors cursor-pointer bg-transparent border-0 p-1 rounded" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="newPassword" className="text-white/90 text-[0.9rem] font-semibold">New Password *</label>
                  <div className="relative flex items-center">
                    <input type={showNewPassword ? 'text' : 'password'} id="newPassword" name="newPassword" value={passwordForm.newPassword} onChange={handlePasswordInputChange} className={`${fieldInput} pr-12`} required placeholder="Enter your new password" minLength={8} />
                    <button type="button" className="absolute right-4 text-white/50 hover:text-white/80 transition-colors cursor-pointer bg-transparent border-0 p-1 rounded" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                    </button>
                  </div>
                  <p className="text-white/50 text-[0.8rem] mt-1">Password must be at least 8 characters long and contain uppercase, lowercase, digit, and special character</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-[0.75rem] p-4">
                  <h4 className="text-white text-[0.9rem] font-semibold mb-3">Password Requirements:</h4>
                  <ul className="flex flex-col gap-2 list-none p-0 m-0">
                    {reqItem(passwordRequirements.hasMinLength, 'At least 8 characters long')}
                    {reqItem(passwordRequirements.hasUpperCase, 'At least one uppercase letter (A-Z)')}
                    {reqItem(passwordRequirements.hasLowerCase, 'At least one lowercase letter (a-z)')}
                    {reqItem(passwordRequirements.hasDigit, 'At least one digit (0-9)')}
                    {reqItem(passwordRequirements.hasSpecialChar, 'At least one special character (!@#$%^&* etc.)')}
                  </ul>
                </div>

                <div className="flex justify-center mt-4">
                  <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-green-500/20 text-green-300 border border-green-500/30 rounded-[0.75rem] text-base font-semibold cursor-pointer transition-all font-[inherit] hover:bg-green-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed" disabled={isLoading || !passwordForm.currentPassword || !passwordForm.newPassword || !isPasswordValid()}>
                    {isLoading ? <div className="w-4 h-4 border-2 border-transparent border-l-green-300 rounded-full animate-spin-ring" /> : <FiCheck size={16} />}
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
