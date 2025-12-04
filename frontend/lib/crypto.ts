"use client";

import { openDB, IDBPDatabase } from "idb";
import { api } from "@/lib/api";

const DB_NAME = "chatKeysDB";
const STORE_NAME = "keys";

export interface StoredKeyPair {
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
}

// ------------------------
// IndexedDB helpers
// ------------------------
async function initDB(): Promise<IDBPDatabase> {
  return await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}






export async function saveKeyPair(userId: string, keyPair: CryptoKeyPair) {
  const db = await initDB();

  const exportedPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const exportedPublic = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  console.log(keyPair.privateKey);
  console.log(keyPair.publicKey);

  await db.put(STORE_NAME, { privateKey: exportedPrivate, publicKey: exportedPublic }, userId);
}

export async function getKeyPair(userId: string): Promise<StoredKeyPair | undefined> {
  const db = await initDB();
  return await db.get(STORE_NAME, userId);
}

// ------------------------
// RSA key management
// ------------------------
export async function generateRSAKeys(userId: string): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  // Save to IndexedDB
  await saveKeyPair(userId, keyPair);
 

  // Upload ONLY the public key (backend expects: userId + publicKey)
  const exportedPublic = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

   console.log(exportedPublic);

  await api.post("/keys/uploadPublicKey", {
    userId,
    publicKey: exportedPublic,
  });

  return keyPair;
}

export async function ensureRSAKeys(userId: string): Promise<CryptoKeyPair> {
  const existing = await getKeyPair(userId);

  if (existing) {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      existing.privateKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      existing.publicKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    return { privateKey, publicKey };
  }

  return await generateRSAKeys(userId);
}

// ------------------------
// RSA text encryption
// ------------------------
export async function encryptTextMessage(message: string, publicKey: CryptoKey): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export async function decryptTextMessage(encrypted: string, privateKey: CryptoKey): Promise<string> {
  const data = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, data);
  return new TextDecoder().decode(decrypted);
}

// ------------------------
// AES helpers
// ------------------------
export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWithAES(aesKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);

  const full = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  full.set(iv, 0);
  full.set(new Uint8Array(ciphertext), iv.byteLength);

  return btoa(String.fromCharCode(...full));
}

export async function decryptWithAES(aesKey: CryptoKey, ciphertextBase64: string): Promise<string> {
  const full = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));
  const iv = full.slice(0, 12);
  const data = full.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, data);
  return new TextDecoder().decode(decrypted);
}




// ------------------------
// AES helpers
// ------------------------
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2,"0")).join("");
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  return new Uint8Array(hex.match(/[\da-f]{2}/gi)!.map(h => parseInt(h,16))).buffer;
}


// ------------------------
// Encrypt/decrypt AES key with RSA
// ------------------------
export async function encryptAESKeyForRecipient(aesKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const rawAES = await crypto.subtle.exportKey("raw", aesKey);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, rawAES);
  return bufferToHex(encrypted);
}

export async function decryptAESKey(userId: string, encryptedHexKey: string): Promise<CryptoKey> {
  const keyPair = await getKeyPair(userId);
  if (!keyPair) throw new Error("No key pair found");

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    keyPair.privateKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );

  const encryptedBuffer = hexToArrayBuffer(encryptedHexKey);
  const rawAES = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedBuffer);
  return crypto.subtle.importKey("raw", rawAES, { name: "AES-GCM" }, true, ["decrypt"]);
}

// ------------------------
// Group message encryption
// ------------------------
export async function encryptGroupMessage(
  message: string,
  recipientIds: string[]
): Promise<{ ciphertext: string; encryptedKeys: { userId: string; key: string }[] }> {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt","decrypt"]);
  const ciphertext = await encryptWithAES(aesKey, message);

  const encryptedKeys: { userId: string; key: string }[] = [];
  for (const recipientId of recipientIds) {
    const recipientBundle = await api.get(`/keys/bundle/${recipientId}`).then(r=>r.data);
    const recipientPublicKey = await crypto.subtle.importKey(
      "jwk",
      recipientBundle.identityKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    const encryptedKeyHex = await encryptAESKeyForRecipient(aesKey, recipientPublicKey);
    encryptedKeys.push({ userId: recipientId, key: encryptedKeyHex });
  }

  return { ciphertext, encryptedKeys };
}

export async function decryptGroupMessage(
  userId: string,
  ciphertext: string,
  encryptedKeyForUser: string
): Promise<string> {
  const aesKey = await decryptAESKey(userId, encryptedKeyForUser);
  return await decryptWithAES(aesKey, ciphertext);
}



export async function aesKeyToString(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key); // ArrayBuffer
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}


export async function stringToAESKey(str: string): Promise<CryptoKey> {
  const binary = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", binary, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function rsaKeyToString(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function stringToRSAKey(
  str: string,
  usage: KeyUsage[],
  isPrivate: boolean
): Promise<CryptoKey> {
  const jwk = JSON.parse(str);
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    usage
  );
}
