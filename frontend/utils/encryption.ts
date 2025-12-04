// functions/encryptFile.ts


import { getKeyPair } from "@/lib/crypto";
export async function generateAESKey(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32)); // 256-bit
  return Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function encryptFileWithAES(file: File, aesKeyHex: string): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const keyBytes = new Uint8Array(aesKeyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM IV
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    arrayBuffer
  );

  // Prepend IV to the encrypted file
  const combined = new Uint8Array(iv.byteLength + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.byteLength);

  return new Blob([combined], { type: file.type });
}

export async function encryptAESKeyWithRSA(aesKeyHex: string, publicKeyJwk: JsonWebKey): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );

  const encodedKey = new TextEncoder().encode(aesKeyHex);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encodedKey
  );

  return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
}


export const EncryptionUtils = {
  // Get user's private key from IndexedDB
  async getPrivateKey(userId: string): Promise<CryptoKey | null> {
    try {
      const stored = await getKeyPair(userId);
      if (!stored) return null;

      return await window.crypto.subtle.importKey(
        "jwk",
        stored.privateKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"]
      );
    } catch (error) {
      console.error("Error importing private key:", error);
      return null;
    }
  },

  // Get user's public key from IndexedDB
  async getPublicKey(userId: string): Promise<CryptoKey | null> {
    try {
      const stored = await getKeyPair(userId);
      if (!stored) return null;

      return await window.crypto.subtle.importKey(
        "jwk",
        stored.publicKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
      );
    } catch (error) {
      console.error("Error importing public key:", error);
      return null;
    }
  },

  // Encrypt message with recipient's public key
  async encryptMessage(message: string, recipientPublicKey: CryptoKey): Promise<string> {
    try {
      const encoded = new TextEncoder().encode(message);
      const encrypted = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        recipientPublicKey,
        encoded
      );
      return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt message");
    }
  },

  // Decrypt message with user's private key
  async decryptMessage(userId: string, encryptedMessage: string): Promise<string> {
    try {
      const privateKey = await this.getPrivateKey(userId);
      if (!privateKey) {
        console.warn("No private key found, returning encrypted message");
        return encryptedMessage;
      }

      const encryptedData = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        encryptedData
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error("Decryption error:", error);
      return "🔒 Unable to decrypt message";
    }
  }
};
