import Image from "next/image";

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  isOnline?: boolean;
  className?: string;
}

export default function Avatar({ src, name = "?", size = 40, isOnline, className = "" }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover w-full h-full"
          unoptimized
        />
      ) : (
        <div
          className="rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold select-none"
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          {initials}
        </div>
      )}
      {isOnline !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-white ${isOnline ? "bg-green-400" : "bg-gray-400"}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}
