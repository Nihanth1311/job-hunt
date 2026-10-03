import "server-only";
import { allUserIds, cleanup, earlyMs, maybeSendMorningDigest, runFetch, unfinishedFetches } from "./fetcher";
import { ensureScored } from "./jobs";
import { getPreferences, getState, GLOBAL, setState } from "./settings";

const TICK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __jobHuntScheduler?: NodeJS.Timeout; __jobHuntTick?: Promise<void> };

/** When each alarm clock last woke the app, e.g. { github: "…", cronjob: "…", timer: "…" }. */
export type Wakeups = Record<string, string>;
export const getWakeups = async () => (await getState<Wakeups>(GLOBAL, "wakeups")) ?? {};

/**
 * One pass at a time: a second wake-up while one is still running just waits for it.
 * `via` says who woke us (GitHub, cron-job.org, the in-process timer), recorded so Settings can
 * show whether each alarm clock is actually arriving.
 */
export function tick(via = "timer"): Promise<void> {
  void getWakeups()
    .then((w) => setState(GLOBAL, "wakeups", { ...w, [via]: new Date().toISOString() }))
    .catch(() => {});
  g.__jobHuntTick ??= doTick().finally(() => {
    g.__jobHuntTick = undefined;
  });
  return g.__jobHuntTick;
}

/**
 * One pass for everyone: an automatic fetch for each person whose own "Check for new jobs
 * every" period has passed since their last automatic fetch (each fetch ends with their
 * notification), then digests. "Fetch now" doesn't move this clock.
 */
async function doTick() {
  try {
    for (const userId of await allUserIds()) {
      await ensureScored(userId);
      await unfinishedFetches(userId).catch((e) => console.error("[push]", userId, e));
      const hours = (await getPreferences(userId)).fetchIntervalHours;
      const last = await getState<string>(userId, "lastAutoFetchAt");
      const dueAt = last ? new Date(last).getTime() + hours * 3_600_000 - earlyMs(hours) : 0;
      if (Date.now() >= dueAt) {
        const s = await runFetch(userId);
        console.log(`[scheduler] ${userId}: ${s.inserted} new jobs`);
      }
      await maybeSendMorningDigest(userId).catch((e) => console.error("[digest]", userId, e));
    }
    await cleanup();
  } catch (err) {
    console.error("[scheduler]", err);
  }
}

/**
 * Runs inside the web server process: every 10 minutes while the server is awake, and once just
 * after it starts, checks whether anyone is due a fetch or a morning digest. A free server that
 * sleeps can't rely on this alone, so external alarm clocks also call /api/cron/fetch (GitHub
 * Actions, cron-job.org). All of them are safe together: a person is only fetched when due.
 * Set SCHEDULER=off to disable it (the laptop does, so it doesn't fetch alongside the live site).
 */
export function startScheduler() {
  if (g.__jobHuntScheduler) return;
  g.__jobHuntScheduler = setInterval(() => void tick("timer"), TICK_MS);
  setTimeout(() => void tick("startup"), 20_000);
  console.log("[scheduler] started");
}
