'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './OnboardPage.module.css';
import { useRouter } from 'next/navigation';
import { AxiosError } from "axios";
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface FlashMessage {
  type: 'success' | 'error';
  message: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step and loading states
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form and validation states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    nativeLanguage: '',
    location: '',
    bio: '',
    profilePic: null as File | null
  });

  const languages = [
    'English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese',
    'Korean', 'Hindi', 'Arabic', 'Portuguese', 'Russian', 'Italian'
  ];

  // Refs for ARIA-invalid
  const usernameRef = useRef<HTMLInputElement>(null);
  const languageRef = useRef<HTMLSelectElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  // Apply aria-invalid dynamically
  useEffect(() => {
    if (usernameRef.current) {
      usernameRef.current.setAttribute(
        'aria-invalid',
        errors.username ? 'true' : 'false'
      );
    }
    if (languageRef.current) {
      languageRef.current.setAttribute(
        'aria-invalid',
        errors.nativeLanguage ? 'true' : 'false'
      );
    }
    if (locationRef.current) {
      locationRef.current.setAttribute(
        'aria-invalid',
        errors.location ? 'true' : 'false'
      );
    }
    if (bioRef.current) {
      bioRef.current.setAttribute(
        'aria-invalid',
        errors.bio ? 'true' : 'false'
      );
    }
  }, [errors.username, errors.nativeLanguage, errors.location, errors.bio]);

  // Auto-hide flash messages
  useEffect(() => {
    if (flashMessage) {
      const timer = setTimeout(() => {
        setFlashMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [flashMessage]);

  const showFlashMessage = (type: 'success' | 'error', message: string) => {
    setFlashMessage({ type, message });
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (step === 2) {
      if (!formData.username.trim()) {
        newErrors.username = 'Username is required';
      } else if (formData.username.length < 3) {
        newErrors.username = 'Username must be at least 3 characters';
      } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
        newErrors.username = 'Username can only contain letters, numbers, and underscores';
      }
      if (!formData.nativeLanguage) {
        newErrors.nativeLanguage = 'Please select your native language';
      }
    }
    
    if (step === 3) {
      if (!formData.location.trim()) {
        newErrors.location = 'Location is required';
      }
      if (!formData.bio.trim()) {
        newErrors.bio = 'Bio is required';
      } else if (formData.bio.length > 250) {
        newErrors.bio = 'Bio must be less than 250 characters';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, profilePic: 'Please select an image file' }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, profilePic: 'Image must be smaller than 5MB' }));
      return;
    }

    setFormData(prev => ({ ...prev, profilePic: file }));
    setErrors(prev => ({ ...prev, profilePic: '' }));

    const reader = new FileReader();
    reader.onload = (e) => setPreviewImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < 4) {
      if (currentStep === 2 && !validateStep(2)) return;
      if (currentStep === 3 && !validateStep(3)) return;
      setCurrentStep(prev => prev + 1);
      return;
    }

    if (!validateStep(4)) return;

    setIsLoading(true);
    setFlashMessage(null);

    try {
      const submitData = new FormData();
      submitData.append('username', formData.username);
      submitData.append('nativeLanguage', formData.nativeLanguage);
      submitData.append('location', formData.location);
      submitData.append('bio', formData.bio);
      if (formData.profilePic) submitData.append('profilePic', formData.profilePic);

      const response = await api.post("/auth/onboard", submitData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const data = response.data;

      showFlashMessage('success', data.message || 'Onboarding completed successfully!');
      
      // Refresh user data in AuthContext to update isOnboarded flag
      await refreshUser();
      
      // Redirect after user data is refreshed
      setTimeout(() => router.push('/recommendations'), 1500);

    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const message =
          err.response?.data?.message ||
          err.response?.data?.error ||
          "Onboarding failed. Please try again.";

        // Show backend error in flash message
        showFlashMessage("error", message);

        // If it's a username error, also set the field error and go to step 2
        if (message.toLowerCase().includes("username") || err.response?.data?.field === 'username') {
          setCurrentStep(2);
          setErrors((prev) => ({ ...prev, username: message }));
        }

        // Handle other field-specific errors from backend
        if (err.response?.data?.field) {
          const field = err.response.data.field;
          setErrors((prev) => ({ ...prev, [field]: message }));
          
          // Navigate to the appropriate step based on the field
          if (field === 'username' || field === 'nativeLanguage') {
            setCurrentStep(2);
          } else if (field === 'location' || field === 'bio' || field === 'profilePic') {
            setCurrentStep(3);
          }
        }

        return;
      }

      // Fallback for non-Axios errors
      showFlashMessage("error", "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  // Particles effect
  useEffect(() => {
    const createParticles = () => {
      const particlesContainer = document.getElementById('particles');
      if (!particlesContainer) return;
      particlesContainer.innerHTML = '';
      for (let i = 0; i < 25; i++) {
        const particle = document.createElement('div');
        particle.className = styles.particle;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particlesContainer.appendChild(particle);
      }
    };
    createParticles();
  }, []);

  return (
    <div className={styles.fullPage}>
      <div className={`${styles.blob} ${styles.blobPurple}`}></div>
      <div className={`${styles.blob} ${styles.blobBlue}`}></div>
      <div className={`${styles.blob} ${styles.blobTeal}`}></div>
      <div className={styles.particlesContainer} id="particles"></div>

      {flashMessage && (
        <div className={`${styles.flashMessage} ${styles[flashMessage.type]}`}>
          <div className={styles.flashContent}>
            <span className={styles.flashIcon}>{flashMessage.type === 'success' ? '✅' : '❌'}</span>
            <span>{flashMessage.message}</span>
            <button 
              className={styles.flashClose} 
              onClick={() => setFlashMessage(null)} 
              aria-label="Close message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* Progress Header */}
        <div className={styles.progressHeader}>
          <div className={styles.brand}>
            <div className={styles.logo} aria-hidden="true">R</div>
            <h1 className={styles.brandText}>Reon Messaging</h1>
          </div>
          <div className={styles.progressWrapper}>
            <div
              className={styles.progressBar}
              role="progressbar"
              aria-label="Onboarding progress"
              {...({
                'aria-valuemin': 1,
                'aria-valuemax': 4,
                'aria-valuenow': currentStep
              } as React.AriaAttributes)}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${(currentStep / 4) * 100}%` }}
              ></div>
            </div>
            <div className={styles.stepIndicator}>Step {currentStep} of 4</div>
          </div>
        </div>

        {/* Main Content */}
        <div className={styles.mainContent}>
          <div className={styles.formSection}>
            <form className={styles.glassForm} onSubmit={handleSubmit} noValidate>
              {/* Step 2: Basic Info */}
              {currentStep === 2 && (
                <div className={styles.step} data-step="2">
                  <div className={styles.stepHeader}>
                    <h2>Basic Information</h2>
                    <p>Tell us a bit about yourself</p>
                  </div>

                  {/* Username */}
                  <div className={styles.formGroup}>
                    <label htmlFor="usernameInput" className={styles.inputLabel}>Username *</label>
                    <input
                      type="text"
                      id="usernameInput"
                      ref={usernameRef}
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      placeholder="Enter your username (e.g., john_doe123)"
                      className={`${styles.glassInput} ${errors.username ? styles.inputError : ''}`}
                      required
                      aria-describedby="usernameHint usernameError"
                      title="Enter your username"
                    />
                    {errors.username && (
                      <div id="usernameError" className={styles.errorMessage} role="alert">
                        {errors.username}
                      </div>
                    )}
                    <p className={styles.inputHint} id="usernameHint">
                      Choose a unique username (3-20 characters, letters, numbers, and underscores only)
                    </p>
                  </div>

                  {/* Native Language */}
                  <div className={styles.formGroup}>
                    <label htmlFor="languageSelect" className={styles.inputLabel}>Native Language *</label>
                    <div className={styles.selectGlassWrapper}>
                      <select
                        id="languageSelect"
                        ref={languageRef}
                        value={formData.nativeLanguage}
                        onChange={(e) => handleInputChange('nativeLanguage', e.target.value)}
                        className={`${styles.selectGlass} ${errors.nativeLanguage ? styles.inputError : ''}`}
                        required
                        aria-describedby="languageError"
                        title="Select your native language"
                      >
                        <option value="">Select your native language</option>
                        {languages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </div>
                    {errors.nativeLanguage && (
                      <div id="languageError" className={styles.errorMessage} role="alert">
                        {errors.nativeLanguage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Profile Details */}
              {currentStep === 3 && (
                <div className={styles.step} data-step="3">
                  <div className={styles.stepHeader}>
                    <h2>Profile Details</h2>
                    <p>Tell us a bit more about yourself</p>
                  </div>

                  {/* Location */}
                  <div className={styles.formGroup}>
                    <label htmlFor="locationInput" className={styles.inputLabel}>Location *</label>
                    <input
                      type="text"
                      id="locationInput"
                      ref={locationRef}
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      placeholder="Your city, country..."
                      className={`${styles.glassInput} ${errors.location ? styles.inputError : ''}`}
                      required
                      aria-describedby="locationError"
                    />
                    {errors.location && (
                      <div id="locationError" className={styles.errorMessage} role="alert">
                        {errors.location}
                      </div>
                    )}
                  </div>

                  {/* Bio */}
                  <div className={styles.formGroup}>
                    <label htmlFor="bioInput" className={styles.inputLabel}>Bio *</label>
                    <textarea
                      id="bioInput"
                      ref={bioRef}
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      placeholder="A short bio about yourself..."
                      className={`${styles.glassInput} ${styles.textarea} ${errors.bio ? styles.inputError : ''}`}
                      required
                      maxLength={250}
                      aria-describedby="bioHint bioError"
                    />
                    <div className={styles.charCount}>
                      {formData.bio.length}/250
                      {errors.bio && (
                        <span id="bioError" className={styles.errorMessage} role="alert">
                          {errors.bio}
                        </span>
                      )}
                    </div>
                    <p className={styles.inputHint} id="bioHint">
                      Tell us about yourself in 250 characters or less
                    </p>
                  </div>

                  {/* Profile Picture */}
                  <div className={styles.avatarSection}>
                    <div className={styles.avatarUpload} onClick={triggerFileInput}>
                      {previewImage ? (
                        <img src={previewImage} alt="Profile Preview" className={styles.avatarPreview} />
                      ) : (
                        <div className={styles.avatarPlaceholder}>
                          <span className={styles.uploadIcon}>📷</span>
                          <div className={styles.uploadHint}>Click to upload</div>
                        </div>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className={styles.fileInput}
                        onChange={handleFileChange}
                        aria-label="Upload profile picture"
                      />
                    </div>
                    {errors.profilePic && (
                      <div className={styles.errorMessage} role="alert">{errors.profilePic}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Review & Confirm */}
              {currentStep === 4 && (
                <div className={styles.step} data-step="4">
                  <div className={styles.stepHeader}>
                    <h2>Review Your Profile</h2>
                    <p>Check everything looks correct before completing setup</p>
                  </div>

                  <div className={styles.previewSection}>
                    <div className={styles.previewCard}>
                      <div className={styles.profilePreview}>
                        <div className={styles.previewAvatar}>
                          {previewImage ? (
                            <img src={previewImage} alt="Profile Preview" />
                          ) : (
                            <span className={styles.defaultAvatar}>👤</span>
                          )}
                        </div>
                      </div>

                      <div className={styles.previewInfo}>
                        <h4>{formData.username || "Your Username"}</h4>
                        {formData.nativeLanguage && <p>Native Language: {formData.nativeLanguage}</p>}
                        {formData.location && <p>Location: {formData.location}</p>}
                        {formData.bio && <p className={styles.previewBio}>{formData.bio}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className={styles.buttonGroup}>
                {currentStep > 1 && (
                  <button type="button" onClick={() => setCurrentStep(prev => prev - 1)} className={styles.btnSecondary} disabled={isLoading} title="Go back to previous step">Back</button>
                )}
                <button type="submit" className={`${styles.btnPrimary} ${isLoading ? styles.loading : ''}`} disabled={isLoading} aria-label={currentStep === 4 ? 'Complete onboarding' : 'Continue to next step'} title={currentStep === 4 ? 'Complete your onboarding' : 'Continue to next step'}>
                  {isLoading ? 'Setting Up...' : currentStep === 4 ? 'Complete Setup' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}