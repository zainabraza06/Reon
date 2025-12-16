'use client';

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

export default function ResetPasswordForm() {
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

  const showFlash = (message: string, type: "success" | "error" | "info" = "error") => {
    setFlashMessage({ message, type });
    setTimeout(() => setFlashMessage(null), 5000);
  };
useEffect(() => {
  queueMicrotask(() => {
    if (!token) {
      setIsTokenValid(false);
      showFlash(
        "Invalid reset link. Please request a new password reset.",
        "error"
      );
    } else {
      setIsTokenValid(true);
    }
  });
}, [token]);


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
        message = err.response?.data?.message || err.message;
      } else if (err instanceof Error) {
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
      <div className={styles.glassForm} style={{ textAlign: 'center' }}>
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
    );
  }

  // Show reset password form only when token is valid
  return (
    <div className={styles.glassForm}>
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
          <a href="/auth/login">Back to Login</a>
        </div>
      </form>
    </div>
  );
}