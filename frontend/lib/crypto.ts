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

  // Save to IndexedDB
  await saveKeyPair(userId, keyPair);

  // Upload ONLY the public key (backend expects: userId + publicKey)
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
// File encryption/decryption
// ------------------------
export async function decryptFile(
  encryptedFileUrl: string,
  encryptedAESKeyHex: string,
  userId: string
): Promise<{ decryptedBlob: Blob; fileName: string; mimeType: string }> {
  try {
    console.log('🔐 decryptFile called with URL:', encryptedFileUrl);
    
    // 1. Get the encrypted AES key and decrypt it
    const aesKey = await decryptAESKey(userId, encryptedAESKeyHex);

    // 2. Determine the correct backend URL
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
    let fullUrl = encryptedFileUrl;
    
    // If it's a relative URL (starts with /), prepend backend URL
    if (encryptedFileUrl.startsWith('/')) {
      fullUrl = `${backendUrl}${encryptedFileUrl}`;
    } 
    // If it contains localhost:3000, replace with backend URL
    else if (encryptedFileUrl.includes('localhost:3000')) {
      fullUrl = encryptedFileUrl.replace('localhost:3000', 'localhost:5001');
    }
    
    console.log('🔗 Fetching from:', fullUrl);
    
    // 3. Fetch the encrypted file from the server with authentication
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(fullUrl, {
      headers,
      credentials: 'include' // Include cookies if needed
    });
    
    if (!response.ok) {
      console.error('❌ Fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        url: fullUrl
      });
      throw new Error(`Failed to fetch encrypted file: HTTP ${response.status}`);
    }

    const encryptedBuffer = await response.arrayBuffer();
    console.log('📦 Received encrypted buffer size:', encryptedBuffer.byteLength, 'bytes');
    
    // 3. Extract IV from the encrypted data (first 12 bytes for AES-GCM)
    if (encryptedBuffer.byteLength < 12) {
      throw new Error('Encrypted data too short to contain IV');
    }
    
    const iv = encryptedBuffer.slice(0, 12);
    const ciphertext = encryptedBuffer.slice(12);
    
    console.log('🔑 Decrypting with AES-GCM, IV length:', iv.byteLength, 'Ciphertext length:', ciphertext.byteLength);

    // 4. Decrypt the file content
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      ciphertext
    );

    console.log('✅ Decryption successful, decrypted size:', decryptedBuffer.byteLength, 'bytes');

    // 5. Determine MIME type from response headers or fallback
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // 6. Extract filename from URL or response headers
    let fileName = 'decrypted_file';
    const contentDisposition = response.headers.get('content-disposition');
    
    if (contentDisposition) {
      const matches = contentDisposition.match(/filename="?([^"]+)"?/);
      if (matches && matches[1]) {
        fileName = matches[1];
      }
    } else {
      // Try to extract filename from URL
      const urlParts = encryptedFileUrl.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        // Remove query parameters if any
        fileName = lastPart.split('?')[0];
      }
    }

    // 7. Create blob from decrypted data
    const decryptedBlob = new Blob([decryptedBuffer], { type: contentType });

    console.log('📄 Decrypted file:', { fileName, mimeType: contentType, size: decryptedBlob.size });

    return {
      decryptedBlob,
      fileName,
      mimeType: contentType
    };

  } catch (error) {
    console.error('❌ File decryption failed:', error);
    throw new Error(`Failed to decrypt file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
// Alternative: Decrypt file from ArrayBuffer (for when you already have the encrypted data)
export async function decryptFileFromBuffer(
  encryptedBuffer: ArrayBuffer,
  encryptedAESKeyHex: string,
  userId: string,
  mimeType: string = 'application/octet-stream'
): Promise<{ decryptedBlob: Blob; fileName: string }> {
  try {
    // 1. Get the encrypted AES key and decrypt it
    const aesKey = await decryptAESKey(userId, encryptedAESKeyHex);

    // 2. Extract IV from the encrypted data (first 12 bytes for AES-GCM)
    const iv = encryptedBuffer.slice(0, 12);
    const ciphertext = encryptedBuffer.slice(12);

    // 3. Decrypt the file content
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      ciphertext
    );

    // 4. Create blob from decrypted data
    const decryptedBlob = new Blob([decryptedBuffer], { type: mimeType });

    return {
      decryptedBlob,
      fileName: `decrypted_file_${Date.now()}`
    };

  } catch (error) {
    console.error('File decryption from buffer failed:', error);
    throw new Error(`Failed to decrypt file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper to download decrypted file
export async function downloadDecryptedFile(
  encryptedFileUrl: string,
  encryptedAESKeyHex: string,
  userId: string,
  desiredFileName?: string
): Promise<void> {
  try {
    const { decryptedBlob, fileName, mimeType } = await decryptFile(
      encryptedFileUrl,
      encryptedAESKeyHex,
      userId
    );

    // Create download link
    const url = URL.createObjectURL(decryptedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = desiredFileName || fileName;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

// Buffer/Hex conversion helpers
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const matches = hex.match(/[\da-f]{2}/gi);
  if (!matches) {
    throw new Error('Invalid hex string');
  }
  return new Uint8Array(matches.map(h => parseInt(h, 16))).buffer;
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
  return crypto.subtle.importKey("raw", rawAES, { name: "AES-GCM" }, true, ["decrypt", "encrypt"]);
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
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function stringToAESKey(str: string): Promise<CryptoKey> {
  const binary = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", binary, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function encryptFileForRecipient(
  file: File,
  recipientPublicKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<{
  encryptedBlob: Blob;
  encryptedAESKeyForRecipient: string;
  encryptedAESKeyForSender: string;
}> {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const fileBuffer = await file.arrayBuffer();

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    fileBuffer
  );

  const fullBuffer = new Uint8Array(iv.byteLength + encryptedBuffer.byteLength);
  fullBuffer.set(iv, 0);
  fullBuffer.set(new Uint8Array(encryptedBuffer), iv.byteLength);

  const encryptedBlob = new Blob([fullBuffer], {
    type: "application/octet-stream"
  });

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

  const encryptedAESKeyForRecipientHex = Array.from(
    new Uint8Array(encryptedAESKeyForRecipientBuffer)
  )
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const encryptedAESKeyForSenderHex = Array.from(
    new Uint8Array(encryptedAESKeyForSenderBuffer)
  )
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    encryptedBlob,
    encryptedAESKeyForRecipient: encryptedAESKeyForRecipientHex,
    encryptedAESKeyForSender: encryptedAESKeyForSenderHex
  };
}

// Helper function to get MIME type from filename
export function getMimeTypeFromFilename(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop() || '';
  
  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'mkv': 'video/x-matroska',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'flac': 'audio/flac',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    'csv': 'text/csv',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}


// Helper to get from DB (renamed to avoid conflict)
async function getKeyPairFromDB(userId: string): Promise<StoredKeyPair | undefined> {
  const db = await initDB();
  return await db.get(STORE_NAME, userId);
}