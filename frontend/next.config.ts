import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Cloudinary (profile pictures)
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Avatar service used by Google OAuth fallback
      { protocol: "https", hostname: "avatar.iran.liara.run" },
      // Google profile photos
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // No rewrites needed — api.ts already uses NEXT_PUBLIC_API_URL directly.
  // Adding rewrites here would strip the /api prefix and break every request.
};

export default nextConfig;
