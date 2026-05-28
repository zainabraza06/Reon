'use client';

import { useState, useEffect, useRef, Suspense } from "react";
import { ChatMessage } from "@/types";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const messages: ChatMessage[] = [
    { text: "Just updated my password", type: "user", time: "10:05 AM", status: "read" },
    { text: "Great! Security is key 🔑", type: "other", time: "10:06 AM" },
    { text: "All secure now", type: "user", time: "10:07 AM", status: "read" },
    { text: "Remember to use a strong one", type: "other", time: "10:08 AM" },
    { text: "Will do! Thanks", type: "user", time: "10:09 AM", status: "read" },
  ];

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
      for (let i = 0; i < 25; i++) {
        const particle = document.createElement("div");
        particle.className = "particle";
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        container.appendChild(particle);
      }
    };
    createParticles();
  }, []);

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center relative bg-gradient-to-br from-[#1e1e2f] to-[#111117] overflow-hidden">
      {/* Background blobs */}
      <div className="absolute w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(128,90,213,0.3)] -top-32 -right-32" />
      <div className="absolute w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(59,130,246,0.3)] -bottom-32 -left-32 [animation-delay:2s]" />
      <div className="absolute w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(45,212,191,0.25)] top-1/2 left-[60%] [animation-delay:4s]" />
      <div className="absolute inset-0 z-0 pointer-events-none hidden sm:block" id="particles" />

      <div className="w-full max-w-[1400px] flex flex-col gap-8 lg:flex-row lg:gap-12 items-center justify-center z-[2] relative flex-1">
        {/* Form section */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 lg:min-w-[400px]">
          <div className="flex items-center gap-2 mb-6 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-[10px] flex items-center justify-center font-bold text-lg text-white shrink-0">
              R
            </div>
            <div className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              Reon Messaging
            </div>
          </div>

          <Suspense fallback={
            <div className="bg-white/[0.08] backdrop-blur-3xl rounded-3xl p-6 border border-white/15 shadow-[0_15px_30px_rgba(0,0,0,0.25)] w-full max-w-[500px] flex flex-col justify-center">
              <div className="text-center mb-5">
                <div className="w-8 h-8 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring mx-auto mb-4" />
                <p className="text-[0.8rem] leading-tight text-white/70">Loading reset form...</p>
              </div>
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>
        </div>

        {/* Chat preview section */}
        <div className="flex-1 flex justify-center min-w-0 lg:min-w-[400px]">
          <div
            ref={chatBoxRef}
            className="w-full max-w-[450px] bg-white/[0.08] backdrop-blur-3xl rounded-3xl p-6 flex flex-col gap-3 shadow-[0_15px_30px_rgba(0,0,0,0.25)] overflow-y-auto max-h-[500px] border border-white/15 relative custom-scrollbar"
          >
            <div className="font-bold mb-3 text-center text-white/90 flex items-center justify-center gap-2 text-[1.1rem]">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Security Update
            </div>

            {chatMessages.map((message, index) => (
              <div
                key={index}
                className={`py-[0.8rem] px-4 rounded-2xl mb-[0.4rem] max-w-[80%] text-white animate-message-slide transition-all duration-400 ${
                  message.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
                } ${
                  message.type === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-700 self-end rounded-br-[0.5rem]'
                    : 'bg-white/15 self-start rounded-bl-[0.5rem]'
                }`}
              >
                <div className="text-[0.9rem] leading-[1.3] break-words">
                  {message.currentText || message.text}
                </div>
                <div className="text-[0.7rem] opacity-70 mt-[0.3rem] flex justify-between items-center">
                  <span>{message.time}</span>
                  {message.status && <span>✓✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center mt-auto py-4 w-full z-[1] text-white/70 text-[0.8rem]">
        <div className="flex justify-center flex-wrap gap-4 items-center mb-2">
          <span>Enterprise-grade security</span>
          <div className="w-1 h-1 bg-white/50 rounded-full hidden sm:block" />
          <span>99.9% Uptime</span>
          <div className="w-1 h-1 bg-white/50 rounded-full hidden sm:block" />
          <span>24/7 Support</span>
        </div>
        <p className="opacity-80">© 2024 Reon Messaging. All rights reserved.</p>
      </footer>
    </div>
  );
}
