'use client';

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import styles from "./ResetPasswordPage.module.css";
import { ChatMessage } from "@/types";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const router = useRouter();

  const messages: ChatMessage[] = [
    { text: "Just updated my password", type: "user", time: "10:05 AM", status: "read" },
    { text: "Great! Security is key 🔑", type: "other", time: "10:06 AM" },
    { text: "All secure now", type: "user", time: "10:07 AM", status: "read" },
    { text: "Remember to use a strong one", type: "other", time: "10:08 AM" },
    { text: "Will do! Thanks", type: "user", time: "10:09 AM", status: "read" },
  ];

  // Chat animation effect
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

  return (
    <div className={styles.fullPage}>
      {/* Background */}
      <div className={`${styles.blob} ${styles.blobPurple}`}></div>
      <div className={`${styles.blob} ${styles.blobBlue}`}></div>
      <div className={`${styles.blob} ${styles.blobTeal}`}></div>
      <div className={styles.particlesContainer} id="particles"></div>

      <div className={styles.main}>
        {/* RESET PASSWORD FORM SECTION */}
        <div className={styles.formSection}>
          <div className={styles.brand}>
            <div className={styles.logo}>R</div>
            <div className={styles.brandText}>Reon Messaging</div>
          </div>

          {/* CRITICAL: Wrap ResetPasswordForm in Suspense */}
          <Suspense fallback={
            <div className={styles.glassForm}>
              <div className={styles.formHeader}>
                <div className={styles.loadingSpinner}></div>
                <p className={styles.subtitle}>Loading reset form...</p>
              </div>
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>
        </div>

        {/* RIGHT CHAT SECTION */}
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