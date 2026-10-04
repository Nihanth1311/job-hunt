import "server-only";
import { scheduleChanged } from "@/shared/core/schedule";
import { asc, eq } from "drizzle-orm";
import { ACTIVE_WITHIN_MS, MAX_USERS, OWNER_ID } from "../auth";
import { getDb, schema } from "../db";
import type { User } from "../db/schema";
import { fillFromPool } from "../fetching/fetcher";
import { getProfile, getSecrets, saveProfile, setSecret } from "./settings";

/** Right after someone signs in: fill gaps in their profile from Google and give them jobs from the shared pool. */
export async function onFirstSignIn(user: User): Promise<void> {
  scheduleChanged(); // maybe a new person: the scheduler should look at everyone again
  const profile = await getProfile(user.id);
  if (!profile.name || !profile.email) {
    await saveProfile(user.id, { ...profile, name: profile.name || user.name, email: profile.email || user.email });
  }

  // The owner's keys used to live in .env. Move them into their account once, so nothing
  // runs on server-wide keys any more (and they can change or remove them in Settings).
  if (user.id === OWNER_ID) {
    const have = await getSecrets(user.id);
    const fromEnv = {
      jsearchKey: process.env.JSEARCH_API_KEY,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
    } as const;
    for (const [name, value] of Object.entries(fromEnv)) {
      if (value && !have[name as keyof typeof fromEnv]) await setSecret(user.id, name as keyof typeof fromEnv, value);
    }
  }

  await fillFromPool(user.id).catch((e) => console.error("[sign-in] fill feed", e));
}

// ---------- Admin ----------

export interface Person {
  email: string;
  name: string;
  image: string | null;
  role: string;
  userId: string | null;
  invited: boolean;
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  /** Used the app in the last few minutes. */
  active: boolean;
}

/** Everyone with an account, plus invites not used yet. */
export async function listPeople(): Promise<Person[]> {
  const db = await getDb();
  const [users, invites] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.createdAt)),
    db.select().from(schema.invites).orderBy(asc(schema.invites.createdAt)),
  ]);
  const invited = new Set(invites.map((i) => i.email));
  const people: Person[] = users.map((u) => ({
    email: u.email,
    name: u.name,
    image: u.image,
    role: u.role,
    userId: u.id,
    invited: invited.has(u.email),
    lastLoginAt: u.lastLoginAt,
    lastSeenAt: u.lastSeenAt ?? u.lastLoginAt,
    active: Boolean(u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < ACTIVE_WITHIN_MS),
  }));
  for (const i of invites) {
    if (!users.some((u) => u.email === i.email)) {
      people.push({ email: i.email, name: "", image: null, role: "user", userId: null, invited: true, lastLoginAt: null, lastSeenAt: null, active: false });
    }
  }
  return people;
}

export async function invite(email: string, by: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "That doesn't look like an email address.";
  const people = await listPeople();
  if (people.some((p) => p.email === e && (p.invited || p.role === "admin"))) return "Already invited.";
  if (people.length >= MAX_USERS) return `The limit is ${MAX_USERS} people.`;
  const db = await getDb();
  await db.insert(schema.invites).values({ email: e, invitedBy: by }).onConflictDoNothing();
  return null;
}

/**
 * Take someone's access away: their invite, their sessions (signed out at once) and, with
 * `deleteData`, their account and everything in it.
 */
export async function removePerson(email: string, deleteData: boolean): Promise<void> {
  const db = await getDb();
  const e = email.trim().toLowerCase();
  await db.delete(schema.invites).where(eq(schema.invites.email, e));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, e));
  if (!user || user.role === "admin") return;
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  if (!deleteData) return;
  // Tracker entries cascade to their events; resumes and jobs go explicitly.
  await db.delete(schema.resumeVersions).where(eq(schema.resumeVersions.userId, user.id));
  await db.delete(schema.applications).where(eq(schema.applications.userId, user.id));
  await db.delete(schema.jobs).where(eq(schema.jobs.userId, user.id));
  await db.delete(schema.settings).where(eq(schema.settings.userId, user.id));
  await db.delete(schema.fetchRuns).where(eq(schema.fetchRuns.userId, user.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id)); // sessions and keys cascade
}
