"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createApplication, ownApplication } from "../services/applications";
import { requireUser } from "../auth";
import { isLatex } from "@/shared/core/latex";
import { looksLikeCompanySite } from "@/shared/core/links";
import { getDb, schema } from "../db";
import { insertJobs, toNewJob } from "../services/jobs";
import { getJob } from "../services/queries";
import { compileLatex, saveResumeFile } from "../services/resume-files";
import { getPreferences, getProfile } from "../services/settings";
import { resumeName, TRACKS, type Track } from "@/shared/types";

const refreshAll = () => revalidatePath("/", "layout");
const asTrack = (s: unknown): Track => (TRACKS.includes(s as Track) ? (s as Track) : "fullstack");

/**
 * Save a base resume. LaTeX is compiled to a PDF first: if it has a mistake nothing is saved
 * and the error comes back, unless `anyway` (e.g. the compiler is down; the PDF is made later).
 */
export async function saveBaseResume(
  track: string,
  content: string,
  opts: { anyway?: boolean } = {},
): Promise<{ id: string } | { error: string } | null> {
  const { id: uid } = await requireUser();
  const text = content.trim();
  if (!text) return null;
  const compiled = isLatex(text) ? await compileLatex(text) : null;
  if (compiled && "error" in compiled && !opts.anyway) return { error: compiled.error };

  const db = await getDb();
  const id = randomUUID();
  await db.insert(schema.resumeVersions).values({ id, userId: uid, track: asTrack(track), label: resumeName(asTrack(track)), content: text, isBase: true });
  if (compiled && "pdf" in compiled) await saveResumeFile(uid, id, { source: "latex", fileName: "Resume.pdf", pdf: compiled.pdf });
  refreshAll();
  return { id };
}

export async function saveResumeVersion(input: {
  track: string;
  content: string;
  label: string;
  jobId?: string | null;
  applicationId?: string | null;
}): Promise<string | null> {
  const { id: uid } = await requireUser();
  if (!input.content.trim()) return null;
  const db = await getDb();
  // Only link to this person's own job and tracker entry.
  const job = input.jobId ? await getJob(uid, input.jobId) : null;
  const jobId = job ? job.id : null;
  let applicationId = input.applicationId && (await ownApplication(uid, input.applicationId)) ? input.applicationId : null;
  if (!applicationId && jobId) {
    const [app] = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.jobId, jobId), eq(schema.applications.userId, uid)));
    applicationId = app?.id ?? null;
  }
  const id = randomUUID();
  await db.insert(schema.resumeVersions).values({
    id,
    userId: uid,
    track: asTrack(input.track),
    label: resumeName(asTrack(input.track), job, input.label.trim() || "Tailored"),
    content: input.content.trim(),
    jobId,
    applicationId,
  });
  // Make the PDF now, so Preview and Download are instant. A mistake isn't fatal: the PDF is tried again on Preview.
  if (isLatex(input.content)) {
    const out = await compileLatex(input.content.trim());
    if ("pdf" in out) await saveResumeFile(uid, id, { source: "latex", fileName: "Resume.pdf", pdf: out.pdf });
  }
  refreshAll();
  return id;
}

export async function deleteResumeVersion(id: string) {
  const { id: uid } = await requireUser();
  const db = await getDb();
  await db.delete(schema.resumeVersions).where(and(eq(schema.resumeVersions.id, id), eq(schema.resumeVersions.userId, uid)));
  refreshAll();
}

/** A job you found yourself (LinkedIn, Naukri, a referral...): add it to the feed and the tracker. */
export async function addManualJob(input: {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
}): Promise<{ jobId: string; applicationId: string } | { error: string }> {
  const { id: uid } = await requireUser();
  if (!input.title.trim() || !input.company.trim()) return { error: "Add at least a job title and company." };
  const [profile, prefs] = await Promise.all([getProfile(uid), getPreferences(uid)]);
  const row = toNewJob(
    uid,
    {
      source: "manual",
      externalId: randomUUID(),
      title: input.title.trim(),
      company: input.company.trim(),
      location: input.location.trim() || "India",
      url: input.url.trim(),
      companyUrl: looksLikeCompanySite(input.url.trim()) ? input.url.trim() : null,
      description: input.description.trim(),
      postedAt: new Date(),
    },
    profile,
    prefs,
  );
  const db = await getDb();
  const [inserted] = await insertJobs(uid, [row]);
  const job =
    inserted ??
    (await db.select().from(schema.jobs).where(and(eq(schema.jobs.userId, uid), eq(schema.jobs.dedupeKey, row.dedupeKey))))[0];
  if (!job) return { error: "Couldn't save the job." };

  const [existing] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.jobId, job.id), eq(schema.applications.userId, uid)));
  const app =
    existing ??
    (await createApplication(uid, {
      jobId: job.id,
      company: job.company,
      title: job.title,
      url: job.companyUrl ?? job.url,
      track: job.track,
      status: "saved",
    }));
  refreshAll();
  return { jobId: job.id, applicationId: app.id };
}
