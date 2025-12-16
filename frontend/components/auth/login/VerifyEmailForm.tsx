'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './LoginPage.module.css';
import { api } from '@/lib/api';

// Define the error response type
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
  console.log("token", token);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        console.log("token", token);
        return;
      }

      try {
        console.log('Making verification request with token:', token);
        
        const response = await api.get('/auth/verify-email', {
          params: { token }
        });
        
        console.log('Verification response:', response);
        
        setStatus('success');
        setMessage(response.data.message || 'Email verified successfully!');
      } catch (error: unknown) {
        console.error('Verification error:', error);
        
        const apiError = error as ApiError;
        
        if (apiError.response) {
          console.log('Response data:', apiError.response.data);
          console.log('Response status:', apiError.response.status);
          
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
    <div className={styles.glassForm} style={{ maxWidth: '500px', textAlign: 'center' }}>
      <div className={styles.formHeader}>
        <h1 className={styles.title}>
          {status === 'loading' && 'Verifying Email...'}
          {status === 'success' && 'Email Verified!'}
          {status === 'error' && 'Verification Failed'}
        </h1>
        
        <div style={{ marginTop: '2rem' }}>
          {status === 'loading' && (
            <div className={styles.btnPrimary} style={{ background: 'rgba(59, 130, 246, 0.3)' }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                border: '3px solid transparent',
                borderTop: '3px solid #ffffff',
                borderRadius: '50%',
                animation: 'buttonLoading 1s ease infinite',
                margin: '0 auto'
              }}></div>
            </div>
          )}
          
          {status === 'success' && (
            <>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                background: 'linear-gradient(135deg, #10b981, #059669)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 2rem',
                fontSize: '2rem',
                color: 'white'
              }}>
                ✓
              </div>
              <p className={styles.subtitle}>{message}</p>
              <button 
                onClick={() => window.location.href = '/auth/login'}
                className={styles.btnPrimary}
                style={{ marginTop: '2rem' }}
              >
                Continue to Login
              </button>
            </>
          )}
          
          {status === 'error' && (
            <>
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
              <p className={styles.subtitle}>{message}</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                <button 
                  onClick={() => window.location.href='/auth/signup'}
                  className={styles.btnPrimary}
                >
                  Try Again
                </button>
                <button 
                  onClick={() => window.location.href = '/auth/login'}
                  className={styles.btnGoogle}
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