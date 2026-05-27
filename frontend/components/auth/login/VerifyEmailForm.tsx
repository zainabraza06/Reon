'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

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

export default function VerifyEmailForm() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      try {
        const response = await api.get('/auth/verify-email', { params: { token } });
        setStatus('success');
        setMessage(response.data.message || 'Email verified successfully!');
      } catch (error: unknown) {
        const apiError = error as ApiError;
        if (apiError.response) {
          setStatus('error');
          setMessage(apiError.response.data?.message || apiError.response.data?.error || 'Verification failed');
        } else {
          setStatus('error');
          setMessage('Network error. Please try again.');
        }
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="bg-white/[0.08] backdrop-blur-3xl rounded-3xl p-6 border border-white/15 shadow-[0_15px_30px_rgba(0,0,0,0.25)] w-full max-w-[500px] flex flex-col justify-center text-center">
      <div className="text-center mb-5">
        <h1 className="text-[1.8rem] font-extrabold mb-2">
          {status === 'loading' && 'Verifying Email...'}
          {status === 'success' && 'Email Verified!'}
          {status === 'error' && 'Verification Failed'}
        </h1>

        <div className="mt-8">
          {status === 'loading' && (
            <div className="w-full py-[0.95rem] rounded-[0.8rem] bg-blue-500/30 flex items-center justify-center mt-2">
              <span className="w-5 h-5 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring inline-block" />
            </div>
          )}

          {status === 'success' && (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 text-[2rem] text-white">
                ✓
              </div>
              <p className="text-[0.8rem] leading-tight text-white/70">{message}</p>
              <button
                onClick={() => window.location.href = '/auth/login'}
                className="w-full py-[0.95rem] rounded-[0.8rem] bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 cursor-pointer font-bold text-base transition-all hover:-translate-y-[3px] hover:shadow-[0_10px_20px_rgba(59,130,246,0.4)] mt-8"
              >
                Continue to Login
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-8 text-[2rem] text-white">
                ✕
              </div>
              <p className="text-[0.8rem] leading-tight text-white/70">{message}</p>
              <div className="flex gap-4 justify-center mt-8">
                <button
                  onClick={() => window.location.href = '/auth/signup'}
                  className="flex-1 py-[0.95rem] rounded-[0.8rem] bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 cursor-pointer font-bold text-base transition-all hover:-translate-y-[3px] hover:shadow-[0_10px_20px_rgba(59,130,246,0.4)]"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.href = '/auth/login'}
                  className="flex-1 py-[0.9rem] rounded-[0.8rem] bg-white/[0.12] backdrop-blur-xl border border-white/25 text-white cursor-pointer font-semibold text-[0.95rem] transition-all flex items-center justify-center hover:bg-white/[0.18] hover:-translate-y-0.5"
                >
                  Go to Login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
