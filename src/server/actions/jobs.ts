"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { trackJob, unsaveJob as untrack } from "../services/applications";
import { requireUser } from "../auth";
import { getDb, schema } from "../db";
import { getSecrets, getState } from "../services/settings";
import { findOnGoogleJobs } from "../fetching/sources/jsearch";
import { replaceJobDescription, rescoreAll } from "../services/jobs";
import { getJob } from "../services/queries";

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
