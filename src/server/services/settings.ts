import "server-only";
import { and, eq } from "drizzle-orm";
import { decrypt, encrypt } from "../auth/crypto";
import { getDb, schema } from "../db";
import { scheduleChanged } from "@/shared/core/schedule";
import type { AnswerBank } from "@/shared/autofill";
import { DEFAULT_PREFERENCES, DEFAULT_PROFILE, type Preferences, type Profile } from "@/shared/types";
import { sanitizePreferences, sanitizeProfile } from "@/shared/validate";

// Every person's profile, preferences and state live under their user id.
// App-wide state (shared job pool, company site health) uses GLOBAL ("").
export const GLOBAL = "";

// The `settings` table is a key/value store: one row per (user, key), the value stored as JSON.
// getValue / setValue are the only code that touches it; everything below is a named use of them.
async function getValue<T>(userId: string, key: string): Promise<T | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.userId, userId), eq(schema.settings.key, key)));
  return (row?.value as T) ?? null;
}

/** Insert the row, or overwrite it when (user, key) already exists: an "upsert". */
async function setValue(userId: string, key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ userId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.settings.userId, schema.settings.key], set: { value, updatedAt: new Date() } });
}

/** The saved profile laid over the defaults, so a field added to the app later is never missing from an old profile. */
export async function getProfile(userId: string): Promise<Profile> {
  const saved = (await getValue<Partial<Profile>>(userId, "profile")) ?? {};
  return { ...DEFAULT_PROFILE, ...saved, skills: { ...DEFAULT_PROFILE.skills, ...saved.skills } };
}

/** Saved only after sanitizeProfile has rebuilt it: known fields, sane sizes. */
export const saveProfile = (userId: string, p: Profile) => setValue(userId, "profile", sanitizeProfile(p));

export async function getPreferences(userId: string): Promise<Preferences> {
  const saved = (await getValue<Partial<Preferences>>(userId, "preferences")) ?? {};
  // Checked on the way out as well as on the way in: the scheduler divides by the fetch period,
  // so a bad value saved before these checks existed must not reach it.
  return sanitizePreferences({ ...DEFAULT_PREFERENCES, ...saved });
}

export async function savePreferences(userId: string, p: Preferences): Promise<void> {
  await setValue(userId, "preferences", sanitizePreferences(p));
  scheduleChanged(); // the fetch period may have changed
}

/** Your answers to the questions application forms ask (Profile → Application answers). */
export async function getAnswerBank(userId: string): Promise<AnswerBank> {
  const saved = (await getValue<Partial<AnswerBank>>(userId, "answers")) ?? {};
  return { fields: { ...saved.fields }, learned: { ...saved.learned }, labels: { ...saved.labels } };
}

export const saveAnswerBank = (userId: string, bank: AnswerBank) => setValue(userId, "answers", bank);

/** Small bits of a person's state, e.g. when their morning digest was last sent. */
export const getState = <T>(userId: string, key: string) => getValue<T>(userId, `state:${key}`);
export const setState = (userId: string, key: string, value: unknown) => setValue(userId, `state:${key}`, value);

/** The admin's switch for Telegram alerts, for everyone (Admin page). On unless turned off. */
export const telegramEnabled = async () => (await getState<boolean>(GLOBAL, "telegramEnabled")) !== false;
export const setTelegramEnabled = (on: boolean) => setState(GLOBAL, "telegramEnabled", on);

// ---------- Each person's own API keys (encrypted) ----------

export const SECRET_NAMES = ["jsearchKey", "telegramBotToken", "telegramChatId"] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export type Secrets = Partial<Record<SecretName, string>>;
const SECRET_SHAPE: Record<SecretName, RegExp> = {
  jsearchKey: /^[A-Za-z0-9_-]{16,128}$/,
  telegramBotToken: /^\d{5,15}:[A-Za-z0-9_-]{20,80}$/,
  telegramChatId: /^(-?\d{1,20}|@[A-Za-z0-9_]{3,40})$/,
};

/** This person's keys, decrypted for use on the server. A key that can't be decrypted (SESSION_SECRET changed) is left out. */
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

/** Save one key, encrypted. An empty value deletes it. */
export async function setSecret(userId: string, name: SecretName, value: string): Promise<void> {
  const db = await getDb();
  const v = value.trim();
  // A key is one short run of visible characters. Refusing anything else keeps spaces, line
  // breaks and path characters out of the request headers and addresses the key is put into.
  if (v && !SECRET_SHAPE[name].test(v)) throw new Error("That doesn't look like a valid key.");
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
