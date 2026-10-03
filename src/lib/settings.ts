import "server-only";
import { and, eq } from "drizzle-orm";
import { decrypt, encrypt } from "./auth/crypto";
import { getDb, schema } from "./db";
import { scheduleChanged } from "./core/schedule";
import { DEFAULT_PREFERENCES, DEFAULT_PROFILE, type Preferences, type Profile } from "./types";

// Every person's profile, preferences and state live under their user id.
// App-wide state (shared job pool, company site health) uses GLOBAL ("").
export const GLOBAL = "";

async function getValue<T>(userId: string, key: string): Promise<T | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.userId, userId), eq(schema.settings.key, key)));
  return (row?.value as T) ?? null;
}

async function setValue(userId: string, key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ userId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.settings.userId, schema.settings.key], set: { value, updatedAt: new Date() } });
}

export async function getProfile(userId: string): Promise<Profile> {
  const saved = (await getValue<Partial<Profile>>(userId, "profile")) ?? {};
  return { ...DEFAULT_PROFILE, ...saved, skills: { ...DEFAULT_PROFILE.skills, ...saved.skills } };
}

export const saveProfile = (userId: string, p: Profile) => setValue(userId, "profile", p);

export async function getPreferences(userId: string): Promise<Preferences> {
  const saved = (await getValue<Partial<Preferences>>(userId, "preferences")) ?? {};
  return { ...DEFAULT_PREFERENCES, ...saved };
}

export async function savePreferences(userId: string, p: Preferences): Promise<void> {
  await setValue(userId, "preferences", p);
  scheduleChanged(); // the fetch period may have changed
}

/** Small bits of a person's state, e.g. when their morning digest was last sent. */
export const getState = <T>(userId: string, key: string) => getValue<T>(userId, `state:${key}`);
export const setState = (userId: string, key: string, value: unknown) => setValue(userId, `state:${key}`, value);

// ---------- Each person's own API keys (encrypted) ----------

export const SECRET_NAMES = ["jsearchKey", "telegramBotToken", "telegramChatId"] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export type Secrets = Partial<Record<SecretName, string>>;

export async function getSecrets(userId: string): Promise<Secrets> {
  const db = await getDb();
  const rows = await db.select().from(schema.userSecrets).where(eq(schema.userSecrets.userId, userId));
  const out: Secrets = {};
  for (const r of rows) {
    const plain = decrypt(r.value);
    if (plain && (SECRET_NAMES as readonly string[]).includes(r.name)) out[r.name as SecretName] = plain;
  }
  return out;
}

export async function setSecret(userId: string, name: SecretName, value: string): Promise<void> {
  const db = await getDb();
  const v = value.trim();
  if (!v) {
    await db.delete(schema.userSecrets).where(and(eq(schema.userSecrets.userId, userId), eq(schema.userSecrets.name, name)));
    return;
  }
  const sealed = encrypt(v);
  await db
    .insert(schema.userSecrets)
    .values({ userId, name, value: sealed, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.userSecrets.userId, schema.userSecrets.name], set: { value: sealed, updatedAt: new Date() } });
}

/** "••••••••a1b2": enough to recognise a key without showing it. */
export const maskSecret = (v: string | undefined) => (v ? `••••••••${v.slice(-4)}` : "");
