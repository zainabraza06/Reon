'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from "axios";
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface FlashMessage {
  type: 'success' | 'error';
  message: string;
}

const glassInput = "w-full py-[0.8rem] px-4 rounded-2xl border border-white/20 bg-white/10 text-white text-[0.8rem] transition-all outline-none placeholder:text-white/50 focus:border-blue-500/60 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)] focus:bg-white/[0.12]";
const glassInputError = "border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]";

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
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

  const usernameRef = useRef<HTMLInputElement>(null);
  const languageRef = useRef<HTMLSelectElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (usernameRef.current) usernameRef.current.setAttribute('aria-invalid', errors.username ? 'true' : 'false');
    if (languageRef.current) languageRef.current.setAttribute('aria-invalid', errors.nativeLanguage ? 'true' : 'false');
    if (locationRef.current) locationRef.current.setAttribute('aria-invalid', errors.location ? 'true' : 'false');
    if (bioRef.current) bioRef.current.setAttribute('aria-invalid', errors.bio ? 'true' : 'false');
  }, [errors.username, errors.nativeLanguage, errors.location, errors.bio]);

  useEffect(() => {
    if (flashMessage) {
      const timer = setTimeout(() => setFlashMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [flashMessage]);

  useEffect(() => {
    const createParticles = () => {
      const particlesContainer = document.getElementById('particles');
      if (!particlesContainer) return;
      particlesContainer.innerHTML = '';
      for (let i = 0; i < 25; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particlesContainer.appendChild(particle);
      }
    };
    createParticles();
  }, []);

  const showFlashMessage = (type: 'success' | 'error', message: string) => setFlashMessage({ type, message });

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (step === 2) {
      if (!formData.username.trim()) newErrors.username = 'Username is required';
      else if (formData.username.length < 3) newErrors.username = 'Username must be at least 3 characters';
      else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) newErrors.username = 'Username can only contain letters, numbers, and underscores';
      if (!formData.nativeLanguage) newErrors.nativeLanguage = 'Please select your native language';
    }
    if (step === 3) {
      if (!formData.location.trim()) newErrors.location = 'Location is required';
      if (!formData.bio.trim()) newErrors.bio = 'Bio is required';
      else if (formData.bio.length > 250) newErrors.bio = 'Bio must be less than 250 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErrors(prev => ({ ...prev, profilePic: 'Please select an image file' })); return; }
    if (file.size > 5 * 1024 * 1024) { setErrors(prev => ({ ...prev, profilePic: 'Image must be smaller than 5MB' })); return; }
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
      const response = await api.post("/auth/onboard", submitData, { headers: { "Content-Type": "multipart/form-data" } });
      showFlashMessage('success', response.data.message || 'Onboarding completed successfully!');
      await refreshUser();
      setTimeout(() => router.push('/recommendations'), 1500);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const message = err.response?.data?.message || err.response?.data?.error || "Onboarding failed. Please try again.";
        showFlashMessage("error", message);
        if (message.toLowerCase().includes("username") || err.response?.data?.field === 'username') {
          setCurrentStep(2);
          setErrors(prev => ({ ...prev, username: message }));
        }
        if (err.response?.data?.field) {
          const field = err.response.data.field;
          setErrors(prev => ({ ...prev, [field]: message }));
          if (field === 'username' || field === 'nativeLanguage') setCurrentStep(2);
          else if (field === 'location' || field === 'bio' || field === 'profilePic') setCurrentStep(3);
        }
        return;
      }
      showFlashMessage("error", "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  return (
    <div className="min-h-screen p-4 flex items-start justify-center py-8 relative bg-gradient-to-br from-[#1e1e2f] to-[#111117] overflow-x-hidden text-white sm:items-center">
      {/* Background blobs */}
      <div className="absolute w-[20rem] h-[20rem] rounded-full blur-[80px] opacity-30 animate-pulse-blob bg-[rgba(128,90,213,0.25)] top-[10%] right-[10%]" />
      <div className="absolute w-[20rem] h-[20rem] rounded-full blur-[80px] opacity-30 animate-pulse-blob bg-[rgba(59,130,246,0.25)] bottom-[10%] left-[10%] [animation-delay:2s]" />
      <div className="absolute w-[20rem] h-[20rem] rounded-full blur-[80px] opacity-30 animate-pulse-blob bg-[rgba(45,212,191,0.2)] top-[40%] left-[50%] [animation-delay:4s]" />
      <div className="absolute inset-0 z-0 pointer-events-none hidden sm:block" id="particles" />

      {/* Flash message */}
      {flashMessage && (
        <div className={`fixed top-8 right-8 z-[1000] min-w-[300px] max-w-[500px] rounded-2xl px-6 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl border flex items-center justify-between gap-4 sm:top-4 sm:right-4 sm:left-4 sm:min-w-0 sm:max-w-none ${flashMessage.type === 'success' ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-red-500/15 border-red-500/30 text-red-300'}`}>
          <div className="flex items-center justify-between gap-4 flex-1">
            <span className="text-xl shrink-0">{flashMessage.type === 'success' ? '✅' : '❌'}</span>
            <span className="flex-1">{flashMessage.message}</span>
            <button
              className="bg-transparent border-0 text-inherit text-2xl cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              onClick={() => setFlashMessage(null)}
              aria-label="Close message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-[1400px] z-[2] relative pt-8">
        {/* Progress Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-[45px] h-[45px] bg-gradient-to-br from-blue-500 to-purple-600 rounded-[12px] flex items-center justify-center font-bold text-[15px] text-white">
              R
            </div>
            <h1 className="text-[2rem] font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Reon Messaging
            </h1>
          </div>

          <div className="w-full max-w-[400px] h-[5px] bg-white/10 rounded-[3px] mx-auto mb-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-[3px] transition-[width] duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuemin={1}
              aria-valuemax={4}
              aria-valuenow={currentStep}
            />
          </div>
          <div className="text-white/70 text-[0.7rem] font-medium">Step {currentStep} of 4</div>
        </div>

        {/* Main Content */}
        <div className="flex gap-6 items-start justify-center">
          <div className="flex-1 max-w-[600px]">
            <form
              className="bg-white/[0.08] backdrop-blur-3xl rounded-[2rem] p-4 sm:p-6 border border-white/15 shadow-[0_20px_40px_rgba(0,0,0,0.3)] max-w-[600px] mx-auto"
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Step 2: Basic Info */}
              {currentStep === 2 && (
                <div data-step="2">
                  <div className="text-center mb-8">
                    <h2 className="text-[1.5rem] font-bold mb-[0.7rem] bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                      Basic Information
                    </h2>
                    <p className="text-white/70 text-[1.1rem]">Tell us a bit about yourself</p>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="usernameInput" className="block text-white/90 font-semibold mb-[0.6rem] text-[0.8rem]">
                      Username *
                    </label>
                    <input
                      type="text"
                      id="usernameInput"
                      ref={usernameRef}
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      placeholder="Enter your username (e.g., john_doe123)"
                      className={`${glassInput} ${errors.username ? glassInputError : ''}`}
                      required
                      aria-describedby="usernameHint usernameError"
                      title="Enter your username"
                    />
                    {errors.username && (
                      <span id="usernameError" className="text-red-300 text-[0.8rem] mt-1 block" role="alert">
                        {errors.username}
                      </span>
                    )}
                    <p className="text-white/50 text-[0.85rem] mt-2" id="usernameHint">
                      Choose a unique username (3-20 characters, letters, numbers, and underscores only)
                    </p>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="languageSelect" className="block text-white/90 font-semibold mb-[0.6rem] text-[0.8rem]">
                      Native Language *
                    </label>
                    <div className="relative w-full">
                      <select
                        id="languageSelect"
                        ref={languageRef}
                        value={formData.nativeLanguage}
                        onChange={(e) => handleInputChange('nativeLanguage', e.target.value)}
                        className={`${glassInput} cursor-pointer appearance-none backdrop-blur-3xl ${errors.nativeLanguage ? glassInputError : ''}`}
                        required
                        aria-describedby="languageError"
                        title="Select your native language"
                      >
                        <option value="" style={{ background: 'rgba(30,30,47,0.95)', color: 'white' }}>Select your native language</option>
                        {languages.map(lang => (
                          <option key={lang} value={lang} style={{ background: 'rgba(30,30,47,0.95)', color: 'white' }}>{lang}</option>
                        ))}
                      </select>
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 text-base pointer-events-none">▾</span>
                    </div>
                    {errors.nativeLanguage && (
                      <span id="languageError" className="text-red-300 text-[0.8rem] mt-1 block" role="alert">
                        {errors.nativeLanguage}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Profile Details */}
              {currentStep === 3 && (
                <div data-step="3">
                  <div className="text-center mb-8">
                    <h2 className="text-[1.2rem] font-bold mb-[0.7rem] bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                      Profile Details
                    </h2>
                    <p className="text-white/70 text-[0.8rem]">Tell us a bit more about yourself</p>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="locationInput" className="block text-white/90 font-semibold mb-[0.6rem] text-[0.8rem]">
                      Location *
                    </label>
                    <input
                      type="text"
                      id="locationInput"
                      ref={locationRef}
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      placeholder="Your city, country..."
                      className={`${glassInput} ${errors.location ? glassInputError : ''}`}
                      required
                      aria-describedby="locationError"
                    />
                    {errors.location && (
                      <span id="locationError" className="text-red-300 text-[0.8rem] mt-1 block" role="alert">
                        {errors.location}
                      </span>
                    )}
                  </div>

                  <div className="mb-4">
                    <label htmlFor="bioInput" className="block text-white/90 font-semibold mb-[0.6rem] text-[0.8rem]">
                      Bio *
                    </label>
                    <textarea
                      id="bioInput"
                      ref={bioRef}
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      placeholder="A short bio about yourself..."
                      className={`${glassInput} resize-y min-h-[70px] font-[inherit]`}
                      required
                      maxLength={250}
                      aria-describedby="bioHint bioError"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-white/50 text-[0.7rem]">{formData.bio.length}/250</span>
                      {errors.bio && (
                        <span id="bioError" className="text-red-300 text-[0.8rem]" role="alert">
                          {errors.bio}
                        </span>
                      )}
                    </div>
                    <p className="text-white/50 text-[0.85rem] mt-2" id="bioHint">
                      Tell us about yourself in 250 characters or less
                    </p>
                  </div>

                  {/* Profile Picture */}
                  <div className="text-center">
                    <div
                      className="w-[100px] h-[100px] rounded-full bg-white/10 border-2 border-dashed border-white/30 flex items-center justify-center mx-auto mb-6 cursor-pointer transition-all overflow-hidden hover:border-blue-500/60 hover:bg-white/15"
                      onClick={triggerFileInput}
                    >
                      {previewImage ? (
                        <img src={previewImage} alt="Profile Preview" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <div className="text-center text-white/60">
                          <div className="text-[2rem] mb-2">📷</div>
                          <div className="text-white/50 text-[0.9rem]">Click to upload</div>
                        </div>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                        aria-label="Upload profile picture"
                      />
                    </div>
                    {errors.profilePic && (
                      <div className="text-red-300 text-[0.8rem] mt-1" role="alert">{errors.profilePic}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {currentStep === 4 && (
                <div data-step="4">
                  <div className="text-center mb-8">
                    <h2 className="text-[1.5rem] font-bold mb-[0.7rem] bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                      Review Your Profile
                    </h2>
                    <p className="text-white/70 text-[1.1rem]">Check everything looks correct before completing setup</p>
                  </div>

                  <div className="w-full flex justify-center items-center">
                    <div className="bg-white/[0.08] backdrop-blur-3xl rounded-[2rem] p-8 border border-white/15 shadow-[0_20px_40px_rgba(0,0,0,0.3)] text-center max-w-[400px] w-full mx-auto">
                      <div className="w-[100px] h-[100px] rounded-full bg-white/10 mx-auto mb-6 overflow-hidden flex items-center justify-center border border-white/20">
                        {previewImage ? (
                          <img src={previewImage} alt="Profile Preview" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[2.5rem]">👤</span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xl font-semibold mb-3">{formData.username || "Your Username"}</h4>
                        {formData.nativeLanguage && <p className="text-white/70 mb-1">Native Language: {formData.nativeLanguage}</p>}
                        {formData.location && <p className="text-white/70 mb-1">Location: {formData.location}</p>}
                        {formData.bio && <p className="text-white/70 text-[0.95rem] leading-[1.5] mt-3">{formData.bio}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex flex-col gap-4 mt-6 sm:flex-row sm:justify-between">
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(prev => prev - 1)}
                    className="flex-1 py-[0.7rem] px-2 rounded-2xl bg-white/10 text-white border border-white/20 font-semibold text-[1.1rem] cursor-pointer transition-all hover:bg-white/15 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isLoading}
                    title="Go back to previous step"
                  >
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 py-[0.7rem] px-2 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 font-semibold text-[1.1rem] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  disabled={isLoading}
                  aria-label={currentStep === 4 ? 'Complete onboarding' : 'Continue to next step'}
                  title={currentStep === 4 ? 'Complete your onboarding' : 'Continue to next step'}
                >
                  {isLoading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-transparent border-t-white rounded-full animate-spin-ring inline-block" />
                      Setting Up...
                    </>
                  ) : currentStep === 4 ? 'Complete Setup' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
