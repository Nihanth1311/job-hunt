import "server-only";
import { allUserIds, cleanup, maybeSendMorningDigest, runFetch } from "./fetcher";
import { ensureScored } from "./jobs";
import { getState } from "./settings";

const TICK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __jobHuntScheduler?: NodeJS.Timeout };

/** The automatic fetch: the same for everyone, every 3 hours. */
export const AUTO_FETCH_HOURS = 3;
/** The external cron is often a few minutes (sometimes half an hour) late; don't skip a round over that. */
const SLACK_MS = 45 * 60_000;

/**
 * One pass for everyone: an automatic fetch for each person whose last automatic fetch was
 * about 3 hours ago (the shared pool refreshes itself), then digests. "Fetch now" doesn't
 * move this clock, so a manual fetch never costs anyone their next automatic one.
 */
export async function tick() {
  try {
    for (const userId of await allUserIds()) {
      await ensureScored(userId);
      const last = await getState<string>(userId, "lastAutoFetchAt");
      const dueAt = last ? new Date(last).getTime() + AUTO_FETCH_HOURS * 3_600_000 - SLACK_MS : 0;
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
