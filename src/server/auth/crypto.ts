import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// One secret (SESSION_SECRET) protects everything: the key made from it encrypts ("seals") the
// short-lived Google sign-in cookie, people's saved API keys and the notification signing key.
// Never commit it; never change it once people have saved keys (they'd have to enter them again).
//
// Two tools are used here, and they do different jobs:
//   - SHA-256 is a one-way fingerprint. Session and helper tokens are stored only as their
//     fingerprint: the server can check a token it's shown, but nobody can turn the database back
//     into a token.
//   - AES-256-GCM is two-way encryption. API keys must be read back to be used, so they're
//     encrypted, not fingerprinted. GCM also detects tampering: a changed value fails to decrypt.

function rootSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (at least 32 random characters) before running in production.");
  }
  return "dev-only-secret-change-me-dev-only-secret";
}

/** A 32-byte key for one purpose, made from the root secret (AES-256 needs exactly 32 bytes). */
const keyFor = (purpose: string) => createHash("sha256").update(`${purpose}:${rootSecret()}`).digest();

/** One-way fingerprint, as 64 hex characters. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** A random, URL-safe token (session cookies, OAuth state, laptop-helper tokens). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/**
 * AES-256-GCM. Output: iv.tag.ciphertext (base64url).
 * iv: 12 random bytes, new for every value, so the same text never encrypts the same way twice.
 * tag: GCM's proof that the ciphertext wasn't altered.
 */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor("secrets"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** The original text, or null when it was tampered with or encrypted under a different SESSION_SECRET. */
export function decrypt(sealed: string): string | null {
  try {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", keyFor("secrets"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Seal a small JSON value so the browser can carry it but not read or change it (OAuth state cookie). */
export const seal = (value: unknown) => encrypt(JSON.stringify(value));
export function unseal<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  const plain = decrypt(sealed);
  try {
    return plain ? (JSON.parse(plain) as T) : null;
  } catch {
    return null;
  }
}
