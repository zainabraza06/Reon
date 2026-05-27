'use client';

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FlashMessage } from "@/types";
import { api } from "@/lib/api";
import { AxiosError } from "axios";

interface ApiError extends Error {
  response?: {
    data?: {
      message?: string;
    };
  };
}

const flashVariants: Record<string, string> = {
  error:   'bg-red-500/15 border-red-500/30 text-red-200',
  success: 'bg-green-500/15 border-green-500/30 text-green-200',
  info:    'bg-blue-500/15 border-blue-500/30 text-blue-200',
};

const flashIcons: Record<string, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
};

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
        showFlash("Invalid reset link. Please request a new password reset.", "error");
      } else {
        setIsTokenValid(true);
      }
    });
  }, [token]);

  const validatePassword = (password: string) => {
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter";
    if (!/[0-9]/.test(password)) return "Password must include at least one number";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must include at least one special character";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { showFlash("Invalid reset token", "error"); return; }
    const validationError = validatePassword(password);
    if (validationError) { showFlash(validationError, "error"); return; }
    if (password !== confirmPassword) { showFlash("Passwords do not match", "error"); return; }

    setIsLoading(true);
    try {
      await api.post("/auth/forgot-password/reset", { token, password });
      showFlash("Password reset successful! Redirecting to login...", "success");
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch (err: unknown) {
      let message = "Network error. Please try again.";
      if (err instanceof AxiosError) message = err.response?.data?.message || err.message;
      else if (err instanceof Error) message = err.message;
      showFlash(message, "error");
    }
    setIsLoading(false);
  };

  const FlashBanner = () => flashMessage ? (
    <div className={`fixed top-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-[0.8rem] backdrop-blur-2xl border z-[1000] flex items-center justify-between gap-4 max-w-[400px] w-[90%] shadow-[0_10px_25px_rgba(0,0,0,0.2)] animate-slide-down-banner ${flashVariants[flashMessage.type] ?? flashVariants.error}`}>
      <div className="flex items-center gap-3 flex-1">
        <div className="w-5 h-5 flex items-center justify-center font-bold text-[0.9rem]">
          {flashIcons[flashMessage.type]}
        </div>
        <span className="text-[0.9rem] font-medium leading-[1.4]">{flashMessage.message}</span>
      </div>
      <button
        onClick={() => setFlashMessage(null)}
        className="bg-white/10 border border-white/20 text-inherit text-[1.25rem] cursor-pointer p-0 w-6 h-6 flex items-center justify-center rounded-[0.3rem] transition-all hover:bg-white/20 hover:scale-110 shrink-0"
      >
        ×
      </button>
    </div>
  ) : null;

  const glassForm = "bg-white/[0.08] backdrop-blur-3xl rounded-3xl p-6 border border-white/15 shadow-[0_15px_30px_rgba(0,0,0,0.25)] w-full max-w-[500px] flex flex-col justify-center";
  const glassInput = "py-[0.7rem] px-[0.8rem] rounded-[0.8rem] border border-white/20 bg-white/10 text-white text-[0.7rem] transition-all w-full outline-none placeholder:text-white/50 focus:border-blue-500/60 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)] focus:bg-white/[0.12]";
  const btnPrimary = "w-full py-[0.95rem] rounded-[0.8rem] bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 cursor-pointer font-bold text-base transition-all hover:-translate-y-[3px] hover:shadow-[0_10px_20px_rgba(59,130,246,0.4)] disabled:opacity-70 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2";

  if (isTokenValid === false) {
    return (
      <>
        <FlashBanner />
        <div className={`${glassForm} text-center`}>
          <div className="text-center mb-5">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-8 text-[2rem] text-white">
              ✕
            </div>
            <h1 className="text-[1.8rem] font-extrabold mb-2">Invalid Link</h1>
            <p className="text-[0.8rem] leading-tight text-white/70">
              This password reset link is invalid or has expired. Please request a new password reset link.
            </p>
          </div>
          <div className="flex flex-col gap-4 mt-8">
            <button
              onClick={() => router.push('/auth/login')}
              className="w-full py-[0.9rem] rounded-[0.8rem] bg-white/[0.12] backdrop-blur-xl border border-white/25 text-white cursor-pointer font-semibold text-[0.95rem] transition-all flex items-center justify-center hover:bg-white/[0.18] hover:-translate-y-0.5"
            >
              Back to Login
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <FlashBanner />
      <div className={glassForm}>
        <div className="text-center mb-5">
          <h1 className="text-[1.8rem] font-extrabold mb-2">Create New Password</h1>
          <p className="text-[0.8rem] leading-tight text-white/70">Enter your new password below.</p>
        </div>

        <form className="flex flex-col gap-[0.6rem] w-full" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-white/90 font-semibold text-[0.7rem]">New Password</label>
            <div className="relative w-full">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className={glassInput}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 border border-white/20 text-white/80 cursor-pointer text-[0.75rem] py-1 px-[0.6rem] rounded-[0.4rem] transition-all hover:bg-white/15"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-white/90 font-semibold text-[0.7rem]">Confirm Password</label>
            <div className="relative w-full">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={glassInput}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 border border-white/20 text-white/80 cursor-pointer text-[0.75rem] py-1 px-[0.6rem] rounded-[0.4rem] transition-all hover:bg-white/15"
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button type="submit" className={btnPrimary} disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="w-5 h-5 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring inline-block" />
                Resetting Password...
              </>
            ) : 'Reset Password'}
          </button>

          <div className="text-center mt-4 text-white/70 text-[0.9rem]">
            <a href="/auth/login" className="ml-2 text-blue-400 no-underline font-semibold transition-colors hover:text-blue-300">
              Back to Login
            </a>
          </div>
        </form>
      </div>
    </>
  );
}
