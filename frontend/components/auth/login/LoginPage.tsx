'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './LoginPage.module.css';
import { ChatMessage, FlashMessage } from '@/types';
import { useAuth } from '@/context/AuthContext';
import {api} from '@/lib/api';

// Define proper error types
interface ApiError extends Error {
  response?: {
    data?: {
      message?: string;
    };
  };
}

interface AuthError extends Error {
  message: string;
}

export default function LoginPage() {
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);
  const [animationCycle, setAnimationCycle] = useState(0); // Track animation cycles

  const { login } = useAuth();

  // Demo chat messages
  const messages: ChatMessage[] = [
    { text: "Hey team, ready for the client call?", type: "other", time: "10:05 AM" },
    { text: "Yep, final docs uploaded.", type: "user", time: "10:06 AM", status: "read" },
    { text: "Perfect, starting in 20 mins.", type: "other", time: "10:07 AM" },
    { text: "Don't forget the Q3 report!", type: "user", time: "10:08 AM", status: "read" },
    { text: "Already shared with everyone", type: "other", time: "10:09 AM" },
  ];

  // Flash message display function
  const showFlash = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    setFlashMessage({ message, type });
    // Auto hide after 5 seconds
    setTimeout(() => {
      setFlashMessage(null);
    }, 5000);
  };

  // Chat animation effect - restarts when animationCycle changes
  useEffect(() => {
    let idx = 0;

    const typeNextMessage = () => {
      if (idx >= messages.length) {
        // Animation completed, wait a bit and restart
        setTimeout(() => {
          setAnimationCycle(prev => prev + 1);
        }, 3000); // Wait 3 seconds before restarting
        return;
      }

      const msg = messages[idx];

      // Add new message with typing state
      setChatMessages(prev => [
        ...prev,
        { ...msg, typing: true, currentText: '' }
      ]);

      let char = 0;

      const typeChar = () => {
        if (char < msg.text.length) {
          setChatMessages(prev =>
            prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, currentText: msg.text.slice(0, char + 1) }
                : m
            )
          );
          char++;
          setTimeout(typeChar, 35);
        } else {
          // Mark typing finished
          setChatMessages(prev =>
            prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, typing: false } : m
            )
          );

          idx++;
          setTimeout(typeNextMessage, 800);
        }
      };

      typeChar();
    };

    // Clear previous messages and start new animation
    setChatMessages([]);
    typeNextMessage();
  }, [animationCycle]); // Re-run when animationCycle changes

  // Particles effect
  useEffect(() => {
    const createParticles = () => {
      const container = document.getElementById('particles');
      if (!container) return;

      container.innerHTML = '';
      const particleCount = 25;

      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = styles.particle;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        container.appendChild(particle);
      }
    };

    createParticles();
  }, []);

  // Handle forgot password
  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    
    // If email field is empty, show error
    if (!email) {
      showFlash('Please enter your email address first', 'error');
      return;
    }

    setIsForgotPasswordLoading(true);

    try {
      const response = await api.post('/auth/forgot-password', { email });
      
      if (response.status === 200) {
        showFlash('Password reset link sent to your email! Check your inbox.', 'success');
      } else {
        showFlash(response.data?.message || 'Failed to send reset email', 'error');
      }
    } catch (err: unknown) {
      console.error('Forgot password error:', err);
      
      let errorMessage = 'Failed to send reset email';
      
      if (err && typeof err === 'object' && 'response' in err) {
        const apiError = err as ApiError;
        errorMessage = apiError.response?.data?.message || errorMessage;
      } else if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      showFlash(errorMessage, 'error');
    }

    setIsForgotPasswordLoading(false);
  };

  // Handle login submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!email || !password) {
      showFlash('Please fill in all fields', 'error');
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      showFlash('Login successful! Redirecting...', 'success');
      // Redirect or show dashboard after login
    } catch (err: unknown) {
      console.error('Login error:', err);
      
      let errorMessage = 'Invalid email or password';
      
      // Type guard to check if it's an ApiError
      if (err && typeof err === 'object' && 'response' in err) {
        const apiError = err as ApiError;
        errorMessage = apiError.response?.data?.message || errorMessage;
      } 
      // Type guard to check if it's a standard Error
      else if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
      }
      // Type guard to check if it's a string
      else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      showFlash(errorMessage, 'error');
    }

    setIsLoading(false);
  };

  const handleGoogleLogin = () => {
    showFlash('Redirecting to Google authentication...', 'info');
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;

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

        {/* Particles */}
        <div className={styles.particlesContainer} id="particles"></div>

        <div className={styles.main}>
          {/* Login Form */}
          <div className={styles.formSection}>
            <div className={styles.brand}>
              <div className={styles.logo}>R</div>
              <div className={styles.brandText}>Reon Messaging</div>
            </div>

            <div className={styles.glassForm}>
              <div className={styles.formHeader}>
                <h1 className={styles.title}>Welcome Back</h1>
                <p className={styles.subtitle}>Sign in to your Reon Messaging account</p>
              </div>

              <form className={styles.formBox} onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                  <label>Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className={styles.glassInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Password</label>
                  <div className={styles.passwordWrapper}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className={styles.glassInput}
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

                <div className={styles.formOptions}>
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className={`${styles.forgotPassword} ${isForgotPasswordLoading ? styles.loading : ''}`}
                    disabled={isForgotPasswordLoading}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: isForgotPasswordLoading ? 'not-allowed' : 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    {isForgotPasswordLoading ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>

                <button
                  type="submit"
                  className={`${styles.btnPrimary} ${isLoading ? styles.loading : ''}`}
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </button>

                <div className={styles.divider}>
                  <span>Or continue with</span>
                </div>

                <button type="button" className={styles.btnGoogle} onClick={handleGoogleLogin}>
                  <svg className={styles.googleIcon} viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>

                <div className={styles.altText}>
                  <span>New here?</span>
                  <a href="/auth/signup">Create Account</a>
                </div>
              </form>
            </div>
          </div>

          {/* Chat demo */}
          <div className={styles.chatContainer}>
            <div className={styles.chatBox} ref={chatBoxRef}>
              <div className={styles.chatTitle}>
                <div className={styles.statusDot}></div>
                Team Chat Preview
              </div>

              {chatMessages.map((message, index) => (
                <div
                  key={`${animationCycle}-${index}`} // Include cycle in key to force re-render
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

      {/* Footer */}
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