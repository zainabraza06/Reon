"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield, CheckCircle, Loader } from "lucide-react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import {
  generateECDHKeyPair,
  importECDHPublicKey,
  deriveTransferAESKey,
  exportRSAPrivateKey,
  encryptForTransfer,
  getStoredPrivateKey,
} from "@/lib/crypto";

const SITE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Step = "generating" | "waiting" | "transferring" | "done" | "error";

export default function LinkDevicePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("generating");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const sessionRef = useRef<{ sessionId: string; ecdhPrivateKey: CryptoKey } | null>(null);

  const init = useCallback(async () => {
    try {
      setStep("generating");
      // 1. Generate ephemeral ECDH key pair for this device (A)
      const { publicKey: ecdhPubKeyA, privateKey: ecdhPrivKeyA } = await generateECDHKeyPair();

      // 2. Create session on server
      const { sessionId: sid } = await api.keys.createLinkSession(ecdhPubKeyA);
      sessionRef.current = { sessionId: sid, ecdhPrivateKey: ecdhPrivKeyA };
      setSessionId(sid);

      // 3. Build the URL Device B will open (encodes session ID + Device A's ECDH pub key)
      const payload = btoa(JSON.stringify({ sessionId: sid, ecdhPublicKey: ecdhPubKeyA }));
      const linkUrl = `${SITE_URL}/link-device?d=${encodeURIComponent(payload)}`;

      // 4. Generate QR code
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(linkUrl, { width: 260, margin: 2, color: { dark: "#1e1b4b", light: "#ffffff" } });
      setQrDataUrl(dataUrl);
      setStep("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setStep("error");
    }
  }, []);

  // When Device B claims the session, the server sends this socket event to Device A
  useEffect(() => {
    const onClaimed = async (data: unknown) => {
      const { sessionId: sid, ecdhPublicKey_B } = data as { sessionId: string; ecdhPublicKey_B: JsonWebKey };
      const ref = sessionRef.current;
      if (!ref || ref.sessionId !== sid) return;

      try {
        setStep("transferring");
        // Derive shared AES key from Device A's private ECDH + Device B's public ECDH
        const theirPub = await importECDHPublicKey(ecdhPublicKey_B);
        const sharedKey = await deriveTransferAESKey(ref.ecdhPrivateKey, theirPub);

        // Export RSA private key and encrypt it
        const rsaPrivKey = await getStoredPrivateKey();
        if (!rsaPrivKey) throw new Error("No private key in this browser");
        const rsaJwk = await exportRSAPrivateKey(rsaPrivKey);
        const { ciphertext, iv } = await encryptForTransfer(rsaJwk, sharedKey);

        // Upload encrypted key to server
        await api.keys.transferLinkKey(sid, ciphertext, iv);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transfer failed");
        setStep("error");
      }
    };

    socketService.on("device-link-claimed", onClaimed);
    return () => socketService.off("device-link-claimed", onClaimed);
  }, []);

  useEffect(() => { void init(); }, [init]);

  if (!user) return null;

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e]">
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0 flex items-center gap-3">
        <Link href="/settings" className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Link New Device</h1>
      </div>

      <div className="flex-1 overflow-y-auto flex items-start justify-center p-6">
        <div className="w-full max-w-sm space-y-6 mt-4">

          {/* Instructions */}
          <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-2xl p-4 text-sm text-violet-800 dark:text-violet-300 space-y-1">
            <p className="font-semibold">How to link your new device:</p>
            <ol className="list-decimal list-inside space-y-1 text-violet-700 dark:text-violet-400">
              <li>Log in on your new device</li>
              <li>Go to Settings → "Link from Existing Device"</li>
              <li>Scan the QR code below</li>
            </ol>
          </div>

          {/* QR Code area */}
          <div className="bg-white dark:bg-[#12122e] rounded-2xl border border-gray-200 dark:border-white/6 p-6 flex flex-col items-center gap-4 shadow-sm">

            {(step === "generating") && (
              <div className="w-[260px] h-[260px] flex items-center justify-center">
                <Loader size={32} className="text-violet-500 animate-spin" />
              </div>
            )}

            {(step === "waiting" || step === "transferring") && qrDataUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Scan to link device" width={260} height={260} className="rounded-xl" />
                <p className="text-xs text-gray-400 text-center font-mono break-all">{sessionId}</p>
              </>
            )}

            {step === "transferring" && (
              <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 text-sm font-medium">
                <Loader size={16} className="animate-spin" />
                Transferring keys securely…
              </div>
            )}

            {step === "done" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle size={48} className="text-emerald-500" />
                <p className="font-semibold text-gray-900 dark:text-white text-lg">Device Linked!</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Your new device now has your encryption keys. You can close this page.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/settings")}
                  className="btn-gradient px-5 py-2 rounded-xl text-white text-sm font-semibold mt-2"
                >
                  Back to Settings
                </button>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-red-500 font-semibold">Something went wrong</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{error}</p>
                <button
                  type="button"
                  onClick={() => void init()}
                  className="btn-gradient px-5 py-2 rounded-xl text-white text-sm font-semibold"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Security note */}
          {(step === "waiting" || step === "transferring") && (
            <div className="flex items-start gap-3 text-xs text-gray-500 dark:text-gray-400">
              <Shield size={14} className="shrink-0 mt-0.5 text-violet-400" />
              <span>
                Keys are encrypted end-to-end during transfer using ECDH+AES-GCM.
                The server never sees your private key. This QR expires in 5 minutes.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
