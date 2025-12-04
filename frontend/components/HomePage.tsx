'use client';
import { useEffect, useState, useRef } from 'react';
import styles from './HomePage.module.css';
import { ChatMessage } from '@/types';

export default function HomePage() {
  // Hero text with typing state
  const [heroTitle, setHeroTitle] = useState<string>('');
  const [heroDesc, setHeroDesc] = useState<string>('');
  const [showButtons, setShowButtons] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(false);
  const [usersCount, setUsersCount] = useState<number>(0);
  const [messagesCount, setMessagesCount] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const chatBoxRef = useRef<HTMLDivElement>(null);
  const particlesCreated = useRef<boolean>(false);
  const typingStarted = useRef<boolean>(false);

  const messages: ChatMessage[] = [
    { text: "Hey team, are we ready for the client presentation tomorrow?", type: "other", time: "10:05 AM" },
    { text: "Yes, I've finalized the slides and sent them to everyone.", type: "user", time: "10:06 AM", status: "read" },
    { text: "Perfect! I'll review them in the next hour.", type: "other", time: "10:07 AM" },
    { text: "Don't forget about the budget spreadsheet - I've updated Q3 projections.", type: "other", time: "10:08 AM" },
    { text: "Got it, thanks! I'll incorporate those numbers.", type: "user", time: "10:09 AM", status: "read" },
    { text: "Meeting at 2 PM to run through everything?", type: "other", time: "10:10 AM" }
  ];

  // Create floating particles
  const createParticles = (): void => {
    if (particlesCreated.current) return;
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.classList.add(styles.particle);
      const left = Math.random() * 100;
      const delay = Math.random() * 15;
      particle.style.left = `${left}%`;
      particle.style.animationDelay = `${delay}s`;
      particlesContainer.appendChild(particle);
    }

    particlesCreated.current = true;
  };

  // Typing effect for hero text - FIXED VERSION
  useEffect(() => {
    if (typingStarted.current) return;
    typingStarted.current = true;

    const typeText = (
      setter: React.Dispatch<React.SetStateAction<string>>, 
      text: string, 
      delay: number = 50
    ): Promise<void> => {
      return new Promise((resolve) => {
        let currentText = '';
        let i = 0;
        
        const typing = () => {
          if (i < text.length) {
            currentText += text[i];
            setter(currentText);
            i++;
            setTimeout(typing, delay);
          } else {
            resolve();
          }
        };
        
        typing();
      });
    };

    const initTyping = async (): Promise<void> => {
      // Clear the text first and wait for next render
      setHeroTitle('');
      setHeroDesc('');
      
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await typeText(setHeroTitle, "Reon Messaging", 100);
      await typeText(setHeroDesc, "Secure, lightning-fast, real-time messaging with end-to-end encryption. Connect effortlessly. Collaborate seamlessly, manage projects efficiently, and communicate securely with your team.", 25);

      setShowButtons(true);

      setTimeout(() => {
        setShowStats(true);
        animateCounter(0, 12500, setUsersCount, 2000);
        animateCounter(0, 850000, setMessagesCount, 2500);
      }, 500);
    };

    initTyping();
  }, []);

  // Animate counter
  const animateCounter = (start: number, end: number, setter: React.Dispatch<React.SetStateAction<number>>, duration: number): void => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setter(Math.floor(progress * (end - start) + start));
      if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  };

  // Chat typing loop
  useEffect(() => {
    let currentIndex = 0;
    let timeoutId: NodeJS.Timeout;

    const showMessage = (): void => {
      if (currentIndex >= messages.length) {
        timeoutId = setTimeout(() => {
          setChatMessages([]);
          currentIndex = 0;
          showMessage();
        }, 3000);
        return;
      }

      const msg = messages[currentIndex];
      setChatMessages(prev => [...prev, { ...msg, visible: false, typing: true, currentText: '' }]);

      const messageIndex = currentIndex;
      let charIndex = 0;

      const typeChar = (): void => {
        if (charIndex < msg.text.length) {
          setChatMessages(prev =>
            prev.map((m, i) =>
              i === messageIndex ? { ...m, currentText: msg.text.substring(0, charIndex + 1) } : m
            )
          );
          charIndex++;
          setTimeout(typeChar, 30);
        } else {
          setChatMessages(prev =>
            prev.map((m, i) =>
              i === messageIndex ? { ...m, typing: false, visible: true } : m
            )
          );
          currentIndex++;
          timeoutId = setTimeout(showMessage, 800 + Math.random() * 500);
        }
      };

      typeChar();
    };

    showMessage();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTo({
        top: chatBoxRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages]);

  // Buttons glow effect
  useEffect(() => {
    const interval = setInterval(() => {
      const btnPrimary = document.getElementById('btnPrimary');
      const btnSecondary = document.getElementById('btnSecondary');

      if (btnPrimary && btnSecondary) {
        btnPrimary.classList.add(styles.glow);
        btnSecondary.classList.add(styles.glow);

        setTimeout(() => {
          if (btnPrimary && btnSecondary) {
            btnPrimary.classList.remove(styles.glow);
            btnSecondary.classList.remove(styles.glow);
          }
        }, 1000);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Initialize particles
  useEffect(() => {
    createParticles();
  }, []);

  return (
    <>
      <div className={styles.fullPage}>
        <div className={styles.particles} id="particles"></div>
        <div className={`${styles.blob} ${styles.blobPurple}`}></div>
        <div className={`${styles.blob} ${styles.blobBlue}`}></div>
        <div className={`${styles.blob} ${styles.blobTeal}`}></div>

        <div className={styles.main}>
          <div className={styles.hero}>
            <h1 id="heroTitle">{heroTitle}</h1>
            <p id="heroDesc">{heroDesc}</p>

            <div className={styles.features}>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>✓</div>
                <span>End-to-end encryption</span>
              </div>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>✓</div>
                <span>Real-time collaboration</span>
              </div>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>✓</div>
                <span>File sharing & storage</span>
              </div>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>✓</div>
                <span>Cross-platform sync</span>
              </div>
            </div>

            <div className={styles.buttons} id="heroButtons" style={{ opacity: showButtons ? 1 : 0 }}>
              <a href="/auth/signup" className={styles.btnPrimary} id="btnPrimary">
                Get Started Free
              </a>
              <a href="/auth/login" className={styles.btnSecondary} id="btnSecondary">
                Login to Account
              </a>
            </div>

            <div className={styles.stats} id="stats" style={{ opacity: showStats ? 1 : 0 }}>
              <div className={styles.stat}>
                <div className={styles.statNumber} id="usersCount">{usersCount.toLocaleString()}</div>
                <div className={styles.statLabel}>Active Users</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber} id="messagesCount">{messagesCount.toLocaleString()}</div>
                <div className={styles.statLabel}>Messages/Day</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber} id="uptimeCount">99.9%</div>
                <div className={styles.statLabel}>Uptime</div>
              </div>
            </div>
          </div>

          <div className={styles.chatContainer}>
            <div className={styles.chatBox} id="chatBox" ref={chatBoxRef}>
              <div className={styles.chatTitle}>Team Chat</div>
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`${styles.chatMessage} ${styles[message.type]} ${message.visible ? styles.show : ''} ${message.typing ? styles.shake : ''}`}
                >
                  <div>{message.currentText || message.text}</div>
                  {(message.time || message.status) && (
                    <div className={styles.messageStatus}>
                      {message.time && <span>{message.time}</span>}
                      {message.status && <span>✓✓</span>}
                    </div>
                  )}
                </div>
              ))}
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
      </div>
    </>
  );
}