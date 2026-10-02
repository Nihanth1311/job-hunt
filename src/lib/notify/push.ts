import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import webpush, { WebPushError } from "web-push";
import { decrypt, encrypt } from "../auth/crypto";
import { getDb, schema } from "../db";
import type { Job } from "../db/schema";
import { getState, GLOBAL, setState } from "../settings";

// Phone notifications (Web Push). Works on iPhone (iOS 16.4+) once the site is added to the
// Home Screen, and in desktop/Android browsers. No third-party account: the app signs each
// push with its own key pair (VAPID), made on first use and kept encrypted in the database.

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** "iPhone", "Mac · Chrome"…, so people can tell their devices apart. */
  device: string;
  addedAt: string;
}

/** "ready": only jobs you can apply to now. "worth": anything not ruled out (ready + worth checking). */
export type PushMode = "ready" | "worth";

const MAX_DEVICES = 10;
/** Held overnight (India time) and sent with the first fetch after this. */
const QUIET_FROM = 23;
const QUIET_UNTIL = 7;

// ---------- Keys ----------

async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const saved = await getState<{ publicKey: string; privateKey: string }>(GLOBAL, "vapid");
  const privateKey = saved && decrypt(saved.privateKey);
  if (saved && privateKey) return { publicKey: saved.publicKey, privateKey };
  const keys = webpush.generateVAPIDKeys();
  await setState(GLOBAL, "vapid", { publicKey: keys.publicKey, privateKey: encrypt(keys.privateKey) });
  return keys;
}

/** The public half, which browsers need to subscribe. */
export const vapidPublicKey = async () => (await vapidKeys()).publicKey;

/** Who's sending: Apple's push service rejects pushes without a real contact. */
function vapidSubject(): string {
  const url = process.env.APP_URL ?? "";
  if (url.startsWith("https://")) return url.replace(/\/$/, "");
  const email = (process.env.ADMIN_EMAIL ?? "").split(",")[0].trim();
  return email ? `mailto:${email}` : "mailto:admin@example.com";
}

// ---------- Devices ----------

export const getPushSubs = async (userId: string) => (await getState<PushSub[]>(userId, "pushSubs")) ?? [];
export const getPushMode = async (userId: string) => (await getState<PushMode>(userId, "pushMode")) ?? "worth";
export const setPushMode = (userId: string, mode: PushMode) => setState(userId, "pushMode", mode);

export async function addPushSub(userId: string, sub: Omit<PushSub, "addedAt">): Promise<void> {
  const others = (await getPushSubs(userId)).filter((s) => s.endpoint !== sub.endpoint);
  await setState(userId, "pushSubs", [...others, { ...sub, addedAt: new Date().toISOString() }].slice(-MAX_DEVICES));
}

export async function removePushSub(userId: string, endpoint: string): Promise<void> {
  await setState(userId, "pushSubs", (await getPushSubs(userId)).filter((s) => s.endpoint !== endpoint));
}

// ---------- Sending ----------

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** A newer notification with the same tag replaces the older one instead of piling up. */
  tag?: string;
}

/** Send to every device this person turned notifications on for. Returns how many got it. */
export async function sendPush(userId: string, msg: PushMessage): Promise<number> {
  const subs = await getPushSubs(userId);
  if (!subs.length) return 0;
  const keys = await vapidKeys();
  const options = {
    vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 6 * 3600,
  };
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), options);
        sent++;
      } catch (e) {
        // 404/410: the device unsubscribed or the app was removed from the Home Screen.
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
        else console.error("[push]", userId, e instanceof WebPushError ? `${e.statusCode} ${e.body}` : e);
      }
    }),
  );
  if (gone.length) await setState(userId, "pushSubs", subs.filter((s) => !gone.includes(s.endpoint)));
  return sent;
}

const istHour = () => (new Date().getUTCHours() + 5 + (new Date().getUTCMinutes() >= 30 ? 1 : 0)) % 24;
const isQuiet = () => {
  const h = istHour();
  return h >= QUIET_FROM || h < QUIET_UNTIL;
};

/**
 * After a fetch, to that person only. Automatic fetch: "6 new jobs worth a look", only when
 * there's something new; found overnight → held for the first notification of the morning.
 * Their own "Fetch now" (`manual`): always says it's finished, even with nothing new, at any hour.
 * Skipped jobs aren't mentioned.
 */
export async function notifyNewJobs(userId: string, found: Job[], opts: { manual?: boolean } = {}): Promise<void> {
  if (!(await getPushSubs(userId)).length) return;
  const mode = await getPushMode(userId);
  const wanted = (j: Pick<Job, "fit">) => (mode === "ready" ? j.fit === "fit" : j.fit !== "no");
  const pending = (await getState<string[]>(userId, "pushPending")) ?? [];
  const ids = [...new Set([...pending, ...found.filter(wanted).map((j) => j.id)])];
  if (!ids.length && !opts.manual) return;
  if (isQuiet() && !opts.manual) {
    await setState(userId, "pushPending", ids.slice(-300));
    return;
  }
  await setState(userId, "pushPending", []);

  const db = await getDb();
  const jobs = !ids.length ? [] : (
    await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, userId), inArray(schema.jobs.id, ids), eq(schema.jobs.status, "new")))
  )
    .filter(wanted) // a held job may have been re-scored since
    .sort((a, b) => (a.fit === b.fit ? b.score - a.score : a.fit === "fit" ? -1 : 1));
  if (!jobs.length && !opts.manual) return;

  const n = jobs.length;
  const ready = jobs.filter((j) => j.fit === "fit").length;
  if (!n) {
    const what = mode === "ready" ? "jobs ready to apply" : "jobs worth a look";
    await sendPush(userId, { title: "Fetch finished", body: `No new ${what} this time.`, url: "/jobs", tag: "new-jobs" });
    return;
  }
  const count =
    mode === "ready" || ready === n
      ? `${n} new job${n > 1 ? "s" : ""} ready to apply`
      : `${n} new job${n > 1 ? "s" : ""} worth a look${ready ? ` · ${ready} ready to apply` : ""}`;
  const title = opts.manual ? `Fetch finished · ${count}` : count;
  const top = jobs.slice(0, 3).map((j) => `${j.title} · ${j.company}${j.score ? ` (${j.score}%)` : ""}`);
  if (n > 3) top.push(`+${n - 3} more`);
  const url = n === 1 ? `/jobs/${jobs[0].id}` : ready ? "/jobs?sort=recent" : "/jobs?sort=recent&fit=check";
  await sendPush(userId, { title, body: top.join("\n"), url, tag: "new-jobs" });
}
