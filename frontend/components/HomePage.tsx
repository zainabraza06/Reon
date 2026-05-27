'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@/types';
import BackgroundScene from './3d/BackgroundScene';
import Link from 'next/link';
import { ChevronRight, Shield, Zap, Share2, RefreshCw } from 'lucide-react';

// Data - Moved outside to be stable
const messages: ChatMessage[] = [
  { text: "Hey team, are we ready for the client presentation tomorrow?", type: "other", time: "10:05 AM" },
  { text: "Yes, I've finalized the slides and sent them to everyone.", type: "user", time: "10:06 AM", status: "read" },
  { text: "Perfect! I'll review them in the next hour.", type: "other", time: "10:07 AM" },
  { text: "Don't forget about the budget spreadsheet - I've updated Q3 projections.", type: "other", time: "10:08 AM" },
  { text: "Got it, thanks! I'll incorporate those numbers.", type: "user", time: "10:09 AM", status: "read" },
  { text: "Meeting at 2 PM to run through everything?", type: "other", time: "10:10 AM" }
];

export default function HomePage() {
  // Hero text state
  const [heroTitle, setHeroTitle] = useState('');
  const [heroDesc, setHeroDesc] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  // Stats state
  const [usersCount, setUsersCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  // Typing effect logic
  useEffect(() => {
    const titleText = "Reon Messaging";
    const descText = "Secure, lightning-fast, real-time messaging with end-to-end encryption. Connect effortlessly. Collaborate seamlessly, manage projects efficiently, and communicate securely with your team.";

    let mounted = true;

    // Stats Counter Animation Helper
    const animateValue = (start: number, end: number, duration: number, setter: (val: number) => void) => {
      let startTimestamp: number | null = null;
      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        setter(Math.floor(progress * (end - start) + start));
        if (progress < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    };

    const typeSequence = async () => {
      // Type Title
      for (let i = 0; i <= titleText.length; i++) {
        if (!mounted) return;
        setHeroTitle(titleText.slice(0, i));
        await new Promise(r => setTimeout(r, 100));
      }

      // Type Description
      for (let i = 0; i <= descText.length; i++) {
        if (!mounted) return;
        setHeroDesc(descText.slice(0, i));
        await new Promise(r => setTimeout(r, 20)); // Faster for description
      }

      if (mounted) {
        setIsTypingComplete(true);
        // Start stats counting
        animateValue(0, 12500, 2000, setUsersCount);
        animateValue(0, 850000, 2500, setMessagesCount);
      }
    };

    typeSequence();

    return () => { mounted = false; };
  }, []);

  // Chat Simulation Loop
  useEffect(() => {
    let currentIndex = 0;
    let timeoutId: NodeJS.Timeout;
    let mounted = true;

    const showNextMessage = () => {
      if (!mounted) return;

      if (currentIndex >= messages.length) {
        // Reset chatter
        timeoutId = setTimeout(() => {
          setChatMessages([]);
          currentIndex = 0;
          showNextMessage();
        }, 3000);
        return;
      }

      const msg = messages[currentIndex];
      // Add message with "typing" state first
      setChatMessages(prev => [...prev, { ...msg, visible: false, typing: true, currentText: '' }]);

      // Type the message content
      let charIndex = 0;
      const typeChar = () => {
        if (!mounted) return;
        if (charIndex < msg.text.length) {
          setChatMessages(prev =>
            prev.map((m, i) => i === prev.length - 1 ? { ...m, currentText: msg.text.slice(0, charIndex + 1) } : m)
          );
          charIndex++;
          setTimeout(typeChar, 30);
        } else {
          // Done typing
          setChatMessages(prev =>
            prev.map((m, i) => i === prev.length - 1 ? { ...m, typing: false, visible: true } : m)
          );
          currentIndex++;
          timeoutId = setTimeout(showNextMessage, 1000 + Math.random() * 1000);
        }
      };

      typeChar();
    };

    showNextMessage();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // messages is constant now

  // Auto-scroll chat
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTo({ top: chatBoxRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chatMessages]);

  return (
    <>
      <BackgroundScene />

      <div className="min-h-screen text-white overflow-x-hidden flex flex-col relative z-10 font-sans">

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-center gap-12 py-12 lg:py-0">

          {/* Left: Hero Text */}
          <div className="flex-1 max-w-2xl text-center lg:text-left pt-20 lg:pt-0">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 min-h-[4rem] sm:min-h-[5rem]">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 animate-gradient-x">
                {heroTitle}
              </span>
              <span className="animate-pulse text-blue-400">|</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed min-h-[6rem] lg:min-h-[5rem]">
              {heroDesc}
            </p>

            {/* Features Grid (Fades in) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: isTypingComplete ? 1 : 0, y: isTypingComplete ? 0 : 20 }}
              transition={{ duration: 0.8 }}
              className="grid grid-cols-2 gap-4 mb-10 max-w-lg mx-auto lg:mx-0"
            >
              {[
                { icon: Shield, text: "End-to-End Encrypted" },
                { icon: Zap, text: "Real-time Sync" },
                { icon: Share2, text: "File Sharing" },
                { icon: RefreshCw, text: "Cross-Platform" },
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2 text-gray-300">
                  <div className="p-1.5 rounded-full bg-blue-500/20 text-blue-400">
                    <feature.icon size={16} />
                  </div>
                  <span className="text-sm font-medium">{feature.text}</span>
                </div>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isTypingComplete ? 1 : 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link href="/auth/signup"
                className="px-8 py-4 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
              >
                Get Started Free
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/auth/login"
                className="px-8 py-4 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 text-white font-semibold transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center"
              >
                Login to Account
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isTypingComplete ? 1 : 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="mt-12 flex gap-8 justify-center lg:justify-start border-t border-white/10 pt-8"
            >
              <div>
                <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                  {usersCount.toLocaleString()}+
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Active Users</div>
              </div>
              <div>
                <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                  {messagesCount.toLocaleString()}+
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Messages/Day</div>
              </div>
              <div>
                <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                  99.9%
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Uptime</div>
              </div>
            </motion.div>
          </div>

          {/* Right: Mock Chat Interface */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="flex-1 w-full max-w-md relative"
          >
            {/* Decorative background blobs for the chat container */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-500/20 blur-[100px] rounded-full -z-10 pointer-events-none" />

            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/20">
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <div className="ml-auto text-xs font-mono text-gray-400">Team Chat</div>
              </div>

              {/* Messages Area */}
              <div
                ref={chatBoxRef}
                className="h-[400px] p-6 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
              >
                <AnimatePresence>
                  {chatMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`
                                max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed relative
                                ${msg.type === 'user'
                          ? 'bg-blue-600/90 text-white rounded-br-sm'
                          : 'bg-white/10 text-gray-100 rounded-bl-sm border border-white/5'}
                            `}>
                        <div className="break-words">
                          {msg.currentText || msg.text}
                          {msg.typing && <span className="animate-pulse inline-block w-1 h-4 align-middle ml-1 bg-white/50" />}
                        </div>

                        {msg.visible && (
                          <div className={`text-[10px] mt-1 opacity-60 flex gap-1 items-center ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.time}
                            {msg.type === 'user' && msg.status && <span>• Read</span>}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Input Area (Visual only) */}
              <div className="p-4 border-t border-white/10 bg-white/5">
                <div className="h-10 bg-white/10 rounded-full w-full animate-pulse opacity-50" />
              </div>
            </div>
          </motion.div>

        </main>

        <footer className="w-full py-6 mt-auto border-t border-white/5 text-center text-sm text-gray-500 bg-black/20 backdrop-blur-sm">
          <p>© 2024 Reon Messaging. Enterprise-grade Security.</p>
        </footer>
      </div>
    </>
  );
}