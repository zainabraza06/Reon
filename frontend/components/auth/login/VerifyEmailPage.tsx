'use client';

import { Suspense } from 'react';
import VerifyEmailForm from './VerifyEmailForm';

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen p-4 flex items-center justify-center relative bg-gradient-to-br from-[#1e1e2f] to-[#111117] overflow-hidden">
      {/* Background blobs */}
      <div className="absolute w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(128,90,213,0.3)] -top-32 -right-32" />
      <div className="absolute w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(59,130,246,0.3)] -bottom-32 -left-32 [animation-delay:2s]" />
      <div className="absolute w-[25rem] h-[25rem] rounded-full blur-[100px] opacity-40 animate-pulse-blob bg-[rgba(45,212,191,0.25)] top-1/2 left-[60%] [animation-delay:4s]" />

      <div className="w-full max-w-[1400px] flex gap-12 items-center justify-center z-[2] relative">
        <div className="bg-white/[0.08] backdrop-blur-3xl rounded-3xl p-6 border border-white/15 shadow-[0_15px_30px_rgba(0,0,0,0.25)] w-full max-w-[500px] flex flex-col justify-center text-center">
          <div className="flex items-center gap-2 mb-6 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-[10px] flex items-center justify-center font-bold text-lg text-white shrink-0">
              R
            </div>
            <div className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              Reon Messaging
            </div>
          </div>

          <Suspense fallback={
            <div className="text-center mb-5">
              <h1 className="text-[1.8rem] font-extrabold mb-2">Verifying Email...</h1>
              <div className="mt-8">
                <div className="w-full py-[0.95rem] rounded-[0.8rem] bg-blue-500/30 flex items-center justify-center">
                  <span className="w-5 h-5 border-[3px] border-transparent border-t-white rounded-full animate-spin-ring inline-block" />
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
