import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getJob } from "@/lib/queries";
import { replaceJobDescription } from "@/lib/jobs";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/** JSON turns dates into strings; put them back for the timestamp columns (postedAt, createdAt…). */
function revive<T>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: Row) => {
    const out: Row = { ...r };
    for (const [k, v] of Object.entries(out)) {
      if (/At$/.test(k) && typeof v === "string") out[k] = new Date(v);
    }
    return out as T;
  });
}

/**
 * Restore from a file made by /api/export. Only adds what's missing (by id) and swaps a short
 * preview for the full description the backup had. Nothing that exists now is overwritten.
 */
export async function POST(req: Request) {
  const { id: uid } = await requireUser();
  let backup: Row;
  try {
    backup = await req.json();
  } catch {
    return Response.json({ error: "That isn't a Job Hunt export file." }, { status: 400 });
  }
  if (!Array.isArray(backup.jobs)) return Response.json({ error: "That isn't a Job Hunt export file." }, { status: 400 });

  const db = await getDb();
  const added = { jobs: 0, descriptions: 0, applications: 0, applicationEvents: 0, resumeVersions: 0 };

  // Everything imported becomes yours, whatever the file says.
  const jobs = revive<typeof schema.jobs.$inferInsert>(backup.jobs).map((j) => ({ ...j, userId: uid }));
  for (let i = 0; i < jobs.length; i += 100) {
    const rows = await db.insert(schema.jobs).values(jobs.slice(i, i + 100)).onConflictDoNothing().returning({ id: schema.jobs.id });
    added.jobs += rows.length;
  }
  for (const j of jobs) {
    if (j.descriptionIsPreview || !j.description || j.description.length < 600) continue;
    const now = await getJob(uid, j.id);
    if (now?.descriptionIsPreview) {
      await replaceJobDescription(uid, j.id, j.description);
      added.descriptions++;
    }
  }

  const apps = revive<typeof schema.applications.$inferInsert>(backup.applications).map((a) => ({ ...a, userId: uid }));
  if (apps.length) added.applications = (await db.insert(schema.applications).values(apps).onConflictDoNothing().returning()).length;

  // Timeline entries only for tracker entries that are yours.
  const mine = new Set(
    (await db.select({ id: schema.applications.id }).from(schema.applications).where(eq(schema.applications.userId, uid))).map((a) => a.id),
  );
  const events = revive<typeof schema.applicationEvents.$inferInsert>(backup.applicationEvents).filter((e) => mine.has(e.applicationId));
  if (events.length) added.applicationEvents = (await db.insert(schema.applicationEvents).values(events).onConflictDoNothing().returning()).length;

  const resumes = revive<typeof schema.resumeVersions.$inferInsert>(backup.resumeVersions).map((r) => ({
    ...r,
    userId: uid,
    applicationId: r.applicationId && mine.has(r.applicationId) ? r.applicationId : null,
  }));
  if (resumes.length) added.resumeVersions = (await db.insert(schema.resumeVersions).values(resumes).onConflictDoNothing().returning()).length;

  revalidatePath("/", "layout");
  return Response.json({ ok: true, added });
}
