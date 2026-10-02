import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// One secret (SESSION_SECRET) protects everything: it signs short-lived OAuth state and is
// the root of the key that encrypts people's API keys. Never commit it; never change it
// once people have saved keys (they'd have to enter them again).

function rootSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (at least 32 random characters) before running in production.");
  }
  return "dev-only-secret-change-me-dev-only-secret";
}

const keyFor = (purpose: string) => createHash("sha256").update(`${purpose}:${rootSecret()}`).digest();

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** A random, URL-safe token (session ids, OAuth state). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor("secrets"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

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
