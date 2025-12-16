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

  await saveKeyPair(userId, keyPair);
  const exportedPublic = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  
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
// RSA text encryption/decryption
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
// AES KEY ENCRYPTION/DECRYPTION (for file sharing)
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
  return crypto.subtle.importKey("raw", rawAES, { name: "AES-GCM" }, true, ["decrypt", "encrypt"]);
}

// ------------------------
// FILE ENCRYPTION (for sending)
// ------------------------
export async function encryptFileForRecipient(
  file: File,
  recipientPublicKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<{
  encryptedBlob: Blob;
  encryptedAESKeyForRecipient: string;
  encryptedAESKeyForSender: string;
  ivBase64: string;
}> {
  // 1. Generate AES key for this file
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Read file
  const fileBuffer = await file.arrayBuffer();

  // 3. Generate IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  // 4. Encrypt file with AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    fileBuffer
  );

  // 5. Create blob (encrypted data only, NO IV prepended)
  const encryptedBlob = new Blob([encryptedBuffer], {
    type: "application/octet-stream"
  });

  // 6. Encrypt AES key for recipient and sender
  const rawAES = await crypto.subtle.exportKey("raw", aesKey);

  const encryptedAESKeyForRecipientBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAES
  );

  const encryptedAESKeyForSenderBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    senderPublicKey,
    rawAES
  );

  // Convert to hex strings
  const encryptedAESKeyForRecipientHex = bufferToHex(encryptedAESKeyForRecipientBuffer);
  const encryptedAESKeyForSenderHex = bufferToHex(encryptedAESKeyForSenderBuffer);

  return {
    encryptedBlob,
    encryptedAESKeyForRecipient: encryptedAESKeyForRecipientHex,
    encryptedAESKeyForSender: encryptedAESKeyForSenderHex,
    ivBase64
  };
}

// ------------------------
// FILE DECRYPTION (for receiving)
// ------------------------
export async function decryptFile(
  encryptedFileUrl: string,
  encryptedAESKeyHex: string,
  userId: string
): Promise<{ decryptedBlob: Blob; fileName: string; mimeType: string }> {
  if (typeof window === 'undefined') {
    throw new Error('decryptFile can only be called in browser');
  }

  // 1. Decrypt AES key
  const aesKey = await decryptAESKey(userId, encryptedAESKeyHex);

  // 2. Construct URL
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://reon-4g0b.onrender.com';
  let fullUrl = encryptedFileUrl;
  
  if (encryptedFileUrl.startsWith('/')) {
    fullUrl = `${backendUrl}${encryptedFileUrl}`;
  } else if (/^[a-f\d]{24}$/i.test(encryptedFileUrl)) {
    fullUrl = `${backendUrl}/api/messages/media/${encryptedFileUrl}`;
  }

  // 3. Fetch file
  const response = await fetch(fullUrl, { credentials: 'include' });
  
  if (!response.ok) {
    if (response.status === 404) throw new Error('File not found');
    throw new Error(`Failed to fetch file: HTTP ${response.status}`);
  }

  // 4. Get IV from X-Encryption-IV header (backend always sends this)
  const ivHeader = response.headers.get('x-encryption-iv');
  if (!ivHeader) {
    throw new Error('Server did not provide encryption IV');
  }

  // Convert base64 IV to Uint8Array
  const ivBinary = atob(ivHeader);
  const iv = new Uint8Array(ivBinary.length);
  for (let i = 0; i < ivBinary.length; i++) {
    iv[i] = ivBinary.charCodeAt(i);
  }

  // 5. Read encrypted data
  const ciphertextBuffer = await response.arrayBuffer();

  // 6. Decrypt with AES-GCM
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    ciphertextBuffer
  );

  // 7. Get filename
  let fileName = 'decrypted_file';
  const fileNameHeader = response.headers.get('x-file-name');
  if (fileNameHeader) {
    fileName = decodeURIComponent(fileNameHeader);
  }

  // 8. Create blob
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const decryptedBlob = new Blob([decryptedBuffer], { type: contentType });

  return {
    decryptedBlob,
    fileName,
    mimeType: contentType
  };
}

// ------------------------
// Helper functions
// ------------------------
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const matches = hex.match(/[\da-f]{2}/gi);
  if (!matches) throw new Error('Invalid hex string');
  return new Uint8Array(matches.map(h => parseInt(h, 16))).buffer;
}

export async function downloadDecryptedFile(
  encryptedFileUrl: string,
  encryptedAESKeyHex: string,
  userId: string,
  desiredFileName?: string
): Promise<void> {
  const { decryptedBlob, fileName } = await decryptFile(
    encryptedFileUrl,
    encryptedAESKeyHex,
    userId
  );

  const url = URL.createObjectURL(decryptedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = desiredFileName || fileName;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function getMimeTypeFromFilename(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop() || '';
  
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
    'webp': 'image/webp', 'svg': 'image/svg+xml', 'bmp': 'image/bmp',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'avi': 'video/x-msvideo',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'm4a': 'audio/mp4',
    'pdf': 'application/pdf', 'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain', 'zip': 'application/zip'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}




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


export async function aesKeyToString(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function stringToAESKey(str: string): Promise<CryptoKey> {
  const binary = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", binary, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

