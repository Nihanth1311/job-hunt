import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, ilike, inArray, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import { hoursAgo, seenAt } from "./jobs";
import { RETIRED_SOURCES } from "../fetching/sources";
import { CAREER_SOURCES } from "@/shared/core/links";
import { getPreferences } from "./settings";
import { CATEGORIES, type Category, type JobListItem } from "@/shared/types";

export const WINDOWS = { "24h": 24, "48h": 48, "7d": 168, "30d": 720 } as const;
export type WindowKey = keyof typeof WINDOWS;

export interface JobFilters {
  window: WindowKey;
  category: Category | "tech" | "all";
  salary: "ok" | "meets" | "all";
  /** ready = verified fit, check = can't confirm yet, no = not a fit. */
  fit: "ready" | "check" | "no" | "all";
  view: "new" | "saved" | "skipped" | "applied";
  sort: "score" | "recent";
  loc: "pref" | "all";
  q: string;
  /** One company's jobs only; "" = any company. */
  company: string;
}

type Params = Record<string, string | string[] | undefined>;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function parseFilters(sp: Params): JobFilters {
  return {
    window: pick(sp.w, Object.keys(WINDOWS) as WindowKey[], "48h"),
    category: pick(sp.cat, ["tech", "all", ...CATEGORIES], "tech"),
    salary: pick(sp.sal, ["ok", "meets", "all"], "ok"),
    fit: pick(sp.fit, ["ready", "check", "no", "all"], "ready"),
    view: pick(sp.view, ["new", "saved", "skipped", "applied"], "new"),
    sort: pick(sp.sort, ["score", "recent"], "score"),
    loc: pick(sp.loc, ["pref", "all"], "pref"),
    q: typeof sp.q === "string" ? sp.q.slice(0, 100) : "",
    company: typeof sp.co === "string" ? sp.co.slice(0, 150) : "",
  };
}

const CITY_SPELLINGS: Record<string, string[]> = {
  bengaluru: ["bengaluru", "bangalore"],
  bangalore: ["bengaluru", "bangalore"],
  gurugram: ["gurugram", "gurgaon"],
  gurgaon: ["gurugram", "gurgaon"],
  mumbai: ["mumbai", "bombay", "navi mumbai"],
  delhi: ["delhi", "new delhi", "ncr"],
};

/** Each filter as its own list of conditions, so we can also count what each one hides. */
async function filterParts(uid: string, f: JobFilters, window: WindowKey = f.window) {
  const prefs = await getPreferences(uid);
  const j = schema.jobs;
  const parts: Record<"base" | "company" | "category" | "fit" | "salary" | "loc" | "q", SQL[]> = {
    base: [eq(j.userId, uid), eq(j.status, f.view)],
    company: f.company ? [eq(j.company, f.company)] : [],
    category: [],
    fit: [],
    salary: [],
    loc: [],
    q: [],
  };
  if (f.view === "new") parts.base.push(gte(seenAt, hoursAgo(WINDOWS[window])), notInArray(j.source, RETIRED_SOURCES));

  if (f.category === "tech") parts.category.push(ne(j.category, "other"));
  else if (f.category !== "all") parts.category.push(eq(j.category, f.category));

  if (f.fit !== "all") parts.fit.push(eq(j.fit, f.fit === "ready" ? "fit" : f.fit));

  if (f.salary === "meets") parts.salary.push(eq(j.salaryBucket, "meets"));
  else if (f.salary === "ok") {
    parts.salary.push(inArray(j.salaryBucket, prefs.showUnknownSalary ? ["meets", "possible", "unknown"] : ["meets", "possible"]));
  }

  if (f.loc === "pref" && prefs.locations.length) {
    const spellings = prefs.locations.flatMap((l) => CITY_SPELLINGS[l.toLowerCase().trim()] ?? [l.trim()]);
    parts.loc.push(or(eq(j.isRemote, true), ...spellings.filter(Boolean).map((s) => ilike(j.location, `%${s}%`)))!);
  }
  if (f.q) {
    const like = `%${f.q}%`;
    parts.q.push(or(ilike(j.title, like), ilike(j.company, like), ilike(j.description, like))!);
  }
  return parts;
}

async function baseConditions(uid: string, f: JobFilters, includeCategory: boolean): Promise<SQL[]> {
  const p = await filterParts(uid, f);
  return [...p.base, ...p.company, ...(includeCategory ? p.category : []), ...p.fit, ...p.salary, ...p.loc, ...p.q];
}

async function countWhere(conds: SQL[]): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(conds.length ? and(...conds) : undefined);
  return row?.n ?? 0;
}

export interface FilterSummary {
  /** Jobs in this view and time window before any other filter. */
  total: number;
  shown: number;
  /** How many each filter removes, applied in this order. */
  hidden: { company: number; category: number; fit: number; salary: number; loc: number; q: number };
  /** Same filters over longer windows, so we can suggest one when this window is empty. */
  longer: { window: WindowKey; shown: number }[];
}

/** Explains an empty or short feed: what's there, and which filter hides how much. */
export async function filterSummary(uid: string, f: JobFilters): Promise<FilterSummary> {
  const p = await filterParts(uid, f);
  const steps = ["company", "category", "fit", "salary", "loc", "q"] as const;
  const counts: number[] = [];
  let conds = [...p.base];
  counts.push(await countWhere(conds));
  for (const s of steps) {
    if (p[s].length) {
      conds = [...conds, ...p[s]];
      counts.push(await countWhere(conds));
    } else counts.push(counts[counts.length - 1]);
  }
  const hidden = Object.fromEntries(steps.map((s, i) => [s, counts[i] - counts[i + 1]])) as FilterSummary["hidden"];

  const longer: FilterSummary["longer"] = [];
  if (f.view === "new") {
    const keys = Object.keys(WINDOWS) as WindowKey[];
    for (const w of keys.slice(keys.indexOf(f.window) + 1)) {
      const lp = await filterParts(uid, f, w);
      longer.push({ window: w, shown: await countWhere(steps.flatMap((s) => lp[s]).concat(lp.base)) });
    }
  }
  return { total: counts[0], shown: counts[counts.length - 1], hidden, longer };
}

/** Every column of a job except the description (~4.5 KB each, ~0.7 MB for a full page of 150). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- taken out on purpose; the rest are the list columns
const { description: _description, ...listColumns } = getTableColumns(schema.jobs);

/**
 * The Jobs list. Descriptions stay in the database (the card loads one with getJobDescription when
 * "Details" is opened): sending all 150 on every visit and filter click used up Neon's free
 * network allowance.
 */
export async function listJobs(uid: string, f: JobFilters, limit = 150): Promise<JobListItem[]> {
  const db = await getDb();
  const order = f.sort === "recent" ? [desc(seenAt), desc(schema.jobs.score)] : [desc(schema.jobs.score), desc(seenAt)];
  return db
    .select({ ...listColumns, hasDescription: sql<boolean>`length(${schema.jobs.description}) > 0` })
    .from(schema.jobs)
    .where(and(...(await baseConditions(uid, f, true))))
    .orderBy(...order)
    .limit(limit);
}

/** How many jobs get each verdict under the current filters (ignoring the fit filter itself). */
export async function fitCounts(uid: string, f: JobFilters): Promise<Record<"fit" | "check" | "no" | "all", number>> {
  const db = await getDb();
  const p = await filterParts(uid, f);
  const rows = await db
    .select({ fit: schema.jobs.fit, n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(and(...p.base, ...p.company, ...p.category, ...p.salary, ...p.loc, ...p.q))
    .groupBy(schema.jobs.fit);
  const out = { fit: 0, check: 0, no: 0, all: 0 };
  for (const r of rows) {
    if (r.fit === "fit" || r.fit === "check" || r.fit === "no") out[r.fit] = r.n;
    out.all += r.n;
  }
  return out;
}

/** Job counts per category for the current filters (ignoring the category chip itself). */
export async function categoryCounts(uid: string, f: JobFilters): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ category: schema.jobs.category, n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(and(...(await baseConditions(uid, f, false))))
    .groupBy(schema.jobs.category);
  const out: Record<string, number> = { all: 0, tech: 0 };
  for (const r of rows) {
    out[r.category] = r.n;
    out.all += r.n;
    if (r.category !== "other") out.tech += r.n;
  }
  // The Internship chip shows every internship whatever the verdict (they're never "ready to
  // apply" for a full-time search), so count them that way too.
  const [interns] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(and(...(await baseConditions(uid, { ...f, fit: "all" }, false)), eq(schema.jobs.category, "internship")));
  out.internship = interns?.n ?? 0;
  return out;
}

/** Jobs per company in the New feed from company careers sites (last 30 days), for the Companies list. */
export async function careerSiteCounts(uid: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ company: schema.jobs.company, n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.userId, uid), inArray(schema.jobs.source, [...CAREER_SOURCES]), eq(schema.jobs.status, "new"), gte(seenAt, hoursAgo(720))),
    )
    .groupBy(schema.jobs.company);
  return Object.fromEntries(rows.map((r) => [r.company, r.n]));
}

export interface CompanyCount {
  company: string;
  /** Jobs that match your other filters. */
  n: number;
  /** All its jobs in this view and time window. */
  total: number;
}

/** Every company with jobs in this view and time window, busiest first (ignoring the company filter itself). */
export async function companyCounts(uid: string, f: JobFilters): Promise<CompanyCount[]> {
  const db = await getDb();
  const p = await filterParts(uid, f);
  const others = [...p.category, ...p.fit, ...p.salary, ...p.loc, ...p.q];
  const matching = others.length ? and(...others)! : sql`true`;
  const n = sql<number>`(count(*) filter (where ${matching}))::int`;
  return db
    .select({ company: schema.jobs.company, n, total: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(and(...p.base, ne(schema.jobs.company, "")))
    .groupBy(schema.jobs.company)
    .orderBy(desc(n), desc(sql`count(*)`), asc(schema.jobs.company));
}

/** Sorts "ready to apply" jobs ahead of ones that still need a look. */
const readyFirst = sql`(${schema.jobs.fit} = 'fit') desc`;

/** Everything the job page shows. */
export async function jobPageData(uid: string, id: string) {
  const db = await getDb();
  const job = await getJob(uid, id);
  if (!job) return null;
  const [application] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.jobId, id), eq(schema.applications.userId, uid)));
  const [versions, moreFromCompany, similar] = await Promise.all([
    resumesForJob(uid, id),
    db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, uid),
          eq(schema.jobs.company, job.company),
          ne(schema.jobs.id, id),
          ne(schema.jobs.status, "skipped"),
          ne(schema.jobs.fit, "no"),
        ),
      )
      .orderBy(readyFirst, desc(schema.jobs.score))
      .limit(4),
    db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, uid),
          eq(schema.jobs.category, job.category),
          ne(schema.jobs.company, job.company),
          eq(schema.jobs.status, "new"),
          ne(schema.jobs.fit, "no"),
          gte(seenAt, hoursAgo(24 * 7)),
          notInArray(schema.jobs.source, RETIRED_SOURCES),
        ),
      )
      .orderBy(readyFirst, desc(schema.jobs.score), desc(seenAt))
      .limit(4),
  ]);
  return { job, application: application ?? null, versions, moreFromCompany, similar };
}

/** One of this person's jobs (null if it doesn't exist or isn't theirs). */
export async function getJob(uid: string, id: string) {
  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, uid)));
  return job ?? null;
}

export async function listApplications(uid: string) {
  const db = await getDb();
  return db.select().from(schema.applications).where(eq(schema.applications.userId, uid)).orderBy(desc(schema.applications.updatedAt));
}

export async function getApplication(uid: string, id: string) {
  const db = await getDb();
  const [app] = await db.select().from(schema.applications).where(and(eq(schema.applications.id, id), eq(schema.applications.userId, uid)));
  if (!app) return null;
  const events = await db
    .select()
    .from(schema.applicationEvents)
    .where(eq(schema.applicationEvents.applicationId, id))
    .orderBy(desc(schema.applicationEvents.createdAt));
  const job = app.jobId ? await getJob(uid, app.jobId) : null;
  const resumes = await db
    .select()
    .from(schema.resumeVersions)
    .where(
      and(
        eq(schema.resumeVersions.userId, uid),
        or(eq(schema.resumeVersions.applicationId, id), app.jobId ? eq(schema.resumeVersions.jobId, app.jobId) : sql`false`),
      ),
    )
    .orderBy(desc(schema.resumeVersions.createdAt));
  return { app, events, job, resumes };
}

/** Latest base resume per track. */
export async function getBaseResumes(uid: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.resumeVersions)
    .where(and(eq(schema.resumeVersions.userId, uid), eq(schema.resumeVersions.isBase, true)))
    .orderBy(desc(schema.resumeVersions.createdAt));
  const out: Record<string, (typeof rows)[number]> = {};
  for (const r of rows) out[r.track] ??= r;
  return out;
}

export async function resumesForJob(uid: string, jobId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.resumeVersions)
    .where(and(eq(schema.resumeVersions.userId, uid), eq(schema.resumeVersions.jobId, jobId), eq(schema.resumeVersions.isBase, false)))
    .orderBy(desc(schema.resumeVersions.createdAt));
}

/** Every resume you tailored for a job, newest first, with the job it was for. */
export async function listTailoredResumes(uid: string) {
  const db = await getDb();
  return db
    .select({
      id: schema.resumeVersions.id,
      label: schema.resumeVersions.label,
      track: schema.resumeVersions.track,
      createdAt: schema.resumeVersions.createdAt,
      jobId: schema.resumeVersions.jobId,
      jobTitle: schema.jobs.title,
      company: schema.jobs.company,
      // Same test as isLatex(), done in the database so the list doesn't download every resume.
      isLatex: sql<boolean>`(strpos(${schema.resumeVersions.content}, '\\documentclass') > 0)`,
    })
    .from(schema.resumeVersions)
    .leftJoin(schema.jobs, eq(schema.resumeVersions.jobId, schema.jobs.id))
    .where(and(eq(schema.resumeVersions.userId, uid), eq(schema.resumeVersions.isBase, false)))
    .orderBy(desc(schema.resumeVersions.createdAt));
}

/**
 * Every resume, for putting on an application as a PDF: uploaded PDFs as they are; LaTeX and
 * text resumes become PDFs the first time they're needed. Contents stay in the database: only
 * the facts the list needs travel.
 */
export async function pdfResumes(uid: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.resumeVersions.id,
      label: schema.resumeVersions.label,
      track: schema.resumeVersions.track,
      isBase: schema.resumeVersions.isBase,
      jobId: schema.resumeVersions.jobId,
      createdAt: schema.resumeVersions.createdAt,
      jobTitle: schema.jobs.title,
      company: schema.jobs.company,
      isLatex: sql<boolean>`(strpos(${schema.resumeVersions.content}, '\\documentclass') > 0)`,
      hasFile: sql<boolean>`exists (select 1 from ${schema.resumeFiles} where ${schema.resumeFiles.resumeId} = ${schema.resumeVersions.id})`,
    })
    .from(schema.resumeVersions)
    .leftJoin(schema.jobs, eq(schema.resumeVersions.jobId, schema.jobs.id))
    .where(eq(schema.resumeVersions.userId, uid))
    .orderBy(desc(schema.resumeVersions.createdAt));
  return rows;
}

export async function getResume(uid: string, id: string) {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.resumeVersions)
    .where(and(eq(schema.resumeVersions.id, id), eq(schema.resumeVersions.userId, uid)));
  return r ?? null;
}

/** This person's fetches plus the shared company-careers fetches. */
export async function recentFetchRuns(uid: string, limit = 15) {
  const db = await getDb();
  return db
    .select()
    .from(schema.fetchRuns)
    .where(inArray(schema.fetchRuns.userId, [uid, ""]))
    .orderBy(desc(schema.fetchRuns.startedAt))
    .limit(limit);
}

export async function dashboardData(uid: string) {
  const db = await getDb();
  // "Ready to apply": the verdict already rules out senior, non-tech and underpaid roles.
  const relevant = (hours: number, verdict = "fit") =>
    and(eq(schema.jobs.userId, uid), eq(schema.jobs.status, "new"), gte(seenAt, hoursAgo(hours)), eq(schema.jobs.fit, verdict), notInArray(schema.jobs.source, RETIRED_SOURCES));
  const byCategory = async (hours: number) =>
    db
      .select({ category: schema.jobs.category, n: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(relevant(hours))
      .groupBy(schema.jobs.category);

  const [last24, last48, needsLook, top, apps, totalJobs] = await Promise.all([
    byCategory(24),
    byCategory(48),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(relevant(48, "check")),
    db.select().from(schema.jobs).where(relevant(48)).orderBy(desc(schema.jobs.score), desc(seenAt)).limit(6),
    db.select().from(schema.applications).where(eq(schema.applications.userId, uid)).orderBy(asc(schema.applications.followUpAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.userId, uid)),
  ]);
  return { last24, last48, needsLook: needsLook[0]?.n ?? 0, top, apps, totalJobs: totalJobs[0]?.n ?? 0 };
}
