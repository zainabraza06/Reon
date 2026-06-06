import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";

export const metadata: Metadata = {
  title: "Reon – Encrypted Messaging",
  description: "Secure, end-to-end encrypted messaging",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full bg-gray-50 dark:bg-gray-950 antialiased">
        <AuthProvider>
          <NotificationProvider>
              {children}
            
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
