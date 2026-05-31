"use client";
import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Save, Lock } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.fullName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [location, setLocation] = useState(user?.location || "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { setPwMsg("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    setPwMsg("");
    try {
      await api.settings.changePassword({ currentPassword: curPw, newPassword: newPw });
      setPwMsg("Password changed!");
      setCurPw("");
      setNewPw("");
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-y-auto">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto w-full p-6 space-y-8">
        {/* Profile */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Profile</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden">
                  {preview ? (
                    <Image src={preview} alt="Avatar" width={80} height={80} className="object-cover w-full h-full" unoptimized />
                  ) : (
                    <Avatar src={user.profilePic} name={user.fullName} size={80} />
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
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{user.fullName}</p>
                <p className="text-sm text-gray-500">@{user.username || user.email}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {profileMsg && (
              <p className={`text-sm ${profileMsg.includes("!") ? "text-green-600" : "text-red-500"}`}>{profileMsg}</p>
            )}

            <button
              type="submit"
              disabled={profileSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {profileSaving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </section>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* Change Password */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lock size={16} />
            Change Password
          </h2>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
              <input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                placeholder="Min. 8 characters"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {pwMsg && (
              <p className={`text-sm ${pwMsg.includes("!") ? "text-green-600" : "text-red-500"}`}>{pwMsg}</p>
            )}

            <button
              type="submit"
              disabled={pwSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Lock size={15} />
              {pwSaving ? "Updating…" : "Update Password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
