import "server-only";
import { allUserIds, cleanup, earlyMs, maybeSendMorningDigest, runFetch, unfinishedFetches } from "./fetcher";
import { ensureScored } from "./jobs";
import { getPreferences, getState } from "./settings";

const TICK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __jobHuntScheduler?: NodeJS.Timeout; __jobHuntTick?: Promise<void> };

/** One pass at a time: a second wake-up while one is still running just waits for it. */
export function tick(): Promise<void> {
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
 * Runs inside the web server process: every 10 minutes, checks whether anyone is due a
 * fetch or a morning digest. On serverless hosts (no long-running process), set
 * SCHEDULER=off and call /api/cron/fetch from an external cron instead.
 */
export function startScheduler() {
  if (g.__jobHuntScheduler) return;
  g.__jobHuntScheduler = setInterval(tick, TICK_MS);
  setTimeout(tick, 20_000);
  console.log("[scheduler] started");
}
