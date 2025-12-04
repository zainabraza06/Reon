// src/utils/crypto.js
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
const KEY_LENGTH = 32; // 256-bit

// Use process.env.ENCRYPTION_KEY as base64-encoded 32 byte key
const getKey = () => {
  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) return null;
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_LENGTH) throw new Error("ENCRYPTION_KEY must be base64 32 bytes");
  return key;
};

export const encryptText = (plain) => {
  const key = getKey();
  if (!key) throw new Error("Encryption key not configured");

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // store as base64 JSON string
  const payload = {
    v: 1,
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    data: ciphertext.toString("base64")
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

export const decryptText = (payloadB64) => {
  const key = getKey();
  if (!key) throw new Error("Encryption key not configured");

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
  } catch (err) {
    throw new Error("Invalid encrypted payload");
  }

  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");

  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
};

// helper that returns original value if encryption not configured
export const encryptIfEnabled = (text) => {
  if (!process.env.ENCRYPTION_KEY) return text;
  if (!text) return text;
  return encryptText(text);
};

export const decryptIfEnabled = (cipherString) => {
  if (!process.env.ENCRYPTION_KEY) return cipherString;
  if (!cipherString) return cipherString;
  return decryptText(cipherString);
};
