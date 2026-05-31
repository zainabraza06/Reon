import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "Reon – Encrypted Messaging",
  description: "Secure, end-to-end encrypted messaging",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full bg-gray-50 dark:bg-gray-950 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
