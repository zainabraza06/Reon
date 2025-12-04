"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./ResetPasswordPage.module.css";
import { ChatMessage, FlashMessage } from "@/types";
import { api } from "@/lib/api"; 
import { AxiosError } from "axios";

interface ApiError extends Error {
  response?: {
    data?: {
      message?: string;
    };
  };
}

export default function ResetPasswordPage() {
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const messages: ChatMessage[] = [
    { text: "Just updated my password", type: "user", time: "10:05 AM", status: "read" },
    { text: "Great! Security is key 🔑", type: "other", time: "10:06 AM" },
    { text: "All secure now", type: "user", time: "10:07 AM", status: "read" },
    { text: "Remember to use a strong one", type: "other", time: "10:08 AM" },
    { text: "Will do! Thanks", type: "user", time: "10:09 AM", status: "read" },
  ];

  const showFlash = (message: string, type: "success" | "error" | "info" = "error") => {
    setFlashMessage({ message, type });
    setTimeout(() => setFlashMessage(null), 5000);
  };

  useEffect(() => {
    if (!token) {
      setIsTokenValid(false);
      showFlash("Invalid reset link. Please request a new password reset.", "error");
      return;
    }
    setIsTokenValid(true);
  }, [token]);

  useEffect(() => {
    let idx = 0;

    const typeNextMessage = () => {
      if (idx >= messages.length) {
        setTimeout(() => {
          setChatMessages([]);
          idx = 0;
          typeNextMessage();
        }, 3000);
        return;
      }

      const msg = messages[idx];
      setTimeout(() => {
        setChatMessages(prev => [...prev, { ...msg, typing: true, currentText: "", visible: false }]);

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
            setTimeout(typeNextMessage, 800);
          }
        };
        typeChar();
      });
    };

    typeNextMessage();
  }, []);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    const createParticles = () => {
      const container = document.getElementById("particles");
      if (!container) return;

      container.innerHTML = "";
      const particleCount = 25;
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = styles.particle;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        container.appendChild(particle);
      }
    };

    createParticles();
  }, []);

  const validatePassword = (password: string) => {
  const minLength = 8;
  const uppercase = /[A-Z]/;
  const lowercase = /[a-z]/;
  const number = /[0-9]/;
  const specialChar = /[!@#$%^&*(),.?":{}|<>]/;

  if (password.length < minLength) return "Password must be at least 8 characters long";
  if (!uppercase.test(password)) return "Password must include at least one uppercase letter";
  if (!lowercase.test(password)) return "Password must include at least one lowercase letter";
  if (!number.test(password)) return "Password must include at least one number";
  if (!specialChar.test(password)) return "Password must include at least one special character";

  return null;
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!token) {
    showFlash("Invalid reset token", "error");
    return;
  }

  const validationError = validatePassword(password);
  if (validationError) {
    showFlash(validationError, "error");
    return;
  }

  if (password !== confirmPassword) {
    showFlash("Passwords do not match", "error");
    return;
  }

  setIsLoading(true);

try {
  const response = await api.post("/auth/forgot-password/reset", { token, password });
  showFlash("Password reset successful! Redirecting to login...", "success");
  setTimeout(() => router.push("/auth/login"), 2000);
} catch (err: unknown) {
  let message = "Network error. Please try again.";

  if (err instanceof AxiosError) {
    // Axios error has response.data.message
    message = err.response?.data?.message || err.message;
  } else if (err instanceof Error) {
    // regular JS errors
    message = err.message;
  }

  showFlash(message, "error");
}

  setIsLoading(false);
};

  const closeFlash = () => setFlashMessage(null);

  // Show invalid token state
  if (isTokenValid === false) {
    return (
      <div className={styles.fullPage}>
        {/* Flash Message */}
        {flashMessage && (
          <div className={`${styles.flashMessage} ${styles[flashMessage.type]}`}>
            <div className={styles.flashContent}>
              {flashMessage.type === "success" && <div className={styles.flashIcon}>✓</div>}
              {flashMessage.type === "error" && <div className={styles.flashIcon}>✕</div>}
              {flashMessage.type === "info" && <div className={styles.flashIcon}>ℹ</div>}
              <span className={styles.flashText}>{flashMessage.message}</span>
            </div>
            <button onClick={closeFlash} className={styles.flashClose}>
              ×
            </button>
          </div>
        )}

        {/* Background */}
        <div className={`${styles.blob} ${styles.blobPurple}`}></div>
        <div className={`${styles.blob} ${styles.blobBlue}`}></div>
        <div className={`${styles.blob} ${styles.blobTeal}`}></div>
        <div className={styles.particlesContainer} id="particles"></div>

        <div className={styles.main}>
          {/* INVALID TOKEN STATE */}
          <div className={styles.formSection}>
            <div className={styles.brand}>
              <div className={styles.logo}>R</div>
              <div className={styles.brandText}>Reon Messaging</div>
            </div>

            <div className={styles.glassForm} style={{ textAlign: 'center' }}>
              <div className={styles.formHeader}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 2rem',
                  fontSize: '2rem',
                  color: 'white'
                }}>
                  ✕
                </div>
                <h1 className={styles.title}>Invalid Link</h1>
                <p className={styles.subtitle}>
                  This password reset link is invalid or has expired.
                  Please request a new password reset link.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                
                <button 
                  onClick={() => router.push('/auth/login')}
                  className={styles.btnGoogle}
                >
                  Back to Login
                </button>
              </div>
            </div>
          </div>

          {/* Chat demo */}
          <div className={styles.chatContainer}>
            <div className={styles.chatBox} ref={chatBoxRef}>
              <div className={styles.chatTitle}>
                <div className={styles.statusDot}></div>
                Security Alert
              </div>

              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`${styles.chatMessage} ${styles[message.type]} ${
                    message.visible ? styles.show : ""
                  }`}
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

        {/* FOOTER */}
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
      </div>
    );
  }

  // Show reset password form only when token is valid
  return (
    <div className={styles.fullPage}>
      {/* Flash Message */}
      {flashMessage && (
        <div className={`${styles.flashMessage} ${styles[flashMessage.type]}`}>
          <div className={styles.flashContent}>
            {flashMessage.type === "success" && <div className={styles.flashIcon}>✓</div>}
            {flashMessage.type === "error" && <div className={styles.flashIcon}>✕</div>}
            {flashMessage.type === "info" && <div className={styles.flashIcon}>ℹ</div>}
            <span className={styles.flashText}>{flashMessage.message}</span>
          </div>
          <button onClick={closeFlash} className={styles.flashClose}>
            ×
          </button>
        </div>
      )}

      {/* Background */}
      <div className={`${styles.blob} ${styles.blobPurple}`}></div>
      <div className={`${styles.blob} ${styles.blobBlue}`}></div>
      <div className={`${styles.blob} ${styles.blobTeal}`}></div>
      <div className={styles.particlesContainer} id="particles"></div>

      <div className={styles.main}>
        {/* RESET PASSWORD FORM - Only shown when token is valid */}
        <div className={styles.formSection}>
          <div className={styles.brand}>
            <div className={styles.logo}>R</div>
            <div className={styles.brandText}>Reon Messaging</div>
          </div>

          <div className={styles.glassForm}>
            <div className={styles.formHeader}>
              <h1 className={styles.title}>Create New Password</h1>
              <p className={styles.subtitle}>Enter your new password below.</p>
            </div>

            <form className={styles.formBox} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label>New Password</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className={styles.glassInput}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Confirm Password</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={styles.glassInput}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className={`${styles.btnPrimary} ${isLoading ? styles.loading : ""}`}
                disabled={isLoading}
              >
                {isLoading ? "Resetting Password..." : "Reset Password"}
              </button>

              <div className={styles.altText}>
        =
                <a href="/auth/login">Back to Login</a>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT CHAT */}
        <div className={styles.chatContainer}>
          <div className={styles.chatBox} ref={chatBoxRef}>
            <div className={styles.chatTitle}>
              <div className={styles.statusDot}></div>
              Security Update
            </div>

            {chatMessages.map((message, index) => (
              <div
                key={index}
                className={`${styles.chatMessage} ${styles[message.type]} ${
                  message.visible ? styles.show : ""
                }`}
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

      {/* FOOTER */}
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
    </div>
  );
}