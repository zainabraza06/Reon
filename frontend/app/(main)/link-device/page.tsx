"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Loader, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import {
  generateECDHKeyPair,
  importECDHPublicKey,
  deriveTransferAESKey,
  importRSAPrivateKey,
  decryptFromTransfer,
  getStoredPublicKey,
} from "@/lib/crypto";

// Store keys in IndexedDB (reuse the existing dbPut helper via dynamic import)
async function overwriteStoredKeys(privateKey: CryptoKey, publicKey: JsonWebKey) {
  const { generateKeyPair: _g, ...crypto } = await import("@/lib/crypto");
  void _g; // unused
  // We can't call dbPut directly (it's not exported), so we re-use generateKeyPair's
  // side-effect of storing keys by abusing a tiny inline IndexedDB write:
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("reon-crypto", 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      store.put(privateKey, "privateKey");
      store.put(publicKey, "publicKey");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  void crypto;
}

type Step = "parsing" | "claiming" | "waiting" | "importing" | "done" | "error";

function LinkDeviceInner() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("parsing");
  const [error, setError] = useState("");
  const sessionRef = useRef<{ sessionId: string; ecdhPrivateKey: CryptoKey; ecdhPublicKey_A: JsonWebKey } | null>(null);

  const receiveKey = useCallback(async (sid: string) => {
    const ref = sessionRef.current;
    if (!ref || ref.sessionId !== sid) return;
    try {
      setStep("importing");
      const { encryptedPrivateKey, iv } = await api.keys.getLinkSession(sid);
      if (!encryptedPrivateKey || !iv) throw new Error("Key data missing");

      // Derive same shared secret as Device A
      const theirPub = await importECDHPublicKey(ref.ecdhPublicKey_A);
      const sharedKey = await deriveTransferAESKey(ref.ecdhPrivateKey, theirPub);

      // Decrypt RSA private key JWK
      const rsaJwk = await decryptFromTransfer(encryptedPrivateKey, iv, sharedKey);
      const privateKey = await importRSAPrivateKey(rsaJwk);

      // Fetch own public key from server (Device A already uploaded it)
      const { publicKey } = await api.keys.get(user!._id);

      // Overwrite local keys in IndexedDB
      await overwriteStoredKeys(privateKey, publicKey);

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("error");
    }
  }, [user]);

  // Socket: Device A tells us the key is ready
  useEffect(() => {
    const onReady = (data: unknown) => {
      const { sessionId: sid } = data as { sessionId: string };
      void receiveKey(sid);
    };
    socketService.on("device-link-ready", onReady);
    return () => socketService.off("device-link-ready", onReady);
  }, [receiveKey]);

  const run = useCallback(async () => {
    try {
      setStep("parsing");
      const raw = params.get("d");
      if (!raw) throw new Error("No session data in URL. Ask Device A to regenerate the QR code.");

      const { sessionId: sid, ecdhPublicKey: ecdhPubKeyA } = JSON.parse(atob(decodeURIComponent(raw))) as {
        sessionId: string;
        ecdhPublicKey: JsonWebKey;
      };

      setStep("claiming");

      // Generate Device B's ephemeral ECDH key pair
      const { publicKey: ecdhPubKeyB, privateKey: ecdhPrivKeyB } = await generateECDHKeyPair();

      // Claim the session — server notifies Device A and returns Device A's ECDH pub key
      await api.keys.claimLinkSession(sid, ecdhPubKeyB);

      sessionRef.current = { sessionId: sid, ecdhPrivateKey: ecdhPrivKeyB, ecdhPublicKey_A: ecdhPubKeyA };
      setStep("waiting");

      // Poll every 2 s as fallback if socket event is missed
      const poll = setInterval(async () => {
        try {
          const res = await api.keys.getLinkSession(sid);
          if (res.status === "ready") {
            clearInterval(poll);
            await receiveKey(sid);
          }
        } catch { clearInterval(poll); }
      }, 2000);

      // Stop polling after 5 min (session TTL)
      setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setStep("error");
    }
  }, [params, receiveKey]);

  useEffect(() => { void run(); }, [run]);

  if (!user) return null;

  const messages: Record<Step, string> = {
    parsing:     "Reading QR code data…",
    claiming:    "Connecting to session…",
    waiting:     "Waiting for Device A to confirm…",
    importing:   "Importing encryption keys…",
    done:        "Done!",
    error:       "Something went wrong",
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f7ff] dark:bg-[#0c0c1e]">
      <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0f0f28] border-b border-gray-100 dark:border-white/6 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Link from Existing Device</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">

          {step !== "done" && step !== "error" && (
            <div className="w-20 h-20 rounded-2xl btn-gradient flex items-center justify-center shadow-lg shadow-violet-500/25">
              <ShieldCheck size={36} className="text-white" />
            </div>
          )}

          {step === "done" && (
            <CheckCircle size={72} className="text-emerald-500" />
          )}

          <div className="text-center space-y-2">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{messages[step]}</p>

            {step === "waiting" && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Open <strong>Settings → Link New Device</strong> on your existing device and approve the link.
              </p>
            )}

            {step === "done" && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your encryption keys are now synced. All your messages are accessible on this device.
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
              onClick={() => router.push("/chat")}
              className="btn-gradient px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow-md shadow-violet-500/25"
            >
              Start Messaging
            </button>
          )}

          {step === "error" && (
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 text-sm font-semibold"
            >
              Back to Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// useSearchParams requires Suspense boundary in Next.js app router
export default function LinkDevicePage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <Loader size={28} className="text-violet-500 animate-spin" />
      </div>
    }>
      <LinkDeviceInner />
    </Suspense>
  );
}
