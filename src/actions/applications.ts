"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addEvent, createApplication, ownApplication, setApplicationStatus } from "@/lib/applications";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { APP_STATUSES, TRACKS, type AppStatus, type Track } from "@/lib/types";

const refreshAll = () => revalidatePath("/", "layout");
const asStatus = (s: unknown): AppStatus => (APP_STATUSES.includes(s as AppStatus) ? (s as AppStatus) : "saved");
const asTrack = (s: unknown): Track => (TRACKS.includes(s as Track) ? (s as Track) : "fullstack");

export async function addApplication(form: FormData) {
  const { id: uid } = await requireUser();
  const company = String(form.get("company") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  if (!company || !title) return;
  const app = await createApplication(uid, {
    company,
    title,
    url: String(form.get("url") ?? "").trim(),
    track: asTrack(form.get("track")),
    status: asStatus(form.get("status")),
    notes: String(form.get("notes") ?? ""),
  });
  refreshAll();
  redirect(`/tracker/${app.id}`);
}

export async function moveApplication(id: string, status: string) {
  const { id: uid } = await requireUser();
  await setApplicationStatus(uid, id, asStatus(status));
  refreshAll();
}

export async function updateApplicationDetails(
  id: string,
  input: { followUpAt: string | null; notes: string; track: string; url: string },
) {
  const { id: uid } = await requireUser();
  const db = await getDb();
  await db
    .update(schema.applications)
    .set({
      // Dates from the form are days in India time; remind at 9 AM.
      followUpAt: input.followUpAt ? new Date(`${input.followUpAt}T09:00:00+05:30`) : null,
      notes: input.notes,
      track: asTrack(input.track),
      url: input.url.trim(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, uid)));
  refreshAll();
}

export async function addApplicationNote(id: string, text: string) {
  const { id: uid } = await requireUser();
  if (!text.trim() || !(await ownApplication(uid, id))) return;
  await addEvent(id, "note", text.trim());
  const db = await getDb();
  await db.update(schema.applications).set({ updatedAt: new Date() }).where(eq(schema.applications.id, id));
  refreshAll();
}

export async function deleteApplication(id: string) {
  const { id: uid } = await requireUser();
  const app = await ownApplication(uid, id);
  if (app) {
    const db = await getDb();
    await db.delete(schema.applications).where(eq(schema.applications.id, id));
    if (app.jobId) {
      await db.update(schema.jobs).set({ status: "new" }).where(and(eq(schema.jobs.id, app.jobId), eq(schema.jobs.userId, uid)));
    }
  }
  refreshAll();
  redirect("/tracker");
}
