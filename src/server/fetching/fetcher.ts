import "server-only";
import type { FetchStatus, FetchSummary, ManualFetchResult, SourceResult } from "@/shared/types";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { RawJob } from "@/shared/core/analyze";
import { salaryLabel } from "@/shared/core/classify";
import { getDb, schema } from "../db";
import type { Job } from "../db/schema";
import { cleanupOldJobs, hoursAgo, insertJobs, jobId, seenAt, toNewJob } from "../services/jobs";
import { notifyFetchFailed, notifyNewJobs } from "../notify/push";
import { escapeHtml, sendTelegram, telegramConfigured, type TelegramKeys } from "../notify/telegram";
import { getPreferences, getProfile, getSecrets, getState, GLOBAL, setState, telegramEnabled } from "../services/settings";
import { SOURCES, type JobSource } from "./sources";
import { followedCompanies } from "./sources/companies";
import { MAX_AGE_DAYS } from "./sources/companies/shared";
import { CATEGORY_LABEL, type Category } from "@/shared/types";
import { cleanupRejected } from "../services/applications";

// How fetching works with several people:
//   1. Company careers sites ("shared" sources) are read once for everyone into a pool (raw_jobs),
//      at most every POOL_HOURS, so we never hit Amazon or Google once per person.
//   2. Each person's feed is filled from that pool: only companies they follow, scored against
//      their own profile.
//   3. Their own sources (Google Jobs with their key, extra career pages) run with their keys.

const POOL_HOURS = 3;

/**
 * Something checks the schedule every 10 minutes (the server's own timer, kept awake by
 * cron-job.org). Count a fetch as due up to one check early, so a 3-hour period means
 * 3 hours, not 3 hours plus up to 10 minutes of waiting for the next check.
 */
export const EARLY_MS = 10 * 60_000;
/** "Fetch now" refreshes the pool too, unless it was refreshed this recently. */
const POOL_MIN_MINUTES = 20;

const g = globalThis as unknown as {
  __jobHuntPool?: Promise<SourceResult[]>;
  __jobHuntFetching?: Map<string, Promise<FetchSummary>>;
  __jobHuntAbort?: Map<string, AbortController>;
  __jobHuntStarted?: Map<string, string>;
};
g.__jobHuntFetching ??= new Map();
g.__jobHuntAbort ??= new Map();
g.__jobHuntStarted ??= new Map();

export async function fetchStatus(userId: string): Promise<FetchStatus> {
  return {
    running: g.__jobHuntFetching!.has(userId) ? (g.__jobHuntStarted!.get(userId) ?? null) : null,
    last: (await getState<ManualFetchResult>(userId, "lastManualFetch")) ?? null,
  };
}

/**
 * "Fetch now", without anyone waiting on it: starts (or joins) this person's fetch and returns
 * when it started. The phone may close the app; the result is saved and the app picks it up
 * later with fetchStatus.
 */
export function startManualFetch(userId: string): string {
  void runFetch(userId, { force: true }).catch(() => {});
  return g.__jobHuntStarted!.get(userId)!;
}

/** Fetch for one person. Overlapping calls for the same person share one run. */
export function runFetch(userId: string, opts: { force?: boolean } = {}): Promise<FetchSummary> {
  const running = g.__jobHuntFetching!;
  let run = running.get(userId);
  if (!run) {
    const stop = new AbortController();
    const manual = opts.force ?? false;
    const startedAt = new Date().toISOString();
    g.__jobHuntAbort!.set(userId, stop);
    g.__jobHuntStarted!.set(userId, startedAt);
    const done = (r: Omit<ManualFetchResult, "startedAt" | "finishedAt">) =>
      setState(userId, "lastManualFetch", { startedAt, finishedAt: new Date().toISOString(), ...r }).catch(() => {});
    run = (async () => {
      // Remembered until it ends, so a fetch cut off by a server restart is noticed (unfinishedFetches).
      if (manual) await setState(userId, "manualFetch", { startedAt });
      try {
        const summary = await doFetch(userId, manual, stop.signal);
        if (manual) await done({ summary });
        return summary;
      } catch (err) {
        if (manual) {
          await done({ error: "Something went wrong on the server. Try again." });
          await notifyFetchFailed(userId, "Something went wrong on the server.").catch(() => {});
        }
        throw err;
      } finally {
        if (manual) await setState(userId, "manualFetch", {}).catch(() => {});
      }
    })().finally(() => {
      running.delete(userId);
      g.__jobHuntAbort!.delete(userId);
      g.__jobHuntStarted!.delete(userId);
    });
    running.set(userId, run);
  }
  return run;
}

/**
 * "Cancel": stop this person's fetch at the next safe point (between steps, or by no longer
 * waiting for a slow source). Jobs already saved stay. The shared company-careers check keeps
 * running for everyone else; this person's feed picks it up next time.
 */
export function cancelFetch(userId: string): boolean {
  const stop = g.__jobHuntAbort!.get(userId);
  stop?.abort();
  return Boolean(stop);
}

/** Wait for `work`, unless `signal` fires first (then resolve to null; the work carries on unwatched). */
function unlessStopped<T>(work: Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return Promise.race([work, new Promise<null>((done) => signal.addEventListener("abort", () => done(null), { once: true }))]);
}

export const isFetching = (userId: string) => g.__jobHuntFetching!.has(userId);

async function lastSuccess(userId: string, source: string): Promise<Date | null> {
  const db = await getDb();
  const [row] = await db
    .select({ at: schema.fetchRuns.startedAt })
    .from(schema.fetchRuns)
    .where(and(eq(schema.fetchRuns.userId, userId), eq(schema.fetchRuns.source, source), isNull(schema.fetchRuns.error)))
    .orderBy(desc(schema.fetchRuns.startedAt))
    .limit(1);
  return row?.at ?? null;
}

/** Run one source and log it in fetch_runs. */
async function logged(userId: string, source: JobSource, run: () => Promise<{ fetched: number; inserted: number }>): Promise<SourceResult> {
  const db = await getDb();
  const base = { id: source.id, label: source.label, fetched: 0, inserted: 0 };
  const runId = randomUUID();
  await db.insert(schema.fetchRuns).values({ id: runId, userId, source: source.id });
  try {
    const r = await run();
    await db.update(schema.fetchRuns).set({ finishedAt: new Date(), ...r }).where(eq(schema.fetchRuns.id, runId));
    return { ...base, status: "ok", ...r };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.fetchRuns).set({ finishedAt: new Date(), error: message }).where(eq(schema.fetchRuns.id, runId));
    return { ...base, status: "error", message };
  }
}

// ---------- 1. The shared pool ----------

/** Refresh the shared pool if it's due (or, with `force`, unless it was just refreshed). One refresh at a time. */
/** `maxAgeHours`: how old the pool may be for this fetch (the person's own fetch period). */
export function refreshPool(force = false, maxAgeHours = POOL_HOURS): Promise<SourceResult[]> {
  g.__jobHuntPool ??= doRefreshPool(force, maxAgeHours).finally(() => {
    g.__jobHuntPool = undefined;
  });
  return g.__jobHuntPool;
}

async function doRefreshPool(force: boolean, maxAgeHours: number): Promise<SourceResult[]> {
  const db = await getDb();
  const results: SourceResult[] = [];
  for (const source of SOURCES.filter((s) => s.scope === "shared")) {
    const last = await lastSuccess(GLOBAL, source.id);
    const age = last ? Date.now() - last.getTime() : Infinity;
    if (age < (force ? POOL_MIN_MINUTES * 60_000 : maxAgeHours * 3_600_000 - EARLY_MS)) {
      results.push({ id: source.id, label: source.label, status: "skipped", fetched: 0, inserted: 0, message: "Checked recently" });
      continue;
    }
    results.push(
      await logged(GLOBAL, source, async () => {
        const raw = await source.fetch({ userId: GLOBAL, secrets: {}, prefs: await getPreferences(GLOBAL), lastRun: last });
        for (let i = 0; i < raw.length; i += 100) {
          await db
            .insert(schema.rawJobs)
            .values(
              raw.slice(i, i + 100).map((r) => ({
                sourceKey: `${r.source}:${r.externalId}`,
                companyId: r.companyId ?? null,
                data: r,
                postedAt: r.postedAt,
              })),
            )
            .onConflictDoNothing();
        }
        return { fetched: raw.length, inserted: raw.length };
      }),
    );
  }
  await setState(GLOBAL, "poolRefreshedAt", new Date().toISOString());
  return results;
}

/** Copy pool jobs into one person's feed: companies they follow, not already in their feed, scored for them. */
/**
 * Copy jobs from the shared pool into one person's feed. Reads only what that person can still be
 * missing: jobs added to the pool since their last fill, from companies they follow. Reading the
 * whole pool every time (3,000+ jobs with descriptions, ~18 MB, for every person at every fetch)
 * used up Neon's 5 GB-a-month network allowance in about 9 days.
 * `companies`: just-followed companies, filled from the whole pool once (there's no "last time" for them).
 */
export async function fillFromPool(userId: string, opts: { companies?: string[] } = {}): Promise<Job[]> {
  const db = await getDb();
  const [profile, prefs] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  const following = followedCompanies(prefs).map((c) => c.id);
  const companies = opts.companies ? opts.companies.filter((id) => following.includes(id)) : following;
  if (!companies.length) return [];

  const startedAt = new Date();
  // Before poolFilledAt existed, "lastFetchAt" (when their previous fetch, and so its fill, began)
  // marks the same point, so existing people don't re-read the whole pool once after this change.
  const filledAt = opts.companies
    ? null
    : ((await getState<string>(userId, "poolFilledAt")) ?? (await getState<string>(userId, "lastFetchAt")));
  const conditions = [
    gte(schema.rawJobs.postedAt, new Date(Date.now() - MAX_AGE_DAYS * 86_400_000)),
    inArray(schema.rawJobs.companyId, companies),
  ];
  // 10 minutes of overlap, so a job added while the last fill was running isn't missed (duplicates are skipped below).
  if (filledAt) conditions.push(gte(schema.rawJobs.fetchedAt, new Date(new Date(filledAt).getTime() - 10 * 60_000)));
  const pool = await db.select({ data: schema.rawJobs.data }).from(schema.rawJobs).where(and(...conditions));

  const candidates = pool.map((p) => {
    const raw = p.data as RawJob;
    return { ...raw, postedAt: raw.postedAt ? new Date(raw.postedAt) : null } as RawJob;
  });
  // Which of these does this person already have? Ask about these ids only, not their whole feed.
  const ids = candidates.map((raw) => jobId(userId, raw.source, raw.externalId));
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, userId), inArray(schema.jobs.id, ids.slice(i, i + 500))));
    rows.forEach((r) => have.add(r.id));
  }
  const fresh = candidates.filter((raw) => !have.has(jobId(userId, raw.source, raw.externalId)));
  const inserted = await insertJobs(userId, fresh.map((raw) => toNewJob(userId, raw, profile, prefs)));
  if (!opts.companies) await setState(userId, "poolFilledAt", startedAt.toISOString());
  return inserted;
}

// ---------- 2 & 3. One person's fetch ----------

async function doFetch(userId: string, force: boolean, signal: AbortSignal): Promise<FetchSummary> {
  const [profile, prefs, secrets] = await Promise.all([getProfile(userId), getPreferences(userId), getSecrets(userId)]);
  const startedAt = new Date();
  const results: SourceResult[] = [];
  const newJobs: Job[] = [];

  // Company careers sites: refresh the shared pool if due, then take this person's share.
  const shared = SOURCES.find((s) => s.scope === "shared")!;
  const pool = await unlessStopped(refreshPool(force, prefs.fetchIntervalHours), signal);
  if (pool && !signal.aborted) {
    const fromPool = await fillFromPool(userId);
    newJobs.push(...fromPool);
    const poolRun = pool.find((r) => r.id === shared.id);
    results.push({
      id: shared.id,
      label: shared.label,
      status: poolRun?.status === "error" ? "error" : "ok",
      fetched: poolRun?.fetched ?? 0,
      inserted: fromPool.length,
      message: poolRun?.status === "error" ? poolRun.message : poolRun?.status === "skipped" ? "Shared list checked recently" : undefined,
    });
  } else {
    results.push({ id: shared.id, label: shared.label, status: "skipped", fetched: 0, inserted: 0, message: "Cancelled" });
  }

  for (const source of SOURCES.filter((s) => s.scope === "user")) {
    const base = { id: source.id, label: source.label, fetched: 0, inserted: 0 };
    if (signal.aborted) {
      results.push({ ...base, status: "skipped", message: "Cancelled" });
      continue;
    }
    if (!source.configured(prefs, secrets)) {
      results.push({ ...base, status: "skipped", message: source.id === "jsearch" ? "Add your key in Settings" : "Not set up" });
      continue;
    }
    const ctx = { userId, secrets, prefs, lastRun: await lastSuccess(userId, source.id) };
    if ((!force || source.budgeted) && source.due && !source.due(ctx)) {
      results.push({ ...base, status: "skipped", message: "Already ran today (free-plan limit)" });
      continue;
    }
    results.push(
      await logged(userId, source, async () => {
        const raw = await unlessStopped(source.fetch(ctx), signal);
        if (!raw) throw new Error("Cancelled");
        const inserted = await insertJobs(userId, raw.map((r) => toNewJob(userId, r, profile, prefs)));
        newJobs.push(...inserted);
        return { fetched: raw.length, inserted: inserted.length };
      }),
    );
  }

  if (!signal.aborted) {
    await setState(userId, "lastFetchAt", startedAt.toISOString());
    // The automatic schedule (fetching/scheduler.ts) only moves on automatic fetches.
    if (!force) await setState(userId, "lastAutoFetchAt", startedAt.toISOString());
  }
  await instantAlerts(secrets, newJobs, prefs.instantAlertScore).catch((e) => console.error("[alerts]", e));
  // Phone notification to this person only: after every automatic fetch with new jobs, and when
  // their own "Fetch now" finishes or fails (they may have closed the app). Not after Cancel.
  if (!signal.aborted) {
    const tried = results.filter((r) => r.status !== "skipped");
    const failed = tried.filter((r) => r.status === "error").map((r) => r.label);
    const notify =
      force && tried.length > 0 && failed.length === tried.length
        ? notifyFetchFailed(userId, `Couldn't reach ${failed.join(", ")}.`)
        : notifyNewJobs(userId, newJobs, { manual: force, failed });
    await notify.catch((e) => console.error("[push]", e));
  }
  return { startedAt: startedAt.toISOString(), inserted: newJobs.length, sources: results, cancelled: signal.aborted };
}

/**
 * A "Fetch now" that never finished because the server stopped (a free server going to sleep,
 * a restart or a deploy): tell that person, once. Called by the scheduler on each wake-up.
 */
export async function unfinishedFetches(userId: string): Promise<void> {
  const started = await getState<{ startedAt?: string }>(userId, "manualFetch");
  if (!started?.startedAt || g.__jobHuntFetching!.has(userId)) return;
  if (Date.now() - new Date(started.startedAt).getTime() < 20 * 60_000) return;
  await setState(userId, "manualFetch", {});
  await setState(userId, "lastManualFetch", {
    startedAt: started.startedAt,
    finishedAt: new Date().toISOString(),
    error: "It was cut off before it finished (the server restarted). Try again.",
  });
  await notifyFetchFailed(userId, "Your fetch was cut off before it finished (the server restarted).");
}

/** Everyone who can sign in (for the scheduler). */
export async function allUserIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.select({ id: schema.users.id }).from(schema.users)).map((u) => u.id);
}

/** Old jobs out of every feed and the pool. Run by the scheduler, not on every fetch. */
export async function cleanup(): Promise<void> {
  await cleanupOldJobs();
  const gone = await cleanupRejected();
  if (gone) console.log(`[cleanup] deleted ${gone} rejected application${gone === 1 ? "" : "s"}`);
}

// ---------- Alerts (each person's own Telegram bot) ----------

const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

function jobLine(j: Job): string {
  const salary = salaryLabel(j.salaryMinLpa, j.salaryMaxLpa);
  const href = j.companyUrl ?? j.url;
  const link = href ? ` — <a href="${escapeHtml(href)}">${j.companyUrl ? "company site" : "open"}</a>` : "";
  return `• <b>${escapeHtml(j.title)}</b> at ${escapeHtml(j.company)} (${j.score}%${salary ? `, ${salary}` : ""})${link}`;
}

async function instantAlerts(keys: TelegramKeys, jobs: Job[], minScore: number) {
  if (!minScore || !telegramConfigured(keys) || !(await telegramEnabled())) return;
  const hits = jobs
    .filter((j) => j.fit === "fit" && j.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!hits.length) return;
  await sendTelegram(keys, `🎯 <b>${hits.length} new job${hits.length > 1 ? "s" : ""} ready to apply</b>\n\n${hits.map(jobLine).join("\n")}`);
}

/** The 9 AM summary: new jobs per category, top matches, follow-ups due. */
export async function sendMorningDigest(userId: string): Promise<void> {
  const db = await getDb();
  const keys = await getSecrets(userId);
  const since = hoursAgo(24);
  // Only jobs whose full requirements were checked and fit you.
  const relevant = and(eq(schema.jobs.userId, userId), gte(seenAt, since), eq(schema.jobs.fit, "fit"), eq(schema.jobs.status, "new"));

  const counts = await db
    .select({ category: schema.jobs.category, n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(relevant)
    .groupBy(schema.jobs.category);
  const top = await db.select().from(schema.jobs).where(relevant).orderBy(desc(schema.jobs.score)).limit(5);
  const due = await db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.userId, userId),
        inArray(schema.applications.status, ["applied", "assessment", "interview"]),
        lte(schema.applications.followUpAt, new Date()),
      ),
    );

  const total = counts.reduce((s, c) => s + c.n, 0);
  const lines = [
    `☀️ <b>Good morning! ${total} new job${total === 1 ? "" : "s"} ready to apply (last 24h)</b>`,
    counts.length ? counts.map((c) => `${CATEGORY_LABEL[c.category as Category] ?? c.category}: ${c.n}`).join(" · ") : "",
    top.length ? `\n<b>Top matches</b>\n${top.map(jobLine).join("\n")}` : "",
    due.length
      ? `\n<b>Follow-ups due</b>\n${due.map((a) => `• ${escapeHtml(a.company)} — ${escapeHtml(a.title)}`).join("\n")}`
      : "",
    appUrl() ? `\n<a href="${appUrl()}/jobs">Open your job feed</a>` : "",
  ];
  await sendTelegram(keys, lines.filter(Boolean).join("\n"));
}

export async function maybeSendMorningDigest(userId: string): Promise<void> {
  const [prefs, keys] = await Promise.all([getPreferences(userId), getSecrets(userId)]);
  if (!prefs.morningDigest || !telegramConfigured(keys) || !(await telegramEnabled())) return;
  const ist = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const part = (t: string) => ist.find((p) => p.type === t)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (Number(part("hour")) < 9 || (await getState<string>(userId, "digestDate")) === today) return;
  await setState(userId, "digestDate", today);
  await sendMorningDigest(userId);
}
