"use client";
import { useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function OnboardingPage() {
  const { refreshUser } = useAuth();
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("");
  const [bio, setBio]           = useState("");
  const [location, setLocation] = useState("");
  const [avatar, setAvatar]     = useState<File | null>(null);
  const [preview, setPreview]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatar(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError("Username is required"); return; }
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("username", username.trim());
      fd.append("nativeLanguage", nativeLanguage.trim());
      fd.append("bio", bio);
      fd.append("location", location);
      if (avatar) fd.append("profilePic", avatar);
      await api.auth.onboard(fd);
      await refreshUser();
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/6 bg-white dark:bg-[#12122e] text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all";

  return (
    <div className="min-h-full flex items-center justify-center bg-[#f8f7ff] dark:bg-[#08081a] px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl auth-logo-icon shadow-lg shadow-violet-600/30 mb-4">
            <span className="text-white text-2xl font-black">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set up your profile</h1>
          <p className="text-sm text-gray-400 mt-1">Tell others who you are</p>
        </div>

        <form onSubmit={submit} className="bg-white dark:bg-[#12122e] rounded-2xl shadow-lg dark:shadow-none border border-gray-100 dark:border-white/6 p-6 sm:p-8 space-y-5">
          {/* Avatar picker */}
          <div className="flex justify-center">
            <div className="relative">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-full bg-gray-100 dark:bg-[#1a1a3a] overflow-hidden ring-2 ring-violet-200 dark:ring-violet-500/30 flex items-center justify-center cursor-pointer hover:ring-violet-400 transition-all"
                title="Upload profile picture"
              >
                {preview ? (
                  <Image src={preview} alt="Avatar" width={80} height={80} className="object-cover w-full h-full" unoptimized />
                ) : (
                  <Camera size={24} className="text-gray-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 btn-gradient rounded-full flex items-center justify-center text-white shadow-md"
                title="Change photo"
              >
                <Camera size={12} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
              Username <span className="text-red-500">*</span>
            </label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required
              placeholder="johndoe" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
              Native language <span className="text-red-500">*</span>
            </label>
            <input value={nativeLanguage} onChange={(e) => setNativeLanguage(e.target.value)} required
              placeholder="English" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
              title="Bio" placeholder="A little about yourself…"
              className={`${inputCls} resize-none`} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country" className={inputCls} />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/40 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-2.5">
              <span>⚠</span> {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="btn-gradient w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 shadow-lg shadow-violet-600/25">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Saving…
              </span>
            ) : "Complete Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
