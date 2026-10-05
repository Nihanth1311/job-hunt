import "server-only";
import type { PushLogEntry, PushMode } from "@/shared/types";
import webpush, { WebPushError } from "web-push";
import { decrypt, encrypt } from "../auth/crypto";
import type { Job } from "../db/schema";
import { getState, GLOBAL, setState } from "../services/settings";

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

const MAX_DEVICES = 10;

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
  const subs = await getPushSubs(userId);
  const same = subs.find((s) => s.endpoint === sub.endpoint);
  // Already saved: the Settings page re-checks this device on every visit; don't rewrite it each time.
  if (same && same.keys.p256dh === sub.keys.p256dh && same.keys.auth === sub.keys.auth) return;
  const others = subs.filter((s) => s.endpoint !== sub.endpoint);
  await setState(userId, "pushSubs", [...others, { ...sub, addedAt: same?.addedAt ?? new Date().toISOString() }].slice(-MAX_DEVICES));
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
  /**
   * A newer notification with the same tag silently replaces an older one still in Notification
   * Center: no banner, no sound. So fetch notifications have no tag: each one alerts.
   */
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
    // "high": deliver now. The default, "normal", lets Apple/Google hold the message while the
    // phone is idle (screen off, battery saving) and hand it over when the phone wakes up; that's
    // how the 9:04 notification on 5 Oct only arrived at 9:13, when the app was opened.
    urgency: "high" as const,
  };
  let sent = 0;
  const gone: string[] = [];
  const problems: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), options);
        sent++;
      } catch (e) {
        // 404/410: the device unsubscribed or the app was removed from the Home Screen.
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
        else {
          const why = e instanceof WebPushError ? `${e.statusCode} ${e.body}`.trim() : String(e);
          problems.push(`${s.device}: ${why}`.slice(0, 200));
          console.error("[push]", userId, why);
        }
      }
    }),
  );
  if (gone.length) await setState(userId, "pushSubs", subs.filter((s) => !gone.includes(s.endpoint)));
  await logPush(userId, { at: new Date().toISOString(), title: msg.title, sent, of: subs.length, problems });
  return sent;
}

// ---------- What was sent (shown in Settings, so a missing notification can be traced) ----------

export const getPushLog = async (userId: string) => (await getState<PushLogEntry[]>(userId, "pushLog")) ?? [];

async function logPush(userId: string, entry: PushLogEntry) {
  await setState(userId, "pushLog", [entry, ...(await getPushLog(userId))].slice(0, 20)).catch(() => {});
}

/**
 * After every fetch, to that person only, at any hour (there are no quiet hours):
 *  - Automatic fetch: "Automatic fetch · 3 new jobs worth a look", "· no new jobs",
 *    "· 24 new jobs, none for you yet", so you know it ran.
 *  - Their own "Fetch now" (`manual`): "Fetch finished · …".
 * `failed`: sources that couldn't be reached this time, so a quiet result isn't mistaken for "nothing new".
 */
export async function notifyNewJobs(userId: string, found: Job[], opts: { manual?: boolean; failed?: string[] } = {}): Promise<void> {
  if (!(await getPushSubs(userId)).length) return;
  const mode = await getPushMode(userId);
  const wanted = (j: Pick<Job, "fit">) => (mode === "ready" ? j.fit === "fit" : j.fit !== "no");
  // Ready-to-apply first, then by score.
  const jobs = found.filter(wanted).sort((a, b) => (a.fit === b.fit ? b.score - a.score : a.fit === "fit" ? -1 : 1));

  const prefix = opts.manual ? "Fetch finished" : "Automatic fetch";
  const failedLine = opts.failed?.length ? `Couldn't reach ${opts.failed.join(", ")}.` : "";
  const plural = (k: number) => (k === 1 ? "" : "s");
  const n = jobs.length;

  if (!n) {
    const others = found.length; // new this time, but all ruled out for you
    const title = others ? `${prefix} · ${others} new job${plural(others)}, none for you yet` : `${prefix} · no new jobs`;
    const why = !others
      ? "Nothing new since the last check."
      : mode === "ready"
        ? "None are ready to apply yet."
        : "All were ruled out: too senior, not a tech role, or below your salary floor.";
    const url = failedLine ? "/settings" : others ? "/jobs?sort=recent&fit=all" : "/jobs";
    await sendPush(userId, { title, body: [why, failedLine].filter(Boolean).join("\n"), url });
    return;
  }

  const ready = jobs.filter((j) => j.fit === "fit").length;
  const count =
    mode === "ready" || ready === n
      ? `${n} new job${plural(n)} ready to apply`
      : `${n} new job${plural(n)} worth a look${ready ? ` · ${ready} ready to apply` : ""}`;
  const lines = jobs.slice(0, 3).map((j) => `${j.title} · ${j.company}${j.score ? ` (${j.score}%)` : ""}`);
  if (n > 3) lines.push(`+${n - 3} more`);
  if (failedLine) lines.push(failedLine);
  const url = n === 1 ? `/jobs/${jobs[0].id}` : ready ? "/jobs?sort=recent" : "/jobs?sort=recent&fit=check";
  await sendPush(userId, { title: `${prefix} · ${count}`, body: lines.join("\n"), url });
}

/** Your own "Fetch now" didn't work. Opens Settings, where Recent fetches shows what failed. */
export async function notifyFetchFailed(userId: string, reason: string): Promise<void> {
  await sendPush(userId, { title: "Fetch failed", body: `${reason} Open the app and try again.`, url: "/settings" });
}
