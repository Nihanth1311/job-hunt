import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { getDb, schema } from "@/server/db";
import { getJob } from "@/server/services/queries";
import { replaceJobDescription, rescoreAll } from "@/server/services/jobs";
import { looksLikePdf, MAX_PDF_BYTES } from "@/server/services/resume-files";
import { getProfile, savePreferences, saveProfile } from "@/server/services/settings";
import { safeHttpUrl } from "@/shared/core/links";
import { APP_STATUSES, DEFAULT_PREFERENCES, DEFAULT_PROFILE, TRACKS, type Preferences, type Profile } from "@/shared/types";

export const dynamic = "force-dynamic";

// A backup file is typed by a person, or by anyone who can sign in: every value in it is treated
// as untrusted. Three rules follow.
//   1. Everything imported becomes yours (user id is always the signed-in person's).
//   2. Nothing in the file may point at another person's rows. Links between rows (an
//      application's job, a resume's job or application) are kept only when the target is yours.
//   3. A job from the file never keeps the id it claims unless you already own that id. Job ids
//      are one namespace for everyone and some are predictable, so a crafted file could otherwise
//      take an id before its rightful owner's next fetch and block that job from their feed.

type Row = Record<string, unknown>;

/** How many rows of each kind one file may carry. */
const MAX_ROWS = { jobs: 20_000, applications: 5_000, events: 50_000, resumes: 5_000, files: 500 };

const rowsOf = (v: unknown, max: number): Row[] => (Array.isArray(v) ? (v.slice(0, max).filter((r) => r && typeof r === "object") as Row[]) : []);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : "");
const date = (v: unknown): Date | null => {
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown, max = 100) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max).map((x) => x.slice(0, 200)) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** The id an imported job gets in your feed: made from your id and the file's id, so it can't collide with anyone's real one. */
const importedJobId = (uid: string, original: string) => createHash("sha1").update(`${uid}:import:${original}`).digest("hex").slice(0, 20);

/**
 * Restore from a file made by /api/export. Only adds what's missing and swaps a short preview
 * for the full description the backup had. Nothing that exists now is overwritten.
 */
export async function POST(req: Request) {
  const { id: uid } = await requireUser();
  let backup: Row;
  try {
    backup = await req.json();
  } catch {
    return Response.json({ error: "That isn't a Job Hunt export file." }, { status: 400 });
  }
  if (!backup || typeof backup !== "object" || !Array.isArray(backup.jobs)) return Response.json({ error: "That isn't a Job Hunt export file." }, { status: 400 });

  const db = await getDb();
  const added = { profile: false, jobs: 0, descriptions: 0, applications: 0, applicationEvents: 0, resumeVersions: 0 };

  try {
    // Profile and preferences: only into a fresh account (no master resume yet), so a restore never
    // overwrites your edits. saveProfile / savePreferences rebuild both from known fields only.
    const saved = rowsOf(backup.settings, 500) as { key?: unknown; value?: unknown }[];
    const backupProfile = saved.find((x) => x.key === "profile")?.value as Partial<Profile> | undefined;
    const backupPrefs = saved.find((x) => x.key === "preferences")?.value as Partial<Preferences> | undefined;
    if (backupProfile && typeof backupProfile === "object" && !(await getProfile(uid)).masterResume.trim()) {
      await saveProfile(uid, { ...DEFAULT_PROFILE, ...backupProfile, skills: { ...DEFAULT_PROFILE.skills, ...backupProfile.skills } });
      if (backupPrefs && typeof backupPrefs === "object") await savePreferences(uid, { ...DEFAULT_PREFERENCES, ...backupPrefs });
      added.profile = true;
    }

    // ---- Jobs. Each row is rebuilt field by field; scores are recomputed at the end.
    const mineBefore = new Set((await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.userId, uid))).map((j) => j.id));
    /** file's job id → the id that job has in your feed (filled in below). */
    const jobIdFor = new Map<string, string>();
    const jobs: (typeof schema.jobs.$inferInsert)[] = [];
    /** new id → the file's id, for the jobs we try to insert. */
    const originalOf = new Map<string, string>();
    for (const j of rowsOf(backup.jobs, MAX_ROWS.jobs)) {
      const original = id(j.id);
      const title = str(j.title, 300).trim();
      const company = str(j.company, 200).trim();
      const dedupeKey = str(j.dedupeKey, 600);
      if (!original || !title || !company || !dedupeKey) continue;
      const mine = mineBefore.has(original);
      jobIdFor.set(original, mine ? original : importedJobId(uid, original));
      if (mine) continue; // already here
      originalOf.set(importedJobId(uid, original), original);
      jobs.push({
        id: importedJobId(uid, original),
        userId: uid,
        dedupeKey,
        source: str(j.source, 40) || "manual",
        publisher: str(j.publisher, 100) || null,
        title,
        company,
        location: str(j.location, 300),
        isRemote: j.isRemote === true,
        url: safeHttpUrl(j.url),
        companyUrl: safeHttpUrl(j.companyUrl) || null,
        description: str(j.description, 20_000),
        descriptionIsPreview: j.descriptionIsPreview === true,
        postedAt: date(j.postedAt),
        firstSeenAt: date(j.firstSeenAt) ?? new Date(),
        salaryMinLpa: num(j.salaryMinLpa),
        salaryMaxLpa: num(j.salaryMaxLpa),
        salaryEstimated: j.salaryEstimated === true,
        requiredExpMonths: num(j.requiredExpMonths) === null ? null : Math.round(num(j.requiredExpMonths)!),
        skills: strings(j.skills),
        status: oneOf(j.status, ["new", "saved", "skipped", "applied"] as const, "new"),
      });
    }
    for (let i = 0; i < jobs.length; i += 100) {
      const rows = await db.insert(schema.jobs).values(jobs.slice(i, i + 100)).onConflictDoNothing().returning({ id: schema.jobs.id });
      added.jobs += rows.length;
    }
    // A job that wasn't inserted is one you already have under another id (same company, title and
    // city): point the file's id at that one. Whatever is left unmatched points at nothing.
    const mineNow = new Map((await db.select({ id: schema.jobs.id, key: schema.jobs.dedupeKey }).from(schema.jobs).where(eq(schema.jobs.userId, uid))).map((j) => [j.id, j.key]));
    const byKey = new Map([...mineNow].map(([jid, key]) => [key, jid]));
    for (const j of jobs) {
      if (mineNow.has(j.id)) continue;
      const original = originalOf.get(j.id);
      const same = byKey.get(j.dedupeKey);
      if (!original) continue;
      if (same) jobIdFor.set(original, same);
      else jobIdFor.delete(original);
    }
    const myJob = (v: unknown): string | null => {
      const mapped = jobIdFor.get(id(v));
      return mapped && mineNow.has(mapped) ? mapped : null;
    };
    for (const j of rowsOf(backup.jobs, MAX_ROWS.jobs)) {
      const target = myJob(j.id);
      const text = str(j.description, 20_000);
      if (!target || j.descriptionIsPreview === true || text.length < 600) continue;
      const now = await getJob(uid, target);
      if (now?.descriptionIsPreview) {
        await replaceJobDescription(uid, target, text);
        added.descriptions++;
      }
    }

    // ---- Tracker entries. Their job link survives only if that job is yours.
    const apps: (typeof schema.applications.$inferInsert)[] = [];
    for (const a of rowsOf(backup.applications, MAX_ROWS.applications)) {
      const aid = id(a.id);
      const company = str(a.company, 200).trim();
      const title = str(a.title, 300).trim();
      if (!aid || !company || !title) continue;
      apps.push({
        id: aid,
        userId: uid,
        jobId: myJob(a.jobId),
        company,
        title,
        url: safeHttpUrl(a.url),
        track: oneOf(a.track, TRACKS, "fullstack"),
        status: oneOf(a.status, APP_STATUSES, "saved"),
        appliedAt: date(a.appliedAt),
        followUpAt: date(a.followUpAt),
        notes: str(a.notes, 20_000),
        createdAt: date(a.createdAt) ?? new Date(),
        // "Now", not the file's date: a restored Rejected entry gets its full day before cleanup.
        updatedAt: new Date(),
      });
    }
    for (let i = 0; i < apps.length; i += 200) {
      added.applications += (await db.insert(schema.applications).values(apps.slice(i, i + 200)).onConflictDoNothing().returning({ id: schema.applications.id })).length;
    }

    // Timeline entries only for tracker entries that are yours.
    const mine = new Set(
      (await db.select({ id: schema.applications.id }).from(schema.applications).where(eq(schema.applications.userId, uid))).map((a) => a.id),
    );
    const events: (typeof schema.applicationEvents.$inferInsert)[] = [];
    for (const e of rowsOf(backup.applicationEvents, MAX_ROWS.events)) {
      const eid = id(e.id);
      const applicationId = id(e.applicationId);
      if (!eid || !mine.has(applicationId)) continue;
      events.push({ id: eid, applicationId, type: oneOf(e.type, ["created", "status", "note"] as const, "note"), message: str(e.message, 4000), createdAt: date(e.createdAt) ?? new Date() });
    }
    for (let i = 0; i < events.length; i += 500) {
      added.applicationEvents += (await db.insert(schema.applicationEvents).values(events.slice(i, i + 500)).onConflictDoNothing().returning({ id: schema.applicationEvents.id })).length;
    }

    // ---- Resumes. Job and application links only to your own rows.
    const resumes: (typeof schema.resumeVersions.$inferInsert)[] = [];
    for (const r of rowsOf(backup.resumeVersions, MAX_ROWS.resumes)) {
      const rid = id(r.id);
      const content = str(r.content, 200_000);
      if (!rid || !content.trim()) continue;
      const applicationId = id(r.applicationId);
      resumes.push({
        id: rid,
        userId: uid,
        track: oneOf(r.track, TRACKS, "fullstack"),
        label: str(r.label, 200),
        content,
        isBase: r.isBase === true,
        jobId: myJob(r.jobId),
        applicationId: mine.has(applicationId) ? applicationId : null,
        createdAt: date(r.createdAt) ?? new Date(),
      });
    }
    for (let i = 0; i < resumes.length; i += 100) {
      added.resumeVersions += (await db.insert(schema.resumeVersions).values(resumes.slice(i, i + 100)).onConflictDoNothing().returning({ id: schema.resumeVersions.id })).length;
    }

    // Uploaded resume PDFs (base64 in the file): only for resumes that are now yours, only real
    // PDFs of a sensible size, and always stored as an upload.
    const wanted = rowsOf(backup.resumeFiles, MAX_ROWS.files).map((f) => id(f.resumeId)).filter(Boolean);
    const myResumes = new Set(
      wanted.length
        ? (await db.select({ id: schema.resumeVersions.id }).from(schema.resumeVersions).where(and(eq(schema.resumeVersions.userId, uid), inArray(schema.resumeVersions.id, wanted)))).map((r) => r.id)
        : [],
    );
    for (const f of rowsOf(backup.resumeFiles, MAX_ROWS.files)) {
      const resumeId = id(f.resumeId);
      if (!myResumes.has(resumeId) || typeof f.pdf !== "string" || f.pdf.length > MAX_PDF_BYTES * 1.4) continue;
      const pdf = Buffer.from(f.pdf, "base64");
      if (pdf.length > MAX_PDF_BYTES || !looksLikePdf(pdf)) continue;
      await db.insert(schema.resumeFiles).values({ resumeId, userId: uid, source: "upload", fileName: str(f.fileName, 200) || "Resume.pdf", pdf }).onConflictDoNothing();
    }
  } catch (e) {
    console.warn("[import]", e instanceof Error ? e.message : e);
    return Response.json({ error: "That file couldn't be restored: something in it isn't in the shape an export has." }, { status: 400 });
  }

  // Score everything against the (possibly restored) profile.
  await rescoreAll(uid);
  revalidatePath("/", "layout");
  return Response.json({ ok: true, added });
}
