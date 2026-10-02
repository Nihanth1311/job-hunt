"use server";

import { and, eq, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { trackJob, unsaveJob as untrack } from "@/lib/applications";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getSecrets, getState } from "@/lib/settings";
import { findOnGoogleJobs } from "@/lib/sources/jsearch";
import { adzunaAdId } from "@/lib/core/capture";
import { cleanTitle, normKey } from "@/lib/core/text";
import type { Job } from "@/lib/db/schema";
import { jobId, replaceJobDescription, rescoreAll } from "@/lib/jobs";
import { getJob } from "@/lib/queries";

const refreshAll = () => revalidatePath("/", "layout");

async function setJobStatus(id: string, status: "new" | "skipped") {
  const { id: uid } = await requireUser();
  const db = await getDb();
  await db.update(schema.jobs).set({ status }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, uid)));
  refreshAll();
}

export async function skipJob(id: string) {
  await setJobStatus(id, "skipped");
}

export async function restoreJob(id: string) {
  await setJobStatus(id, "new");
}

export async function saveJob(id: string) {
  const { id: uid } = await requireUser();
  const job = await getJob(uid, id);
  if (!job) return;
  await trackJob(uid, job, "saved");
  refreshAll();
}

/** Remove from Saved: the job goes back to the New list and leaves the tracker. */
export async function unsaveJob(id: string) {
  const { id: uid } = await requireUser();
  await untrack(uid, id);
  refreshAll();
}

export async function markApplied(id: string) {
  const { id: uid } = await requireUser();
  const job = await getJob(uid, id);
  if (!job) return;
  await trackJob(uid, job, "applied");
  refreshAll();
}

export async function saveFullDescription(id: string, description: string): Promise<string | null> {
  const { id: uid } = await requireUser();
  if (description.trim().length < 50) return "That looks too short to be the full description.";
  await replaceJobDescription(uid, id, description);
  refreshAll();
  return null;
}

export async function rescoreJobs(): Promise<number> {
  const { id: uid } = await requireUser();
  const n = await rescoreAll(uid);
  refreshAll();
  return n;
}

export interface CapturedJobMatch {
  id: string;
  title: string;
  company: string;
  descriptionIsPreview: boolean;
}

/** Which job in your feed a clipped page is about: same Adzuna ad, same link, or same company + title. */
export async function findCapturedJob(input: { url: string; title: string; company: string }): Promise<CapturedJobMatch | null> {
  const { id: uid } = await requireUser();
  const db = await getDb();
  const pick = (j: Job | undefined | null) =>
    j ? { id: j.id, title: j.title, company: j.company, descriptionIsPreview: j.descriptionIsPreview } : null;

  const adId = adzunaAdId(input.url);
  if (adId) {
    const byAd = await getJob(uid, jobId(uid, "adzuna", adId));
    if (byAd) return pick(byAd);
  }

  const bare = input.url.split(/[?#]/)[0];
  if (bare) {
    const [byUrl] = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, uid),
          or(sql`split_part(${schema.jobs.url}, '?', 1) = ${bare}`, sql`split_part(${schema.jobs.companyUrl}, '?', 1) = ${bare}`),
        ),
      )
      .limit(1);
    if (byUrl) return pick(byUrl);
  }

  if (input.title && input.company) {
    const prefix = `${normKey(input.company)}|${normKey(cleanTitle(input.title))}|`;
    const [byName] = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, uid), like(schema.jobs.dedupeKey, `${prefix}%`)))
      .limit(1);
    if (byName) return pick(byName);
  }
  return null;
}

/** Searches kept back for the daily Google Jobs run, so one-off checks can't use them all. */
const GOOGLE_JOBS_RESERVE = 10;

export type CheckResult = { ok: true; fit: string; reasons: string[] } | { ok: false; message: string };

/** Fetch a job's full description from Google Jobs (1 request, on your own key) and re-check whether you fit it. */
export async function checkWithGoogleJobs(id: string): Promise<CheckResult> {
  const { id: uid } = await requireUser();
  const { jsearchKey } = await getSecrets(uid);
  if (!jsearchKey) return { ok: false, message: "Add your Google Jobs (JSearch) key in Settings → Your API keys first." };
  const quota = await getState<{ remaining: number }>(uid, "jsearchQuota");
  if (quota && quota.remaining <= GOOGLE_JOBS_RESERVE) {
    return {
      ok: false,
      message: `Only ${quota.remaining} Google Jobs searches left this month, kept for your daily search. Use Clip instead.`,
    };
  }
  const job = await getJob(uid, id);
  if (!job) return { ok: false, message: "Job not found." };

  let found;
  try {
    found = await findOnGoogleJobs(uid, jsearchKey, job);
  } catch (e) {
    return { ok: false, message: `Google Jobs didn't answer (${e instanceof Error ? e.message : e}). Try again, or use Clip.` };
  }
  if (!found) return { ok: false, message: "Google Jobs doesn't list this job. Open the posting and use Clip instead." };

  const db = await getDb();
  await db
    .update(schema.jobs)
    .set({
      companyUrl: job.companyUrl ?? found.companyUrl ?? null,
      requiredExpMonths: found.requiredExpMonths ?? job.requiredExpMonths,
    })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, uid)));
  await replaceJobDescription(uid, id, found.description);
  const updated = await getJob(uid, id);
  refreshAll();
  return { ok: true, fit: updated?.fit ?? "check", reasons: updated?.fitReasons ?? [] };
}
