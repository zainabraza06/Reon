"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { generateKeyPair } from "@/lib/crypto";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(""); setLoading(true);
    try {
      await api.auth.signup(form);
      const { publicKey } = await generateKeyPair();
      await api.keys.upload(publicKey);
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const strength = form.password.length === 0 ? 0 : form.password.length < 8 ? 1 : form.password.length < 12 ? 2 : 3;
  const strengthLabel = ["", "Weak", "Good", "Strong"];
  const strengthColor = ["", "bg-red-500", "bg-yellow-400", "bg-emerald-500"];
  const strengthText  = ["", "text-red-500", "text-yellow-500", "text-emerald-500"];

  const fieldIcons = { fullName: User, email: Mail, password: Lock };

  return (
    <div className="min-h-full flex flex-col md:flex-row">

      {/* ── Left branding panel ──────────────────────────── */}
      <div className="hidden md:flex md:w-[44%] auth-left-panel relative overflow-hidden flex-col justify-center p-14 text-white">
        <div className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full opacity-25 animate-float-slow auth-orb-violet" />
        <div className="absolute -bottom-16 -left-16 w-[360px] h-[360px] rounded-full opacity-20 animate-float-medium auth-orb-cyan" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full opacity-10 animate-float-fast auth-orb-purple" />
        <div className="absolute inset-0 opacity-[0.04] auth-grid-overlay" />

        <div className="relative z-10 max-w-sm">
          <div className="w-14 h-14 rounded-2xl auth-logo-icon flex items-center justify-center mb-8 shadow-2xl">
            <span className="text-2xl font-black text-white">R</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight leading-none mb-3">Join Reon</h1>
          <p className="text-purple-300/80 text-[15px] leading-relaxed mb-6">
            Create your account and start messaging securely.{" "}
            <span className="text-cyan-300 font-semibold">Your keys, your privacy.</span>
          </p>

          <div className="space-y-4">
            {[
              { title: "Instant key generation", desc: "Your encryption keys are generated locally and never leave your device." },
              { title: "No data collection",     desc: "We don't sell, share, or analyse your messages or metadata." },
              { title: "Open standard crypto",   desc: "RSA-OAEP + AES-GCM — industry-standard, battle-tested encryption." },
            ].map(({ title, desc }) => (
              <div key={title} className="flex items-start gap-3 glass-panel rounded-xl px-4 py-3">
                <span className="text-cyan-400 font-black text-lg leading-none mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-purple-300/60 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[#f8f7ff] dark:bg-[#08081a]">
        <div className="w-full max-w-sm">

          <div className="flex justify-center mb-8 md:hidden">
            <div className="w-14 h-14 rounded-2xl auth-logo-icon flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl font-black">R</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Create account</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Join Reon for encrypted messaging</p>

          <form onSubmit={submit} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Full Name</label>
              <div className="relative">
                <fieldIcons.fullName size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="text" value={form.fullName} onChange={set("fullName")} required placeholder="Jane Doe"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-[#12122e] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Email</label>
              <div className="relative">
                <fieldIcons.email size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="email" value={form.email} onChange={set("email")} required placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-[#12122e] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Password</label>
              <div className="relative">
                <fieldIcons.password size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} required placeholder="Min. 8 characters"
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-white dark:bg-[#12122e] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3].map((l) => (
                      <div key={l} className={`h-1 flex-1 rounded-full transition-all ${strength >= l ? strengthColor[strength] : "bg-gray-200 dark:bg-gray-700"}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-semibold ${strengthText[strength]}`}>{strengthLabel[strength]}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm px-4 py-2.5 rounded-xl">
                <span>⚠</span> {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-gradient w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 shadow-lg shadow-violet-600/25">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Creating account…
                </span>
              ) : "Create Account"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-white/6" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-[#f8f7ff] dark:bg-[#08081a] text-xs text-gray-400">Or continue with</span>
            </div>
          </div>

          <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"}/auth/google`}
            className="w-full py-3 rounded-xl bg-white dark:bg-[#12122e] border border-gray-200 dark:border-white/[0.07] hover:bg-gray-50 dark:hover:bg-[#1a1a40] text-gray-900 dark:text-white font-semibold text-sm transition-all flex items-center justify-center gap-2.5 shadow-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </a>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
