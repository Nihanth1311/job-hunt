import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Application, Job } from "./db/schema";
import { STATUS_LABEL, type AppStatus } from "./types";

const FOLLOW_UP_DAYS = 7;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

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
