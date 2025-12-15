// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { CallProvider } from "@/context/CallContext";
import { GlobalNotifications } from "@/components/GlobalNotification";
import { UserInitializer } from "@/components/UserInitializer";

export const metadata: Metadata = {
  title: "Reon Messaging | Secure Team Communication",
  description: "Secure, lightning-fast, real-time messaging with end-to-end encryption.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NotificationProvider>
            <CallProvider>
              <UserInitializer />
              <GlobalNotifications />
              {children}
            </CallProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}