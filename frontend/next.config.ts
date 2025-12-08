import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   images: {
    domains: ['res.cloudinary.com'], 

    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;


