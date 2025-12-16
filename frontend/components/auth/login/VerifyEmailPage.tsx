'use client';

import { Suspense } from 'react';
import styles from './LoginPage.module.css';
import VerifyEmailForm from './VerifyEmailForm';

export default function VerifyEmailPage() {
  return (
    <div className={styles.fullPage}>
      {/* Background blobs */}
      <div className={`${styles.blob} ${styles.blobPurple}`}></div>
      <div className={`${styles.blob} ${styles.blobBlue}`}></div>
      <div className={`${styles.blob} ${styles.blobTeal}`}></div>

      <div className={styles.main}>
        <div className={styles.glassForm} style={{ maxWidth: '500px', textAlign: 'center' }}>
          <div className={styles.brand}>
            <div className={styles.logo}>R</div>
            <div className={styles.brandText}>Reon Messaging</div>
          </div>

          {/* CRITICAL: Wrap VerifyEmailForm in Suspense */}
          <Suspense fallback={
            <div className={styles.formHeader}>
              <h1 className={styles.title}>Verifying Email...</h1>
              <div style={{ marginTop: '2rem' }}>
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
              </div>
            </div>
          }>
            <VerifyEmailForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}