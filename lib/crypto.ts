import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM helper for storing LLM / Google API keys at rest.
// Format on disk (base64-encoded): IV(12) | TAG(16) | CIPHERTEXT(...)
// The 32-byte master key is read from APP_ENC_KEY (base64 string in .env).

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const raw = process.env.APP_ENC_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENC_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `APP_ENC_KEY must decode to 32 bytes (got ${key.length}). Regenerate with \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptString(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Ciphertext too short — corrupted or wrong format");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Mask a stored key for display. Returns the last 4 chars so users can confirm
// they uploaded the right key without revealing the secret.
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 4) return "•".repeat(plaintext.length);
  return `••••••••${plaintext.slice(-4)}`;
}
