import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { RawJob } from "./core/analyze";
import { salaryLabel } from "./core/classify";
import { getDb, schema } from "./db";
import type { Job } from "./db/schema";
import { cleanupOldJobs, hoursAgo, insertJobs, jobId, seenAt, toNewJob } from "./jobs";
import { notifyFetchFailed, notifyNewJobs } from "./notify/push";
import { escapeHtml, sendTelegram, telegramConfigured, type TelegramKeys } from "./notify/telegram";
import { getPreferences, getProfile, getSecrets, getState, GLOBAL, setState } from "./settings";
import { SOURCES, type JobSource } from "./sources";
import { followedCompanies } from "./sources/companies";
import { MAX_AGE_DAYS } from "./sources/companies/shared";
import { CATEGORY_LABEL, type Category } from "./types";

// How fetching works with several people:
//   1. Company careers sites ("shared" sources) are read once for everyone into a pool (raw_jobs),
//      at most every POOL_HOURS, so we never hit Amazon or Google once per person.
//   2. Each person's feed is filled from that pool: only companies they follow, scored against
//      their own profile.
//   3. Their own sources (Google Jobs with their key, extra career pages) run with their keys.

export interface SourceResult {
  id: string;
  label: string;
  status: "ok" | "error" | "skipped";
  fetched: number;
  inserted: number;
  message?: string;
}

export interface FetchSummary {
  startedAt: string;
  inserted: number;
  sources: SourceResult[];
  /** Stopped early with "Cancel"; jobs added before that are kept. */
  cancelled?: boolean;
}

const POOL_HOURS = 3;

/**
 * The wake-up comes from an hourly cron that is often a few minutes late. Count something as
 * due this much early, so a slightly-late hour never skips a round (15 min per hour, max 45).
 */
export const earlyMs = (hours: number) => Math.min(45, 15 * hours) * 60_000;
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

/** The outcome of someone's last "Fetch now", kept so the app can show it after they come back. */
export interface ManualFetchResult {
  startedAt: string;
  finishedAt: string;
  summary?: FetchSummary;
  error?: string;
}

export interface FetchStatus {
  /** Their fetch is running right now; when it started. */
  running: string | null;
  last: ManualFetchResult | null;
}

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
    if (age < (force ? POOL_MIN_MINUTES * 60_000 : maxAgeHours * 3_600_000 - earlyMs(maxAgeHours))) {
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
export async function fillFromPool(userId: string): Promise<Job[]> {
  const db = await getDb();
  const [profile, prefs] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  const following = new Set(followedCompanies(prefs).map((c) => c.id));
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
  const pool = await db.select().from(schema.rawJobs).where(gte(schema.rawJobs.postedAt, since));
  const have = new Set((await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.userId, userId))).map((r) => r.id));

  const fresh = pool
    .filter((p) => p.companyId && following.has(p.companyId))
    .map((p) => {
      const raw = p.data as RawJob;
      return { ...raw, postedAt: raw.postedAt ? new Date(raw.postedAt) : null } as RawJob;
    })
    .filter((raw) => !have.has(jobId(userId, raw.source, raw.externalId)));
  return insertJobs(userId, fresh.map((raw) => toNewJob(userId, raw, profile, prefs)));
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
    // The automatic 3-hour clock (scheduler.ts) only moves on automatic fetches.
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
export const cleanup = () => cleanupOldJobs();

// ---------- Alerts (each person's own Telegram bot) ----------

const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

function jobLine(j: Job): string {
  const salary = salaryLabel(j.salaryMinLpa, j.salaryMaxLpa);
  const href = j.companyUrl ?? j.url;
  const link = href ? ` — <a href="${escapeHtml(href)}">${j.companyUrl ? "company site" : "open"}</a>` : "";
  return `• <b>${escapeHtml(j.title)}</b> at ${escapeHtml(j.company)} (${j.score}%${salary ? `, ${salary}` : ""})${link}`;
}

async function instantAlerts(keys: TelegramKeys, jobs: Job[], minScore: number) {
  if (!minScore || !telegramConfigured(keys)) return;
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
  if (!prefs.morningDigest || !telegramConfigured(keys)) return;
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
