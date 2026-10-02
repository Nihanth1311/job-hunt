import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "../db";
import type { User } from "../db/schema";
import { randomToken, sha256 } from "./crypto";

// Sign-in is Google only, invite-only. A session is a random token in an httpOnly cookie;
// the database keeps only its SHA-256, so a leaked database can't be used to sign in, and
// deleting the row (sign out, or the admin removing someone) ends the session at once.

export const SESSION_COOKIE = "jh_session";
const SESSION_DAYS = 30;
/** The first admin's id: everything created before accounts existed belongs to it. */
export const OWNER_ID = "owner";
export const MAX_USERS = Number(process.env.MAX_USERS || 15);

export const secureCookies = () => process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1";

/** Admins come from ADMIN_EMAIL (comma-separated). They can always sign in and manage invites. */
export const adminEmails = () =>
  (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Local development only: sign in as the admin without Google, so the app works on your laptop
 * before Google sign-in is set up. Never in production, never once Google is configured, and
 * only for requests to this machine.
 */
export const devLoginAllowed = (hostname: string) =>
  process.env.NODE_ENV !== "production" && !googleConfigured() && ["localhost", "127.0.0.1"].includes(hostname) && adminEmails().length > 0;

/** The signed-in person for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())));
  const user = row?.user ?? null;
  // "Last seen", for the Access page. Written at most every few minutes, not on every request.
  if (user && (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS)) {
    const now = new Date();
    await db.update(schema.users).set({ lastSeenAt: now }).where(eq(schema.users.id, user.id));
    user.lastSeenAt = now;
  }
  return user;
});

const SEEN_EVERY_MS = 3 * 60_000;
/** Used the app this recently → shown as "Active". */
export const ACTIVE_WITHIN_MS = 10 * 60_000;

/** For pages, actions and routes: the signed-in person, or off to the login page. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** Start a session for `userId` and set the cookie. Only from a route handler or server action. */
export async function startSession(userId: string): Promise<void> {
  const token = randomToken();
  const db = await getDb();
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export type SignInResult = { ok: true; user: User } | { ok: false; reason: "not-invited" | "full" };

/**
 * After Google confirms who someone is: let them in if they're an admin or invited, creating
 * their account on first sign-in. The first admin to sign in takes over the pre-account data.
 */
export async function signInVerified(profile: { email: string; name: string; image: string | null }): Promise<SignInResult> {
  const db = await getDb();
  const email = profile.email.trim().toLowerCase();
  const isAdmin = adminEmails().includes(email);

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    const [user] = await db
      .update(schema.users)
      .set({ name: profile.name || existing.name, image: profile.image, lastLoginAt: new Date(), role: isAdmin ? "admin" : existing.role })
      .where(eq(schema.users.id, existing.id))
      .returning();
    // Still allowed? (An admin may have removed the invite.)
    if (!isAdmin) {
      const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.email, email));
      if (!invite) return { ok: false, reason: "not-invited" };
    }
    return { ok: true, user };
  }

  if (!isAdmin) {
    const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.email, email));
    if (!invite) return { ok: false, reason: "not-invited" };
    const count = (await db.select({ id: schema.users.id }).from(schema.users)).length;
    if (count >= MAX_USERS) return { ok: false, reason: "full" };
  }

  const [owner] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, OWNER_ID));
  const id = isAdmin && !owner ? OWNER_ID : crypto.randomUUID();
  const [user] = await db
    .insert(schema.users)
    .values({ id, email, name: profile.name, image: profile.image, role: isAdmin ? "admin" : "user", lastLoginAt: new Date() })
    .returning();
  return { ok: true, user };
}
