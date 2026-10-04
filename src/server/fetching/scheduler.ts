import "server-only";
import { isDue, nextSlot } from "@/shared/core/schedule";
import { allUserIds, cleanup, maybeSendMorningDigest, runFetch, unfinishedFetches } from "./fetcher";
import { ensureScored } from "../services/jobs";
import { getPreferences, getState } from "../services/settings";

const TICK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as {
  __jobHuntScheduler?: NodeJS.Timeout;
  __jobHuntTick?: Promise<void>;
  /** Nothing is due before this time (ms): checks until then don't touch the database. */
  __jobHuntQuietUntil?: number;
  __jobHuntWakeups?: Wakeups;
};

/** When each alarm clock last woke the app, e.g. { github: "…", cronjob: "…", timer: "…" }. Kept in memory. */
export type Wakeups = Record<string, string>;
export const getWakeups = (): Wakeups => g.__jobHuntWakeups ?? {};

/**
 * Every wake-up lands here: the server's own 10-minute timer, cron-job.org, GitHub. Most of them
 * find nothing due and return without touching the database. That matters: Neon's free plan
 * counts the hours the database is awake (100 a month) and only pauses it after 5 quiet minutes,
 * so a database read every 10 minutes would keep it awake all month.
 * One pass at a time: a second wake-up while one is still running just waits for it.
 */
export function tick(via = "timer"): Promise<void> {
  g.__jobHuntWakeups = { ...getWakeups(), [via]: new Date().toISOString() };
  if (Date.now() < (g.__jobHuntQuietUntil ?? 0)) return Promise.resolve();
  g.__jobHuntTick ??= doTick().finally(() => {
    g.__jobHuntTick = undefined;
  });
  return g.__jobHuntTick;
}

/**
 * One pass for everyone: an automatic fetch for each person whose fixed fetch time has come
 * (each fetch ends with their notification), then digests and cleanup. Then remember when the
 * next fixed time is, so checks before it can skip all of this.
 */
async function doTick() {
  try {
    // Look at the database again at least on every hour: picks up changes made elsewhere (e.g. the
    // laptop, which shares this database) and keeps the 9 am digest on time.
    let next = nextSlot(1);
    for (const userId of await allUserIds()) {
      await ensureScored(userId);
      await unfinishedFetches(userId).catch((e) => console.error("[push]", userId, e));
      const hours = (await getPreferences(userId)).fetchIntervalHours;
      if (isDue(await getState<string>(userId, "lastAutoFetchAt"), hours)) {
        const s = await runFetch(userId);
        console.log(`[scheduler] ${userId}: ${s.inserted} new jobs`);
      }
      await maybeSendMorningDigest(userId).catch((e) => console.error("[digest]", userId, e));
      next = Math.min(next, nextSlot(hours));
    }
    await cleanup();
    g.__jobHuntQuietUntil = next;
  } catch (err) {
    console.error("[scheduler]", err);
  }
}

/**
 * Runs inside the web server process: every 10 minutes while the server is awake, and once just
 * after it starts. A free server that sleeps can't rely on this alone, so external alarm clocks
 * also call /api/cron/fetch (cron-job.org every 10 minutes keeps it awake; GitHub is a backup).
 * All of them are safe together: a person is only fetched once per fixed time.
 * Set SCHEDULER=off to disable it (the laptop does, so it doesn't fetch alongside the live site).
 */
export function startScheduler() {
  if (g.__jobHuntScheduler) return;
  g.__jobHuntScheduler = setInterval(() => void tick("timer"), TICK_MS);
  setTimeout(() => void tick("startup"), 20_000);
  console.log("[scheduler] started");
}
