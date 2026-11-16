import "server-only";
import { headers } from "next/headers";

// Slowing down guessing. Three doors accept a secret from anyone on the internet: the session
// cookie, the laptop helper's token and the alarm clocks' CRON_SECRET. Each wrong guess used to
// cost a database lookup (or nothing at all), so someone could try without end and keep the
// free database awake while doing it. Now each caller gets a small number of failures per
// window; after that their requests are turned away before the database is touched.
//
// Kept in memory: it protects this one server process, which is what there is. A restart forgets
// the counts, which only gives a guesser a fresh allowance, never extra access.

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __jobHuntLimits?: Map<string, Bucket> };
g.__jobHuntLimits ??= new Map();
const buckets = g.__jobHuntLimits;

/** Never hold more callers than this: when full, the oldest entries go first. */
const MAX_BUCKETS = 5000;

function bucket(key: string, windowMs: number, now: number): Bucket {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now || buckets.size >= MAX_BUCKETS) buckets.delete(k);
        if (buckets.size < MAX_BUCKETS * 0.9) break;
      }
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  return b;
}

/** Has this caller already failed `max` times in the current window? (Doesn't count anything.) */
export function isBlocked(scope: string, who: string, max: number): boolean {
  const b = buckets.get(`${scope}:${who}`);
  return Boolean(b && b.resetAt > Date.now() && b.count >= max);
}

/** Count one failure for this caller. */
export function noteFailure(scope: string, who: string, windowMs: number): void {
  bucket(`${scope}:${who}`, windowMs, Date.now()).count++;
}

/**
 * Who is asking, as well as the server can tell. A proxy in front of the app (Render, or Caddy
 * in the Docker setup) adds the caller's address to X-Forwarded-For. A caller can put entries of
 * their own in front, so only the LAST one, appended by the nearest proxy, is used. If the host
 * puts an address of its own there, or there is no proxy at all, callers share one bucket: the
 * total rate of guesses is still capped, and requests carrying a secret that recently worked
 * skip the limit (isKnownGood), so signed-in people and linked laptops are never locked out.
 */
export function callerOf(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  const last = forwarded?.split(",").pop()?.trim();
  return (last || h.get("x-real-ip") || "direct").slice(0, 64);
}

// Secrets (as hashes) that passed their check recently. They only let a request skip the limit;
// the real check against the database still runs every time.
const gg = globalThis as unknown as { __jobHuntGood?: Map<string, number> };
gg.__jobHuntGood ??= new Map();
const good = gg.__jobHuntGood;
const GOOD_FOR_MS = 30 * 60_000;

export function rememberGood(hash: string): void {
  if (good.size >= MAX_BUCKETS) for (const k of good.keys()) if (good.size >= MAX_BUCKETS * 0.9) good.delete(k);
  good.set(hash, Date.now() + GOOD_FOR_MS);
}

export function isKnownGood(hash: string): boolean {
  return (good.get(hash) ?? 0) > Date.now();
}

/** The caller of the request being handled right now (pages, actions and routes). */
export async function currentCaller(): Promise<string> {
  return callerOf(await headers());
}
