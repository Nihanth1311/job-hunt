import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Application, Job } from "../db/schema";
import { STATUS_LABEL, type AppStatus } from "@/shared/types";

const FOLLOW_UP_DAYS = 7;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

/** How long a rejected application stays in the tracker before it's deleted for good. */
export const REJECTED_KEEP_MS = 24 * 3_600_000;

/**
 * Rejected applications a day after they were moved there (or last touched): deleted for good,
 * with their timeline and their job, so nothing of them stays in the database. Resumes you
 * tailored for them stay in your resume library. Runs with the scheduler's cleanup.
 */
export async function cleanupRejected(): Promise<number> {
  const db = await getDb();
  const old = await db
    .select({ id: schema.applications.id, jobId: schema.applications.jobId })
    .from(schema.applications)
    .where(and(eq(schema.applications.status, "rejected"), lt(schema.applications.updatedAt, new Date(Date.now() - REJECTED_KEEP_MS))));
  if (!old.length) return 0;
  // Timeline entries go with the application (ON DELETE CASCADE); autofill runs go with the job.
  await db.delete(schema.applications).where(inArray(schema.applications.id, old.map((a) => a.id)));
  const jobIds = old.map((a) => a.jobId).filter((id): id is string => !!id);
  if (jobIds.length) await db.delete(schema.jobs).where(inArray(schema.jobs.id, jobIds));
  return old.length;
}

/** Keep the job feed in sync with what you're doing in the tracker. */
function jobStatusFor(status: AppStatus): "saved" | "applied" {
  return status === "saved" ? "saved" : "applied";
}

export async function addEvent(applicationId: string, type: "created" | "status" | "note", message: string) {
  const db = await getDb();
  await db.insert(schema.applicationEvents).values({ id: randomUUID(), applicationId, type, message });
}

export async function createApplication(userId: string, input: {
  jobId?: string | null;
  company: string;
  title: string;
  url?: string;
  track: string;
  status: AppStatus;
  notes?: string;
}): Promise<Application> {
  const db = await getDb();
  const applied = input.status !== "saved";
  const [app] = await db
    .insert(schema.applications)
    .values({
      id: randomUUID(),
      userId,
      jobId: input.jobId ?? null,
      company: input.company,
      title: input.title,
      url: input.url ?? "",
      track: input.track,
      status: input.status,
      notes: input.notes ?? "",
      appliedAt: applied ? new Date() : null,
      followUpAt: input.status === "applied" ? inDays(FOLLOW_UP_DAYS) : null,
    })
    .returning();
  await addEvent(app.id, "created", `Added as ${STATUS_LABEL[input.status]}`);
  if (input.jobId) {
    await db
      .update(schema.jobs)
      .set({ status: jobStatusFor(input.status) })
      .where(and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.userId, userId)));
  }
  return app;
}

/** One of this person's applications, or null (also when it belongs to someone else). */
export async function ownApplication(userId: string, id: string): Promise<Application | null> {
  const db = await getDb();
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, userId)));
  return app ?? null;
}

export async function setApplicationStatus(userId: string, id: string, status: AppStatus): Promise<void> {
  const db = await getDb();
  const app = await ownApplication(userId, id);
  if (!app || app.status === status) return;

  const patch: Partial<Application> = { status, updatedAt: new Date() };
  if (status !== "saved" && !app.appliedAt) patch.appliedAt = new Date();
  if (status === "applied" && !app.followUpAt) patch.followUpAt = inDays(FOLLOW_UP_DAYS);
  if (status === "offer" || status === "rejected" || status === "saved") patch.followUpAt = null;

  await db.update(schema.applications).set(patch).where(eq(schema.applications.id, id));
  await addEvent(id, "status", `${STATUS_LABEL[app.status as AppStatus] ?? app.status} → ${STATUS_LABEL[status]}`);
  if (app.jobId) {
    await db
      .update(schema.jobs)
      .set({ status: jobStatusFor(status) })
      .where(and(eq(schema.jobs.id, app.jobId), eq(schema.jobs.userId, userId)));
  }
}

/** Save or apply to a job from the feed, creating the tracker entry if needed. */
export async function trackJob(userId: string, job: Job, status: AppStatus): Promise<Application> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.jobId, job.id), eq(schema.applications.userId, userId)));
  if (existing) {
    await setApplicationStatus(userId, existing.id, status);
    return existing;
  }
  return createApplication(userId, {
    jobId: job.id,
    company: job.company,
    title: job.title,
    url: job.companyUrl ?? job.url,
    track: job.track,
    status,
  });
}

/**
 * Undo "Save": drop the tracker entry and put the job back in the New feed.
 * Only for jobs still at "Saved"; once you've applied, the tracker entry is history worth keeping.
 */
export async function unsaveJob(userId: string, jobId: string): Promise<void> {
  const db = await getDb();
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.jobId, jobId), eq(schema.applications.userId, userId)));
  if (app && app.status !== "saved") return;
  if (app) await db.delete(schema.applications).where(eq(schema.applications.id, app.id));
  await db.update(schema.jobs).set({ status: "new" }).where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)));
}
