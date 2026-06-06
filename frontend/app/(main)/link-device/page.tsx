"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Loader, CheckCircle, Camera } from "lucide-react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import {
  generateECDHKeyPair,
  importECDHPublicKey,
  deriveTransferAESKey,
  importRSAPrivateKey,
  decryptFromTransfer,
} from "@/lib/crypto";

// Write keys directly into IndexedDB — bypasses generateKeyPair to avoid
// creating a new pair; we're overwriting with the transferred key.
async function overwriteStoredKeys(privateKey: CryptoKey, publicKey: JsonWebKey) {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("reon-crypto", 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      store.put(privateKey, "privateKey");
      store.put(publicKey, "publicKey");
      tx.oncomplete = () => resolve();
      tx.onerror   = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── QR Scanner ───────────────────────────────────────────────────────────────

function extractD(urlOrRaw: string): string | null {
  // Try as full URL (from camera scan / copy-pasted link)
  try {
    const url = new URL(urlOrRaw, window.location.origin);
    const d = url.searchParams.get("d");
    if (d) return d;
  } catch {}
  // Try as raw base64 payload
  try {
    const parsed = JSON.parse(atob(decodeURIComponent(urlOrRaw)));
    if (parsed.sessionId && parsed.ecdhPublicKey) return urlOrRaw;
  } catch {}
  return null;
}

function QRScanner({ onScanned }: { onScanned: (d: string) => void }) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [cameraErr, setCameraErr]   = useState("");
  const [manualInput, setManualInput] = useState("");
  const [manualErr, setManualErr]   = useState("");

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setCameraErr("QR scanning is not supported in this browser. Paste the link below instead.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes: { rawValue: string }[] = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              stopCamera();
              const d = extractD(codes[0].rawValue);
              if (d) onScanned(d);
              else setCameraErr("Unrecognised QR code. Regenerate from Settings → Link New Device on your original device.");
            }
          } catch {/* frame not ready */}
        }, 500);
      })
      .catch(() => {
        setCameraErr("Camera access denied. Paste the link from your original device below.");
      });

    return stopCamera;
  }, [onScanned, stopCamera]);

  const handleManual = () => {
    setManualErr("");
    const d = extractD(manualInput.trim());
    if (d) { stopCamera(); onScanned(d); }
    else setManualErr("Invalid link. Paste the full URL or token from your original device.");
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e]">
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Link This Device</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl btn-gradient flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Camera size={28} className="text-white" />
          </div>

          <div className="text-center space-y-2">
            <p className="text-lg font-bold text-gray-900 dark:text-white">Scan QR on Your Original Device</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your encryption keys live on another device.
              On that device open <strong>Settings → Link New Device</strong>, then point this camera at the QR code.
            </p>
          </div>

          {/* Camera feed */}
          {!cameraErr && (
            <div className="relative w-64 h-64 rounded-2xl overflow-hidden bg-black ring-2 ring-violet-500/40 shadow-lg">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {/* Targeting frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-44 border-2 border-white/70 rounded-xl" />
              </div>
            </div>
          )}

          {cameraErr && (
            <p className="text-sm text-amber-600 dark:text-amber-400 text-center bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
              {cameraErr}
            </p>
          )}

          {/* Manual / paste fallback */}
          <div className="w-full space-y-2">
            <p className="text-xs text-center text-gray-400">Or paste the link from your original device</p>
            <div className="flex gap-2">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManual()}
                placeholder="Paste link here…"
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#12122e] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={handleManual}
                className="btn-gradient px-4 py-2 rounded-xl text-white text-sm font-semibold"
              >
                Go
              </button>
            </div>
            {manualErr && <p className="text-xs text-red-500">{manualErr}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Device link processor (runs after QR data is available) ──────────────────

type Step = "parsing" | "claiming" | "waiting" | "importing" | "done" | "error";

function LinkDeviceProcessor({ rawData }: { rawData: string }) {
  const { user } = useAuth();
  const [step, setStep]   = useState<Step>("parsing");
  const [error, setError] = useState("");
  const sessionRef = useRef<{
    sessionId: string;
    ecdhPrivateKey: CryptoKey;
    ecdhPublicKey_A: JsonWebKey;
  } | null>(null);

  const receiveKey = useCallback(async (sid: string) => {
    const ref = sessionRef.current;
    if (!ref || ref.sessionId !== sid) return;
    try {
      setStep("importing");
      const { encryptedPrivateKey, iv } = await api.keys.getLinkSession(sid);
      if (!encryptedPrivateKey || !iv) throw new Error("Key data missing from server");

      const theirPub  = await importECDHPublicKey(ref.ecdhPublicKey_A);
      const sharedKey = await deriveTransferAESKey(ref.ecdhPrivateKey, theirPub);
      const rsaJwk    = await decryptFromTransfer(encryptedPrivateKey, iv, sharedKey);
      const privateKey = await importRSAPrivateKey(rsaJwk);

      const { publicKey } = await api.keys.get(user!._id);
      await overwriteStoredKeys(privateKey, publicKey);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("error");
    }
  }, [user]);

  useEffect(() => {
    const onReady = (data: unknown) => {
      const { sessionId: sid } = data as { sessionId: string };
      void receiveKey(sid);
    };
    socketService.on("device-link-ready", onReady);
    return () => socketService.off("device-link-ready", onReady);
  }, [receiveKey]);

  useEffect(() => {
    (async () => {
      try {
        setStep("parsing");
        const { sessionId: sid, ecdhPublicKey: ecdhPubKeyA } = JSON.parse(
          atob(decodeURIComponent(rawData))
        ) as { sessionId: string; ecdhPublicKey: JsonWebKey };

        setStep("claiming");
        const { publicKey: ecdhPubKeyB, privateKey: ecdhPrivKeyB } = await generateECDHKeyPair();
        await api.keys.claimLinkSession(sid, ecdhPubKeyB);

        sessionRef.current = { sessionId: sid, ecdhPrivateKey: ecdhPrivKeyB, ecdhPublicKey_A: ecdhPubKeyA };
        setStep("waiting");

        const poll = setInterval(async () => {
          try {
            const res = await api.keys.getLinkSession(sid);
            if (res.status === "ready") { clearInterval(poll); await receiveKey(sid); }
          } catch { clearInterval(poll); }
        }, 2000);
        setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start");
        setStep("error");
      }
    })();
  }, [rawData, receiveKey]);

  if (!user) return null;

  const messages: Record<Step, string> = {
    parsing:  "Reading session data…",
    claiming: "Connecting to session…",
    waiting:  "Waiting for original device to confirm…",
    importing:"Importing encryption keys…",
    done:     "Keys transferred successfully!",
    error:    "Something went wrong",
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e]">
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Link This Device</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">

          {step !== "done" && step !== "error" && (
            <div className="w-20 h-20 rounded-2xl btn-gradient flex items-center justify-center shadow-lg shadow-violet-500/25">
              <ShieldCheck size={36} className="text-white" />
            </div>
          )}

          {step === "done" && <CheckCircle size={72} className="text-emerald-500" />}

          <div className="text-center space-y-2">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{messages[step]}</p>

            {step === "waiting" && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                On your original device, open <strong>Settings → Link New Device</strong> and approve the request.
              </p>
            )}

            {step === "done" && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                All your messages are now accessible on this device.
              </p>
            )}

            {step === "error" && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>

          {(step === "parsing" || step === "claiming" || step === "waiting" || step === "importing") && (
            <Loader size={28} className="text-violet-500 animate-spin" />
          )}

          {step === "done" && (
            <button
              type="button"
              // Full reload so AuthContext re-runs setupKeys with the new local keys
              onClick={() => { window.location.href = "/chat"; }}
              className="btn-gradient px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow-md shadow-violet-500/25"
            >
              Start Messaging
            </button>
          )}

          {step === "error" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 text-sm font-semibold"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────

function LinkDeviceInner() {
  const params = useSearchParams();
  const [scannedData, setScannedData] = useState<string | null>(params.get("d"));

  // Once the scanner hands us the raw base64 payload (or the URL contained it),
  // render the processor which handles ECDH + key import.
  if (scannedData) return <LinkDeviceProcessor rawData={scannedData} />;
  return <QRScanner onScanned={setScannedData} />;
}

export default function LinkDevicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader size={28} className="text-violet-500 animate-spin" />
        </div>
      }
    >
      <LinkDeviceInner />
    </Suspense>
  );
}
