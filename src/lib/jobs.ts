import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { analyzeJob, dedupeKey, type RawJob } from "./core/analyze";
import { cleanTitle, normalizeChars } from "./core/text";
import { getDb, schema } from "./db";
import type { Job, NewJob } from "./db/schema";
import { OWNER_ID } from "./auth/owner";
import { getPreferences, getProfile, getState, setState } from "./settings";
import type { Preferences, Profile } from "./types";

/**
 * A job's id in one person's feed. The owner's ids keep their pre-accounts form so nothing
 * that points at them (tracker entries, tailored resumes) breaks.
 */
export function jobId(userId: string, source: string, externalId: string): string {
  const base = userId === OWNER_ID ? `${source}:${externalId}` : `${userId}:${source}:${externalId}`;
  return createHash("sha1").update(base).digest("hex").slice(0, 20);
}

export function toNewJob(userId: string, raw: RawJob, profile: Profile, prefs: Preferences): NewJob {
  const a = analyzeJob(raw, profile, prefs);
  return {
    id: jobId(userId, raw.source, raw.externalId),
    userId,
    dedupeKey: dedupeKey(raw),
    source: raw.source,
    publisher: raw.publisher ?? null,
    title: cleanTitle(raw.title).slice(0, 300),
    company: raw.company.slice(0, 200),
    location: raw.location.slice(0, 300),
    isRemote: Boolean(raw.isRemote),
    url: raw.url,
    companyUrl: raw.companyUrl || null,
    description: normalizeChars(raw.description).slice(0, 20_000),
    descriptionIsPreview: Boolean(raw.descriptionIsPreview),
    postedAt: raw.postedAt && !Number.isNaN(raw.postedAt.getTime()) ? raw.postedAt : null,
    salaryMinLpa: a.salary?.min ?? null,
    salaryMaxLpa: a.salary?.max ?? null,
    salaryEstimated: a.salaryEstimated,
    salaryBucket: a.salaryBucket,
    mentionsCtc: a.mentionsCtc,
    category: a.category,
    track: a.track,
    expMin: a.experience.min,
    expMax: a.experience.max,
    expFit: a.expFit,
    requiredExpMonths: raw.requiredExpMonths ?? null,
    fit: a.fit.verdict,
    fitReasons: a.fit.reasons,
    score: a.score,
    skills: a.skills,
    matchedSkills: a.matchedSkills,
    missingSkills: a.missingSkills,
  };
}

const MAX_AGE_DAYS = 30;

/** When a job appeared: its posting date if the source gave one, else when we first saw it. */
export const seenAt = sql<Date>`coalesce(${schema.jobs.postedAt}, ${schema.jobs.firstSeenAt})`;

/** ISO timestamp `hours` ago, for comparing against `seenAt`. */
export const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/**
 * Insert jobs we haven't seen before (by id or by company+title+city). Returns the new ones.
 * When a job we already have turns up again with a company-site link (e.g. found on Adzuna
 * first, then on the company's careers page), the stored copy gets that link.
 */
export async function insertJobs(userId: string, rows: NewJob[]): Promise<Job[]> {
  const db = await getDb();
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = rows.filter((r) => r.userId === userId && (!r.postedAt || r.postedAt.getTime() >= cutoff));
  const inserted: Job[] = [];
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    inserted.push(...(await db.insert(schema.jobs).values(chunk).onConflictDoNothing().returning()));
  }

  const insertedKeys = new Set(inserted.map((j) => j.dedupeKey));
  const upgrades = fresh.filter((r) => r.companyUrl && !insertedKeys.has(r.dedupeKey));
  for (let i = 0; i < upgrades.length; i += 200) {
    const values = sql.join(
      upgrades.slice(i, i + 200).map((r) => sql`(${r.dedupeKey}, ${r.id}, ${r.companyUrl})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${schema.jobs} SET company_url = v.url
      FROM (VALUES ${values}) AS v(key, id, url)
      WHERE ${schema.jobs.userId} = ${userId} AND (${schema.jobs.dedupeKey} = v.key OR ${schema.jobs.id} = v.id) AND ${schema.jobs.companyUrl} IS NULL`);
  }

  // Same job, but this source has the full description (e.g. Google Jobs or the company page
  // for an Adzuna preview): swap it in, so the job can be checked properly.
  const full = fresh.filter((r) => !insertedKeys.has(r.dedupeKey) && !r.descriptionIsPreview && (r.description ?? "").length > 600);
  if (full.length) {
    const previews = await db
      .select({ id: schema.jobs.id, dedupeKey: schema.jobs.dedupeKey })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          inArray(schema.jobs.dedupeKey, full.map((r) => r.dedupeKey)),
          eq(schema.jobs.descriptionIsPreview, true),
        ),
      );
    for (const p of previews) {
      const r = full.find((x) => x.dedupeKey === p.dedupeKey)!;
      if (r.requiredExpMonths != null) {
        await db.update(schema.jobs).set({ requiredExpMonths: r.requiredExpMonths }).where(eq(schema.jobs.id, p.id));
      }
      await replaceJobDescription(userId, p.id, r.description!);
    }
  }
  return inserted;
}

/**
 * A job link someone shared from their own feed (job ids are per person). Returns the id of the
 * same job in `userId`'s feed, adding it there (scored for them) if they don't have it yet, or
 * null if no such job exists. Only the posting is copied; the sharer's tracker and notes stay theirs.
 */
export async function adoptSharedJob(userId: string, id: string): Promise<string | null> {
  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) return null;
  if (job.userId === userId) return job.id;
  const mine = and(eq(schema.jobs.userId, userId), eq(schema.jobs.dedupeKey, job.dedupeKey));
  const [have] = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(mine);
  if (have) return have.id;

  const [profile, prefs] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  const row = toNewJob(
    userId,
    {
      source: job.source,
      externalId: `shared:${job.id}`,
      title: job.title,
      company: job.company,
      location: job.location,
      isRemote: job.isRemote,
      url: job.url,
      companyUrl: job.companyUrl,
      description: job.description,
      descriptionIsPreview: job.descriptionIsPreview,
      postedAt: job.postedAt,
      salary:
        job.salaryMinLpa !== null || job.salaryMaxLpa !== null
          ? { min: job.salaryMinLpa, max: job.salaryMaxLpa, estimated: job.salaryEstimated }
          : undefined,
      publisher: job.publisher,
      requiredExpMonths: job.requiredExpMonths,
    },
    profile,
    prefs,
  );
  // Keep it even if it's older than the feed's 30-day window: someone chose to share it.
  await db.insert(schema.jobs).values(row).onConflictDoNothing();
  const [added] = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(mine);
  return added?.id ?? null;
}

/** Matching fields for a stored job, recomputed from its title and description. */
function reanalyze(
  j: Pick<Job, "title" | "description" | "descriptionIsPreview" | "requiredExpMonths" | "salaryMinLpa" | "salaryMaxLpa" | "salaryEstimated">,
  profile: Profile,
  prefs: Preferences,
) {
  const hasSalary = j.salaryMinLpa !== null || j.salaryMaxLpa !== null;
  const a = analyzeJob(
    {
      title: j.title,
      description: j.description,
      salary: hasSalary ? { min: j.salaryMinLpa, max: j.salaryMaxLpa, estimated: j.salaryEstimated } : undefined,
      descriptionIsPreview: j.descriptionIsPreview,
      requiredExpMonths: j.requiredExpMonths,
    },
    profile,
    prefs,
  );
  return {
    category: a.category,
    track: a.track,
    expMin: a.experience.min,
    expMax: a.experience.max,
    expFit: a.expFit,
    salaryMinLpa: a.salary?.min ?? null,
    salaryMaxLpa: a.salary?.max ?? null,
    salaryBucket: a.salaryBucket,
    mentionsCtc: a.mentionsCtc,
    fit: a.fit.verdict,
    fitReasons: a.fit.reasons,
    score: a.score,
    skills: a.skills,
    matchedSkills: a.matchedSkills,
    missingSkills: a.missingSkills,
  };
}

/** Re-run matching on every job in someone's feed, e.g. after they change their skills or salary floor. */
export async function rescoreAll(userId: string): Promise<number> {
  const db = await getDb();
  const [profile, prefs] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  const all = await db.select().from(schema.jobs).where(eq(schema.jobs.userId, userId));
  const rows = all.map((j) => ({ id: j.id, ...reanalyze(j, profile, prefs) }));
  // 200 jobs per statement: one round trip per batch instead of one per job (the database may be far away).
  const json = (v: unknown) => JSON.stringify(v);
  for (let i = 0; i < rows.length; i += 200) {
    const values = sql.join(
      rows
        .slice(i, i + 200)
        .map(
          (r) =>
            sql`(${r.id}, ${r.category}, ${r.track}, ${r.expMin}::int, ${r.expMax}::int, ${r.expFit}::boolean, ${r.salaryMinLpa}::real, ${r.salaryMaxLpa}::real, ${r.salaryBucket}, ${r.mentionsCtc}::boolean, ${r.fit}, ${json(r.fitReasons)}::jsonb, ${r.score}::int, ${json(r.skills)}::jsonb, ${json(r.matchedSkills)}::jsonb, ${json(r.missingSkills)}::jsonb)`,
        ),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${schema.jobs} AS j SET
        category = v.category, track = v.track, exp_min = v.exp_min, exp_max = v.exp_max, exp_fit = v.exp_fit,
        salary_min_lpa = v.salary_min_lpa, salary_max_lpa = v.salary_max_lpa, salary_bucket = v.salary_bucket,
        mentions_ctc = v.mentions_ctc, fit = v.fit, fit_reasons = v.fit_reasons, score = v.score,
        skills = v.skills, matched_skills = v.matched_skills, missing_skills = v.missing_skills
      FROM (VALUES ${values}) AS v(id, category, track, exp_min, exp_max, exp_fit, salary_min_lpa, salary_max_lpa,
        salary_bucket, mentions_ctc, fit, fit_reasons, score, skills, matched_skills, missing_skills)
      WHERE j.id = v.id AND j.user_id = ${userId}`);
  }
  return all.length;
}

/**
 * Bump when the scoring or fit rules change: each person's feed is re-scored once, the next
 * time they open the app (or at the next scheduled fetch), so old scores never linger.
 */
const SCORING_VERSION = 4;

export async function ensureScored(userId: string): Promise<void> {
  if ((await getState<number>(userId, "scoringVersion")) === SCORING_VERSION) return;
  await rescoreAll(userId);
  await setState(userId, "scoringVersion", SCORING_VERSION);
}

/** Swap in the full description you pasted (e.g. for an Adzuna preview) and re-match on it. */
export async function replaceJobDescription(userId: string, id: string, description: string): Promise<void> {
  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, userId)));
  if (!job) return;
  const [profile, prefs] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  const text = description.trim().slice(0, 20_000);
  await db
    .update(schema.jobs)
    .set({ description: text, descriptionIsPreview: false, ...reanalyze({ ...job, description: text, descriptionIsPreview: false }, profile, prefs) })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, userId)));
}

/** Forget old jobs nobody acted on (everyone's feed, and the shared pool). Saved/applied jobs are kept forever. */
export async function cleanupOldJobs(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString();
  await db
    .delete(schema.jobs)
    .where(and(inArray(schema.jobs.status, ["new", "skipped"]), lt(seenAt, cutoff)));
  await db.delete(schema.rawJobs).where(lt(schema.rawJobs.postedAt, new Date(cutoff)));
}
