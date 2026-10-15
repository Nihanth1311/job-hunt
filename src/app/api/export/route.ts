import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { getDb, schema } from "@/server/db";

export const dynamic = "force-dynamic";

/** Download everything of yours: your data, your copy. (API keys are left out on purpose.) */
export async function GET() {
  const { id: uid } = await requireUser();
  const db = await getDb();
  const [jobs, applications, resumeVersions, resumeFileRows, settings] = await Promise.all([
    db.select().from(schema.jobs).where(eq(schema.jobs.userId, uid)),
    db.select().from(schema.applications).where(eq(schema.applications.userId, uid)),
    db.select().from(schema.resumeVersions).where(eq(schema.resumeVersions.userId, uid)),
    // Uploaded PDFs only: compiled LaTeX is made again from the resume itself.
    db
      .select()
      .from(schema.resumeFiles)
      .where(and(eq(schema.resumeFiles.userId, uid), eq(schema.resumeFiles.source, "upload"))),
    db.select().from(schema.settings).where(eq(schema.settings.userId, uid)),
  ]);
  const applicationEvents = applications.length
    ? await db
        .select()
        .from(schema.applicationEvents)
        .where(
          inArray(
            schema.applicationEvents.applicationId,
            applications.map((a) => a.id),
          ),
        )
    : [];
  const resumeFiles = resumeFileRows.map((f) => ({ ...f, pdf: f.pdf.toString("base64") }));
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), jobs, applications, applicationEvents, resumeVersions, resumeFiles, settings },
    null,
    2,
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="job-hunt-export-${date}.json"`,
    },
  });
}
