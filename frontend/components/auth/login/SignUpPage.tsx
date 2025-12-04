// SignupPage.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import styles from './SignUpPage.module.css'; 
import { ChatMessage, FlashMessage } from '@/types';
import { api } from '@/lib/api'; 

// Define proper error types
interface ApiError {
  response?: {
    data?: {
      message?: string;
      error?: string;
    };
    status?: number;
  };
  message?: string;
}

export default function SignupPage() {
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  // Demo chat messages for signup page
  const messages: ChatMessage[] = [
    { text: "Welcome to the team! 🎉", type: "other", time: "10:05 AM" },
    { text: "Thanks! Excited to be here!", type: "user", time: "10:06 AM", status: "read" },
    { text: "Don't forget to join #general", type: "other", time: "10:07 AM" },
    { text: "Just uploaded my profile pic", type: "user", time: "10:08 AM", status: "read" },
    { text: "Looking great! Welcome aboard!", type: "other", time: "10:09 AM" },
  ];

  // Flash message display
  const showFlash = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    setFlashMessage({ message, type });
    setTimeout(() => setFlashMessage(null), 5000);
  };

  useEffect(() => {
    let idx = 0;
    const typeNext = () => {
      if (idx >= messages.length) {
        setTimeout(() => {
          setChatMessages([]);
          idx = 0;
          typeNext();
        }, 3000);
        return;
      }

      const msg = messages[idx];
      setChatMessages(prev => [...prev, { ...msg, typing: true, currentText: '', visible: false }]);

      let char = 0;
      const typeChar = () => {
        if (char < msg.text.length) {
          setChatMessages(prev =>
            prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, currentText: msg.text.slice(0, char + 1) } : m
            )
          );
          char++;
          setTimeout(typeChar, 35);
        } else {
          setChatMessages(prev =>
            prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, typing: false, visible: true } : m
            )
          );
          idx++;
          setTimeout(typeNext, 800);
        }
      };
      typeChar();
    };
    typeNext();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Particles effect
  useEffect(() => {
    const createParticles = () => {
      const particlesContainer = document.getElementById('particles');
      if (!particlesContainer) return;

      particlesContainer.innerHTML = '';
      const particleCount = 25;
      
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = styles.particle;
        
        const left = Math.random() * 100;
        const delay = Math.random() * 15;
        
        particle.style.left = `${left}%`;
        particle.style.animationDelay = `${delay}s`;
        
        particlesContainer.appendChild(particle);
      }
    };

    createParticles();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setIsLoading(true);

  // Store the form element reference before the async operation
  const formElement = e.currentTarget;
  const formData = new FormData(formElement);
  const fullName = formData.get('fullName') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  // Password match check
  if (password !== confirmPassword) {
    showFlash('Passwords do not match', 'error');
    setIsLoading(false);
    return;
  }

  // Password strength validation
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=~`[\]{}|\\:;"'<>,.?/]).{8,}$/;
  if (!passwordRegex.test(password)) {
    showFlash(
      'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      'error'
    );
    setIsLoading(false);
    return;
  }

  try {
    const response = await api.post('/auth/signup', { fullName, email, password });

    // Handle both message and success cases from backend
    const successMessage = response.data.message || 'Verification email sent! Please check your inbox.';
    showFlash(successMessage, 'success');
    
    // Reset the form using the stored reference
    if (formElement) {
      formElement.reset();
    }
    
  } catch (err: unknown) {
    console.error('Signup error:', err);
    
    let errorMessage = 'Signup failed. Please try again.';
    
    // Enhanced error handling for different backend response formats
    if (err && typeof err === 'object' && 'response' in err) {
      const apiError = err as ApiError;
      
      // Check for different possible response formats
      if (apiError.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      } else if (apiError.message) {
        errorMessage = apiError.message;
      }
      
      // Handle specific HTTP status codes
      if (apiError.response?.status === 400) {
        errorMessage = apiError.response.data?.message || 'Invalid request data';
      } else if (apiError.response?.status === 500) {
        errorMessage = apiError.response.data?.error || 'Server error. Please try again later.';
      }
    } else if (typeof err === 'string') {
      errorMessage = err;
    }
    
    showFlash(errorMessage, 'error');
  } finally {
    setIsLoading(false);
  }
};

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5001/api/auth/google';
  };

  // Close flash message manually
  const closeFlash = () => {
    setFlashMessage(null);
  };

  return (
    <>
      <div className={styles.fullPage}>
        {/* Flash Message */}
        {flashMessage && (
          <div className={`${styles.flashMessage} ${styles[flashMessage.type]}`}>
            <div className={styles.flashContent}>
              {flashMessage.type === 'success' && (
                <div className={styles.flashIcon}>✓</div>
              )}
              {flashMessage.type === 'error' && (
                <div className={styles.flashIcon}>✕</div>
              )}
              {flashMessage.type === 'info' && (
                <div className={styles.flashIcon}>ℹ</div>
              )}
              <span className={styles.flashText}>{flashMessage.message}</span>
            </div>
            <button 
              onClick={closeFlash}
              className={styles.flashClose}
              aria-label="Close message"
            >
              ×
            </button>
          </div>
        )}

        {/* Background blobs */}
        <div className={`${styles.blob} ${styles.blobPurple}`}></div>
        <div className={`${styles.blob} ${styles.blobBlue}`}></div>
        <div className={`${styles.blob} ${styles.blobTeal}`}></div>

        {/* Floating particles */}
        <div className={styles.particlesContainer} id="particles"></div>

        <div className={styles.main}>
          {/* LEFT: Wider Signup form */}
          <div className={styles.formSection}>
            <div className={styles.brand}>
              <div className={styles.logo}>R</div>
              <div className={styles.brandText}>Reon Messaging</div>
            </div>

            <div className={styles.glassForm}>
              <div className={styles.formHeader}>
                <h1 className={styles.title}>Create Account</h1>
                <p className={styles.subtitle}>Join Reon Messaging and start collaborating</p>
              </div>

              <form className={styles.formBox} onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    name="fullName"
                    placeholder="John Doe" 
                    required 
                    className={styles.glassInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Email address</label>
                  <input 
                    type="email" 
                    name="email"
                    placeholder="you@example.com" 
                    required 
                    className={styles.glassInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Password</label>
                  <div className={styles.passwordWrapper}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      name="password"
                      placeholder="••••••••" 
                      required 
                      className={styles.glassInput}
                      minLength={8}
                    />
                    <button 
                      type="button" 
                      className={styles.passwordToggle}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Confirm Password</label>
                  <div className={styles.passwordWrapper}>
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      name="confirmPassword"
                      placeholder="••••••••" 
                      required 
                      className={styles.glassInput}
                    />
                    <button 
                      type="button" 
                      className={styles.passwordToggle}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className={styles.formOptions}>
                  <label className={styles.rememberMe}>
                    <input type="checkbox" required />
                    I agree to the Terms and Privacy Policy
                  </label>
                </div>

                <button 
                  type="submit" 
                  className={`${styles.btnPrimary} ${isLoading ? styles.loading : ''}`}
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </button>

                <div className={styles.divider}>
                  <span>Or continue with</span>
                </div>

                <button 
                  type="button" 
                  className={styles.btnGoogle}
                  onClick={handleGoogleLogin}
                >
                  <svg className={styles.googleIcon} viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign up with Google
                </button>

                <div className={styles.altText}>
                  <span>Already have an account?</span>
                  <a href="/auth/login">Sign In</a>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT: Chat demo */}
          <div className={styles.chatContainer}>
            <div className={styles.chatBox} ref={chatBoxRef}>
              <div className={styles.chatTitle}>
                <div className={styles.statusDot}></div>
                Team Welcome Chat
              </div>

              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`${styles.chatMessage} ${styles[message.type]} ${message.visible ? styles.show : ''}`}
                >
                  <div className={styles.messageContent}>
                    {message.currentText || message.text}
                  </div>
                  <div className={styles.messageStatus}>
                    <span>{message.time}</span>
                    {message.status && <span>✓✓</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <footer className={styles.footer}>
        <div className={styles.footerInfo}>
          <span>Enterprise-grade security</span>
          <div className={styles.dot}></div>
          <span>99.9% Uptime</span>
          <div className={styles.dot}></div>
          <span>24/7 Support</span>
        </div>
        <p>© 2024 Reon Messaging. All rights reserved.</p>
      </footer>
    </>
  );
}