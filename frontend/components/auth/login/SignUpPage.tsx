'use client';

import { useState, useEffect, useRef } from 'react';
import { ChatMessage, FlashMessage } from '@/types';
import { api } from '@/lib/api';
import BackgroundScene from '@/components/3d/BackgroundScene';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Check, AlertCircle, Info } from 'lucide-react';

// Define proper error types
interface ApiError extends Error {
  response?: {
    data?: {
      message?: string;
      error?: string;
    };
    status?: number;
  };
}

const DEMO_MESSAGES: ChatMessage[] = [
  { text: "Welcome to the team! 🎉", type: "other", time: "10:05 AM" },
  { text: "Thanks! Excited to be here!", type: "user", time: "10:06 AM", status: "read" },
  { text: "Don't forget to join #general", type: "other", time: "10:07 AM" },
  { text: "Just uploaded my profile pic", type: "user", time: "10:08 AM", status: "read" },
  { text: "Looking great! Welcome aboard!", type: "other", time: "10:09 AM" },
];

export default function SignupPage() {
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  // Flash message
  const showFlash = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    setFlashMessage({ message, type });
    setTimeout(() => {
      setFlashMessage(null);
    }, 5000);
  };

  // Chat animation
  useEffect(() => {
    let idx = 0;
    let mounted = true;

    const typeNext = () => {
      if (!mounted) return;

      if (idx >= DEMO_MESSAGES.length) {
        setTimeout(() => {
          if (mounted) {
            setChatMessages([]);
            idx = 0;
            typeNext();
          }
        }, 3000);
        return;
      }

      const msg = DEMO_MESSAGES[idx];
      setChatMessages(prev => [...prev, { ...msg, typing: true, currentText: '', visible: false }]);

      let char = 0;
      const typeChar = () => {
        if (!mounted) return;
        if (char < msg.text.length) {
          setChatMessages(prev =>
            prev.map((m, i) => i === prev.length - 1 ? { ...m, currentText: msg.text.slice(0, char + 1) } : m)
          );
          char++;
          setTimeout(typeChar, 35);
        } else {
          setChatMessages(prev =>
            prev.map((m, i) => i === prev.length - 1 ? { ...m, typing: false, visible: true } : m)
          );
          idx++;
          setTimeout(typeNext, 800);
        }
      };
      typeChar();
    };

    typeNext();

    return () => { mounted = false; };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const fullName = formData.get('fullName') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      showFlash('Passwords do not match', 'error');
      setIsLoading(false);
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=~`[\]{}|\\:;"'<>,.?/]).{8,}$/;
    if (!passwordRegex.test(password)) {
      showFlash('Password must be at least 8 characters and include uppercase, lowercase, number, and special character', 'error');
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/signup', { fullName, email, password });
      const successMessage = response.data.message || 'Account Created. Login to your account.';
      showFlash(successMessage, 'success');
      if (formElement) formElement.reset();
    } catch (err: unknown) {
      let errorMessage = 'Signup failed. Please try again.';
      if (err && typeof err === 'object' && 'response' in err) {
        const apiError = err as ApiError;
        if (apiError.response?.data?.message) errorMessage = apiError.response.data.message;
        else if (apiError.response?.data?.error) errorMessage = apiError.response.data.error;
        else if (apiError.message) errorMessage = apiError.message;
      }
      showFlash(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
  };

  return (
    <>
      <BackgroundScene />

      <div className="min-h-screen flex flex-col relative z-10 font-sans text-white overflow-hidden">

        <AnimatePresence>
          {flashMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl backdrop-blur-md border border-white/10
                    ${flashMessage.type === 'success' ? 'bg-green-500/20 text-green-200' :
                  flashMessage.type === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-blue-500/20 text-blue-200'}`}
            >
              {flashMessage.type === 'success' && <Check size={16} />}
              {flashMessage.type === 'error' && <AlertCircle size={16} />}
              {flashMessage.type === 'info' && <Info size={16} />}
              <span className="text-sm font-medium">{flashMessage.message}</span>
              <button onClick={() => setFlashMessage(null)} className="ml-2 hover:bg-white/10 rounded-full p-1">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 md:p-8 gap-8 md:gap-16 max-w-7xl mx-auto w-full">

          {/* Form Section */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md"
          >
            <div className="flex items-center gap-3 mb-8 justify-center md:justify-start">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/30">R</div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Reon Messaging</span>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Create Account</h1>
                <p className="text-gray-400">Join Reon and start collaborating</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300 ml-1">Full Name</label>
                  <input
                    type="text"
                    name="fullName"
                    placeholder="John Doe"
                    required
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300 ml-1">Email address</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300 ml-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300 ml-1">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      placeholder="••••••••"
                      required
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <input type="checkbox" required className="rounded bg-black/20 border-white/10 text-blue-500 focus:ring-0" />
                  <span className="text-xs text-gray-400">I agree to the Terms and Privacy Policy</span>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/25 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Create Account'}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-3 mt-4"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign up with Google
                </button>

                <div className="text-center text-sm text-gray-400 mt-4">
                  Already have an account? <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 font-medium">Sign In</Link>
                </div>
              </form>
            </div>
          </motion.div>

          {/* Right: Mock Chat (Desktop only) */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden md:block flex-1 max-w-sm mr-10 relative"
          >
            <div className="absolute inset-0 bg-purple-500/20 blur-[100px] rounded-full -z-10" />

            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/10">
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <div className="ml-auto text-xs font-mono text-gray-500">Welcome</div>
              </div>

              <div ref={chatBoxRef} className="h-[350px] p-5 overflow-y-auto space-y-3">
                {chatMessages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm relative ${msg.type === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-white/10 text-gray-200 rounded-bl-sm border border-white/5'
                      }`}>
                      <div>{msg.currentText || msg.text}</div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="p-4 border-t border-white/10 bg-white/5">
                <div className="h-9 bg-white/10 rounded-full w-3/4 animate-pulse opacity-30" />
              </div>
            </div>
          </motion.div>

        </div>

        <footer className="w-full py-6 mt-auto border-t border-white/5 text-center text-xs text-gray-500 bg-black/20 backdrop-blur-sm">
          <p>© 2024 Reon Messaging. End-to-end encrypted.</p>
        </footer>
      </div>
    </>
  );
}