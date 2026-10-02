import "server-only";
import { allUserIds, cleanup, maybeSendMorningDigest, runFetch } from "./fetcher";
import { ensureScored } from "./jobs";
import { getPreferences, getState } from "./settings";

const TICK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __jobHuntScheduler?: NodeJS.Timeout };

/** One pass for everyone: fetch for anyone who's due (the shared pool refreshes itself), then digests. */
export async function tick() {
  try {
    for (const userId of await allUserIds()) {
      await ensureScored(userId);
      const prefs = await getPreferences(userId);
      const last = await getState<string>(userId, "lastFetchAt");
      const dueAt = last ? new Date(last).getTime() + prefs.fetchIntervalHours * 3_600_000 : 0;
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
