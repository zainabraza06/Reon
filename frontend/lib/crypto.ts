// End-to-end encryption using Web Crypto API
// Text: RSA-OAEP (per-message AES key encrypted with RSA) + AES-GCM for content
// Files: AES-GCM, key encrypted with RSA for each recipient

const DB_NAME = "reon-crypto";
const DB_VERSION = 1;
const STORE = "keys";

// ── IndexedDB for private key storage ─────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// ── Key generation & persistence ──────────────────────────────────────────────

export async function generateKeyPair(): Promise<{ publicKey: JsonWebKey; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  await dbPut("privateKey", pair.privateKey);
  await dbPut("publicKey", publicKey);
  return { publicKey, privateKey: pair.privateKey };
}

export async function getStoredPrivateKey(): Promise<CryptoKey | null> {
  try {
    const key = await dbGet<CryptoKey>("privateKey");
    return key ?? null;
  } catch {
    return null;
  }
}

export async function getStoredPublicKey(): Promise<JsonWebKey | null> {
  try {
    const key = await dbGet<JsonWebKey>("publicKey");
    return key ?? null;
  } catch {
    return null;
  }
}

export async function hasKeyPair(): Promise<boolean> {
  const [priv, pub] = await Promise.all([getStoredPrivateKey(), getStoredPublicKey()]);
  return !!(priv && pub);
}

export async function clearKeys(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── RSA import ────────────────────────────────────────────────────────────────

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

// ── AES helpers ───────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToUint8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function aesEncrypt(key: CryptoKey, data: Uint8Array): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, data as unknown as BufferSource);
  return { ciphertext: new Uint8Array(ciphertext), iv };
}

async function aesDecrypt(key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ciphertext as unknown as BufferSource);
  return new Uint8Array(plain);
}

async function rsaEncryptKey(aesKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", aesKey);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, raw);
  return uint8ToBase64(new Uint8Array(encrypted));
}

async function rsaDecryptKey(encryptedKeyB64: string, privateKey: CryptoKey): Promise<CryptoKey> {
  const encrypted = base64ToUint8(encryptedKeyB64);
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encrypted as unknown as BufferSource);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ── Text encryption (1:1 messages) ───────────────────────────────────────────

export interface EncryptedText {
  ciphertext: string;  // base64 AES-GCM encrypted text (includes IV prefix)
  encryptedKey: string;      // RSA-encrypted AES key for receiver
  senderEncryptedKey: string; // RSA-encrypted AES key for sender
}

export async function encryptText(
  plaintext: string,
  receiverPublicKeyJwk: JsonWebKey,
  senderPublicKeyJwk: JsonWebKey
): Promise<EncryptedText> {
  const [receiverKey, senderKey] = await Promise.all([
    importPublicKey(receiverPublicKeyJwk),
    importPublicKey(senderPublicKeyJwk),
  ]);

  const aesKey = await generateAESKey();
  const encoded = new TextEncoder().encode(plaintext);
  const { ciphertext, iv } = await aesEncrypt(aesKey, encoded);

  // Prepend IV to ciphertext so decryption can extract it
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);

  const [encryptedKey, senderEncryptedKey] = await Promise.all([
    rsaEncryptKey(aesKey, receiverKey),
    rsaEncryptKey(aesKey, senderKey),
  ]);

  return { ciphertext: uint8ToBase64(combined), encryptedKey, senderEncryptedKey };
}

export async function decryptText(
  ciphertextB64: string,
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<string> {
  const combined = base64ToUint8(ciphertextB64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const aesKey = await rsaDecryptKey(encryptedKeyB64, privateKey);
  const plain = await aesDecrypt(aesKey, ciphertext, iv);
  return new TextDecoder().decode(plain);
}

// ── File encryption ───────────────────────────────────────────────────────────

export interface EncryptedFile {
  encryptedBuffer: ArrayBuffer;
  encryptionIV: string;        // base64 IV
  encryptedKey: string;        // RSA-encrypted AES key for receiver
  senderEncryptedKey: string;
}

export async function encryptFile(
  fileBuffer: ArrayBuffer,
  receiverPublicKeyJwk: JsonWebKey,
  senderPublicKeyJwk: JsonWebKey
): Promise<EncryptedFile> {
  const [receiverKey, senderKey] = await Promise.all([
    importPublicKey(receiverPublicKeyJwk),
    importPublicKey(senderPublicKeyJwk),
  ]);

  const aesKey = await generateAESKey();
  const { ciphertext, iv } = await aesEncrypt(aesKey, new Uint8Array(fileBuffer));

  const [encryptedKey, senderEncryptedKey] = await Promise.all([
    rsaEncryptKey(aesKey, receiverKey),
    rsaEncryptKey(aesKey, senderKey),
  ]);

  return {
    encryptedBuffer: ciphertext.buffer as ArrayBuffer,
    encryptionIV: uint8ToBase64(iv),
    encryptedKey,
    senderEncryptedKey,
  };
}

export async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  encryptedKeyB64: string,
  ivB64: string,
  privateKey: CryptoKey
): Promise<ArrayBuffer> {
  const iv = base64ToUint8(ivB64);
  const aesKey = await rsaDecryptKey(encryptedKeyB64, privateKey);
  const plain = await aesDecrypt(aesKey, new Uint8Array(encryptedBuffer), iv);
  return plain.buffer as ArrayBuffer;
}

// ── Device-linking key transfer (ECDH handshake) ─────────────────────────────
// Device A and B each generate a temporary ECDH key pair.
// They exchange public keys via the server and derive the same AES-GCM key.
// Device A encrypts its RSA private key JWK with that AES key and uploads it.
// Device B downloads, decrypts, and imports the RSA private key.

export async function generateECDHKeyPair(): Promise<{ publicKey: JsonWebKey; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { publicKey, privateKey: pair.privateKey };
}

export async function importECDHPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

export async function deriveTransferAESKey(myPrivateKey: CryptoKey, theirPublicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function exportRSAPrivateKey(privateKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", privateKey);
}

export async function importRSAPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"],
  );
}

export async function encryptForTransfer(
  data: JsonWebKey,
  aesKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
  return { ciphertext: uint8ToBase64(new Uint8Array(ciphertext)), iv: uint8ToBase64(iv) };
}

export async function decryptFromTransfer(
  ciphertext: string,
  iv: string,
  aesKey: CryptoKey,
): Promise<JsonWebKey> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToUint8(iv) },
    aesKey,
    base64ToUint8(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as JsonWebKey;
}

// ── Group message encryption ──────────────────────────────────────────────────

export interface GroupEncryptedText {
  ciphertext: string;
  memberKeys: { userId: string; encryptedKey: string }[];
}

export async function encryptGroupText(
  plaintext: string,
  members: { userId: string; publicKey: JsonWebKey }[]
): Promise<GroupEncryptedText> {
  const aesKey = await generateAESKey();
  const encoded = new TextEncoder().encode(plaintext);
  const { ciphertext, iv } = await aesEncrypt(aesKey, encoded);

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);

  const memberKeys = await Promise.all(
    members.map(async ({ userId, publicKey }) => {
      const cryptoKey = await importPublicKey(publicKey);
      const encryptedKey = await rsaEncryptKey(aesKey, cryptoKey);
      return { userId, encryptedKey };
    })
  );

  return { ciphertext: uint8ToBase64(combined), memberKeys };
}

export async function decryptGroupText(
  ciphertextB64: string,
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<string> {
  // Same structure as 1:1 — IV is prepended
  return decryptText(ciphertextB64, encryptedKeyB64, privateKey);
}
