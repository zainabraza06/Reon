"use client";
import { useState, useRef, ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, Save, Lock, Smartphone, Link as LinkIcon, LogOut } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName]         = useState(user?.fullName || "");
  const [bio, setBio]           = useState(user?.bio || "");
  const [location, setLocation] = useState(user?.location || "");
  const [avatar, setAvatar]     = useState<File | null>(null);
  const [preview, setPreview]   = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg]       = useState("");

  const [curPw, setCurPw]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg]       = useState("");

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatar(f);
    setPreview(URL.createObjectURL(f));
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg("");
    try {
      const fd = new FormData();
      fd.append("fullName", name);
      fd.append("bio", bio);
      fd.append("location", location);
      if (avatar) fd.append("profilePic", avatar);
      await api.settings.updateProfile(fd);
      await refreshUser();
      setProfileMsg("Profile updated!");
      setAvatar(null);
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setProfileSaving(false);
    }
  };

  const hasPassword = user?.hasPassword ?? true;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { setPwMsg("Password must be at least 8 characters"); return; }
    if (hasPassword && !curPw) { setPwMsg("Current password is required"); return; }

    setPwSaving(true);
    setPwMsg("");
    try {
      await api.settings.changePassword({ currentPassword: curPw, newPassword: newPw });
      setPwMsg(hasPassword ? "Password changed!" : "Password set successfully!");
      setCurPw("");
      setNewPw("");
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  if (!user) return null;

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/6 bg-white dark:bg-[#12122e] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all";

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e] overflow-y-auto">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto w-full p-4 sm:p-6 space-y-8">
        {/* Profile section */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">Profile</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-violet-200 dark:ring-violet-500/30">
                  {preview ? (
                    <Image src={preview} alt="Avatar" width={80} height={80} className="object-cover w-full h-full" unoptimized />
                  ) : (
                    <Avatar src={user.profilePic} name={user.fullName} size={80} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 btn-gradient rounded-full flex items-center justify-center text-white shadow-md"
                  title="Change avatar"
                >
                  <Camera size={12} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{user.fullName}</p>
                <p className="text-sm text-gray-400">@{user.username || user.email}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                placeholder="A little about yourself…"
                className={`${inputCls} resize-none`} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" className={inputCls} />
            </div>

            {profileMsg && (
              <p className={`text-sm font-medium ${profileMsg.includes("!") ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {profileMsg}
              </p>
            )}

            <button type="submit" disabled={profileSaving}
              className="btn-gradient flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 shadow-md shadow-violet-500/25 transition-all">
              <Save size={15} />
              {profileSaving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </section>

        <hr className="border-gray-200 dark:border-white/6" />

        {/* Linked devices section */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Smartphone size={14} />Linked Devices
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Use your account on another browser or device. Your encryption keys transfer securely via QR code — the server never sees your private key.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/settings/link-device"
              className="btn-gradient flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md shadow-violet-500/25 transition-all"
            >
              <LinkIcon size={15} />
              Link New Device
            </Link>
            <Link
              href="/link-device"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
            >
              <Smartphone size={15} />
              This is My New Device
            </Link>
          </div>
        </section>

        <hr className="border-gray-200 dark:border-white/6" />

        {/* Password section */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Lock size={14} />{hasPassword ? "Change Password" : "Set Password"}
          </h2>
          {!hasPassword && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              You signed in with Google and do not have a password yet. Set one here to enable email/password login.
            </p>
          )}
          <form onSubmit={changePassword} className="space-y-4">
            {hasPassword && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Current Password</label>
                <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Enter current password" className={inputCls} />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">New Password</label>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required placeholder="Min. 8 characters" className={inputCls} />
            </div>

            {pwMsg && (
              <p className={`text-sm font-medium ${pwMsg.includes("!") ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {pwMsg}
              </p>
            )}

            <button type="submit" disabled={pwSaving}
              className="btn-gradient flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 shadow-md shadow-violet-500/25 transition-all">
              <Lock size={15} />
              {pwSaving ? "Updating…" : hasPassword ? "Update Password" : "Set Password"}
            </button>
          </form>
        </section>

        <hr className="border-gray-200 dark:border-white/6" />

        {/* Logout section */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">Session</h2>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-all shadow-md shadow-red-500/25"
          >
            <LogOut size={15} />
            Logout
          </button>
        </section>
      </div>
    </div>
  );
}
