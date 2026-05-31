"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function OnboardingPage() {
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-950 dark:to-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set up your profile</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tell others who you are</p>
        </div>

        <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 space-y-5">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer border-2 border-indigo-200 dark:border-indigo-800"
                onClick={() => fileRef.current?.click()}
              >
                {preview ? (
                  <Image src={preview} alt="Avatar" width={80} height={80} className="object-cover w-full h-full" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera size={24} className="text-gray-400" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow"
              >
                <Camera size={12} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Username *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="johndoe"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="A little about yourself…"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving…" : "Complete Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
