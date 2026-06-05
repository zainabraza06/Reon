"use client";
import Image from "next/image";
import { useState } from "react";

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  isOnline?: boolean;
  className?: string;
}

// Palette of rich gradient pairs — one is chosen deterministically from the name
const GRADIENTS = [
  ["#7c3aed", "#a78bfa"], // violet
  ["#2563eb", "#60a5fa"], // blue
  ["#0891b2", "#67e8f9"], // cyan
  ["#059669", "#6ee7b7"], // emerald
  ["#d97706", "#fcd34d"], // amber
  ["#dc2626", "#f87171"], // red
  ["#db2777", "#f9a8d4"], // pink
  ["#7c3aed", "#38bdf8"], // violet-sky
  ["#ea580c", "#fbbf24"], // orange
  ["#4f46e5", "#818cf8"], // indigo
];

function getGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index] as [string, string];
}

export default function Avatar({ src, name = "?", size = 40, isOnline, className = "" }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [from, to] = getGradient(name);

  const showImage = src && !imgError;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {showImage ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover w-full h-full"
          unoptimized
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-white font-bold select-none"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.38,
            background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
            letterSpacing: "0.02em",
          }}
        >
          {initials}
        </div>
      )}
      {isOnline !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-white dark:border-[#0f0f28] ${isOnline ? "bg-emerald-400" : "bg-gray-400"}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}
