import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomToken, sha256 } from "../auth/crypto";
import { getDb, schema } from "../db";
import type { AutofillRun } from "../db/schema";
import { addEvent, trackJob } from "./applications";
import { getResumePdf } from "./resume-files";
import { getAnswerBank, getProfile, saveAnswerBank } from "./settings";
import {
  ACTIVE_RUN,
  applyTarget,
  contactFromProfile,
  normQuestion,
  type AutofillReport,
  type AutofillRunView,
  type HelperTask,
  type RunStatus,
} from "@/shared/autofill";

// Autofill: you queue a job on the site; the helper on your laptop picks it up, fills the form in
// Chrome, reports back, and you submit. The helper asks "anything for me?" every few seconds
// while it runs, so this file keeps a little state in memory to answer most of those questions
// without touching the database (Neon's free plan counts the hours the database is awake).

const g = globalThis as unknown as {
  __autofill?: {
    /** token hash → device, so polls don't look the token up every time. */
    devices: Map<string, { id: string; userId: string; cachedAt: number; savedSeenAt: number }>;
    /** Someone queued or answered something for this person since the helper last looked. */
    pending: Set<string>;
    /** When the database was last checked for this person's work. */
    checkedAt: Map<string, number>;
    /** When this person's helper last asked for work: "connected" on the site. */
    seenAt: Map<string, number>;
    /** run id → version, bumped on every change, so the job page can ask "anything new?". */
    versions: Map<string, number>;
    /** Runs cancelled on the site, for the helper to close (handed over once). */
    cancelled: Map<string, Set<string>>;
  };
};
g.__autofill ??= { devices: new Map(), pending: new Set(), checkedAt: new Map(), seenAt: new Map(), versions: new Map(), cancelled: new Map() };
const mem = g.__autofill;

/** Even with nothing queued here, look in the database this often (a run queued before a restart). */
const RECHECK_MS = 5 * 60_000;
const DEVICE_CACHE_MS = 10 * 60_000;
const SEEN_SAVE_MS = 10 * 60_000;
/** The helper asks every few seconds; this long without a question means it's stopped. */
const ONLINE_MS = 45_000;

const bump = (runId: string) => mem.versions.set(runId, (mem.versions.get(runId) ?? 0) + 1);
const wake = (userId: string) => mem.pending.add(userId);
const cancelled = (userId: string, runId: string) => {
  const set = mem.cancelled.get(userId) ?? new Set<string>();
  set.add(runId);
  mem.cancelled.set(userId, set);
};

/** Runs cancelled since the helper last asked, so it can close their tabs. */
export function takeCancelled(userId: string): string[] {
  const ids = [...(mem.cancelled.get(userId) ?? [])];
  mem.cancelled.delete(userId);
  return ids;
}

// ---------- Linking a laptop ----------

/** A new link for this person's laptop. The token is shown once and only its hash is kept. */
export async function createHelperDevice(userId: string, name: string): Promise<string> {
  const token = `jhh_${randomToken(30)}`;
  const db = await getDb();
  await db.insert(schema.helperDevices).values({ id: randomUUID(), userId, tokenHash: sha256(token), name: name.trim().slice(0, 60) || "My laptop" });
  return token;
}

export async function listHelperDevices(userId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.helperDevices.id, name: schema.helperDevices.name, createdAt: schema.helperDevices.createdAt, lastSeenAt: schema.helperDevices.lastSeenAt })
    .from(schema.helperDevices)
    .where(eq(schema.helperDevices.userId, userId))
    .orderBy(desc(schema.helperDevices.createdAt));
}

export async function removeHelperDevice(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.helperDevices).where(and(eq(schema.helperDevices.id, id), eq(schema.helperDevices.userId, userId)));
  for (const [hash, d] of mem.devices) if (d.id === id) mem.devices.delete(hash);
}

/** Someone was removed: their helper's token stops working now, not when the cache runs out. */
export function forgetHelperUser(userId: string): void {
  for (const [hash, d] of mem.devices) if (d.userId === userId) mem.devices.delete(hash);
  mem.seenAt.delete(userId);
}

/** Who a helper's token belongs to, or null. Remembered for a few minutes; removal takes effect at once. */
export async function helperUserId(token: string): Promise<string | null> {
  if (!/^jhh_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const hash = sha256(token);
  const now = Date.now();
  let device = mem.devices.get(hash);
  if (!device || now - device.cachedAt > DEVICE_CACHE_MS) {
    const db = await getDb();
    const [row] = await db
      .select({ id: schema.helperDevices.id, userId: schema.helperDevices.userId, lastSeenAt: schema.helperDevices.lastSeenAt })
      .from(schema.helperDevices)
      .where(eq(schema.helperDevices.tokenHash, hash));
    if (!row) {
      mem.devices.delete(hash);
      return null;
    }
    device = { id: row.id, userId: row.userId, cachedAt: now, savedSeenAt: row.lastSeenAt?.getTime() ?? 0 };
    mem.devices.set(hash, device);
  }
  mem.seenAt.set(device.userId, now);
  if (now - device.savedSeenAt > SEEN_SAVE_MS) {
    device.savedSeenAt = now;
    const db = await getDb();
    await db.update(schema.helperDevices).set({ lastSeenAt: new Date(now) }).where(eq(schema.helperDevices.id, device.id));
  }
  return device.userId;
}

/** Whose account a helper is linked to, so it can say so when it starts. */
export async function helperAccount(userId: string): Promise<string> {
  const db = await getDb();
  const [user] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  return user?.email ?? "";
}

/** Is this person's helper running right now? (It asks for work every few seconds while it does.) */
export const helperOnline = (userId: string) => Date.now() - (mem.seenAt.get(userId) ?? 0) < ONLINE_MS;

// ---------- Runs, from the site ----------

const view = (r: AutofillRun): AutofillRunView => ({
  id: r.id,
  status: r.status as RunStatus,
  message: r.message,
  report: r.report,
  resumeId: r.resumeId,
  updatedAt: r.updatedAt.toISOString(),
  version: mem.versions.get(r.id) ?? 0,
});

/** The latest autofill for a job, if any. */
export async function latestRun(userId: string, jobId: string): Promise<AutofillRunView | null> {
  const db = await getDb();
  const [run] = await db
    .select()
    .from(schema.autofillRuns)
    .where(and(eq(schema.autofillRuns.userId, userId), eq(schema.autofillRuns.jobId, jobId)))
    .orderBy(desc(schema.autofillRuns.createdAt))
    .limit(1);
  return run ? view(run) : null;
}

/** For the job page's check every few seconds: null when nothing changed (no database read). */
export async function runIfChanged(userId: string, runId: string, version: number): Promise<AutofillRunView | null | "gone"> {
  const known = mem.versions.get(runId);
  if (known !== undefined && known === version) return null;
  const db = await getDb();
  const [run] = await db.select().from(schema.autofillRuns).where(and(eq(schema.autofillRuns.id, runId), eq(schema.autofillRuns.userId, userId)));
  if (!run) return "gone";
  if (known === undefined) mem.versions.set(runId, 0); // after a restart: from now on, changes bump it
  return view(run);
}

/** Queue a job for the helper. Any earlier unfinished autofill of the same job is cancelled. */
export async function queueRun(userId: string, jobId: string, resumeId: string): Promise<{ run: AutofillRunView } | { error: string }> {
  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)));
  if (!job) return { error: "This job isn't in your feed any more." };
  const target = applyTarget(job);
  if (!target) return { error: "This job only has a job-board link (LinkedIn, Naukri…), where automated applying isn't allowed." };
  const pdf = await getResumePdf(userId, resumeId);
  if (!pdf) return { error: "That resume has no PDF. Upload a PDF or save it as LaTeX on the Resumes page." };
  if ("error" in pdf) return { error: pdf.error };

  const old = await db
    .update(schema.autofillRuns)
    .set({ status: "cancelled", message: "Replaced by a newer autofill.", updatedAt: new Date() })
    .where(and(eq(schema.autofillRuns.userId, userId), eq(schema.autofillRuns.jobId, jobId), inArray(schema.autofillRuns.status, ACTIVE_RUN)))
    .returning({ id: schema.autofillRuns.id });
  old.forEach((r) => {
    bump(r.id);
    cancelled(userId, r.id);
  });

  const [run] = await db
    .insert(schema.autofillRuns)
    .values({ id: randomUUID(), userId, jobId, resumeId, applyUrl: target.url, message: "Waiting for the helper on your laptop." })
    .returning();
  bump(run.id);
  wake(userId);
  return { run: view(run) };
}

async function ownRun(userId: string, runId: string): Promise<AutofillRun | null> {
  const db = await getDb();
  const [run] = await db.select().from(schema.autofillRuns).where(and(eq(schema.autofillRuns.id, runId), eq(schema.autofillRuns.userId, userId)));
  return run ?? null;
}

async function updateRun(runId: string, patch: Partial<Pick<AutofillRun, "status" | "message" | "report" | "answers">>): Promise<AutofillRun> {
  const db = await getDb();
  const [run] = await db
    .update(schema.autofillRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.autofillRuns.id, runId))
    .returning();
  bump(runId);
  return run;
}

/**
 * Your answers to the questions the helper couldn't answer. They go to the form straight away;
 * the ones marked "remember" are also saved to your answers bank for every future form.
 * With no answers it means "I did it in Chrome, carry on": the helper looks at the page again.
 */
export async function answerRun(
  userId: string,
  runId: string,
  answers: { label: string; value: string; remember: boolean }[],
): Promise<AutofillRunView | null> {
  const run = await ownRun(userId, runId);
  if (!run || !["needs_you", "review", "filling", "waiting"].includes(run.status)) return null;
  const db = await getDb();
  const [job] = await db.select({ company: schema.jobs.company }).from(schema.jobs).where(eq(schema.jobs.id, run.jobId));
  const company = job?.company ?? "";

  const given = answers
    .map((a) => ({ label: a.label.slice(0, 500), value: a.value.trim().slice(0, 4000), remember: a.remember }))
    .filter((a) => a.label && a.value);

  const forRun = { ...run.answers };
  for (const a of given) forRun[normQuestion(a.label, company)] = a.value;
  const keep = given.filter((a) => a.remember);
  if (keep.length) {
    const bank = await getAnswerBank(userId);
    bank.labels ??= {};
    for (const a of keep) {
      const q = normQuestion(a.label, company);
      bank.learned[q] = a.value;
      bank.labels[q] = company ? a.label.split(company).join("[company]") : a.label;
    }
    await saveAnswerBank(userId, bank);
  }
  const updated = await updateRun(runId, { status: "answered", answers: forRun, message: given.length ? "Filling in your answers…" : "Looking at the form again…" });
  wake(userId);
  return view(updated);
}

export async function cancelRun(userId: string, runId: string): Promise<void> {
  const run = await ownRun(userId, runId);
  if (!run || !(ACTIVE_RUN as string[]).includes(run.status)) return;
  await updateRun(runId, { status: "cancelled", message: "Cancelled." });
  cancelled(userId, runId); // the helper closes the tab next time it asks
}

/** You submitted the form (the helper saw the confirmation page, or you said so): it's in your tracker as Applied. */
export async function markSubmitted(userId: string, runId: string, how: string): Promise<AutofillRunView | null> {
  const run = await ownRun(userId, runId);
  if (!run || run.status === "submitted") return run ? view(run) : null;
  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, run.jobId));
  if (job) {
    const app = await trackJob(userId, job, "applied");
    let resumeLabel = "";
    if (run.resumeId) {
      const [r] = await db.select({ label: schema.resumeVersions.label, isBase: schema.resumeVersions.isBase }).from(schema.resumeVersions).where(eq(schema.resumeVersions.id, run.resumeId));
      resumeLabel = r?.label ?? "";
      // A resume made for this job belongs with the application; base resumes stay shared.
      if (r && !r.isBase) await db.update(schema.resumeVersions).set({ applicationId: app.id }).where(eq(schema.resumeVersions.id, run.resumeId));
    }
    await addEvent(app.id, "note", `Applied with autofill${resumeLabel ? ` using “${resumeLabel}”` : ""}. ${how}`);
  }
  const updated = await updateRun(runId, { status: "submitted", message: "Submitted. It's in your tracker as Applied." });
  return view(updated);
}

// ---------- Runs, from the helper ----------

/**
 * The next form for the helper, or null. Most calls end in memory: the database is read only
 * when something was queued or answered here, or every few minutes in case of a restart.
 */
export async function nextTask(userId: string, force = false): Promise<HelperTask | null> {
  const now = Date.now();
  if (!force && !mem.pending.has(userId) && now - (mem.checkedAt.get(userId) ?? 0) < RECHECK_MS) return null;
  mem.checkedAt.set(userId, now);

  const db = await getDb();
  const [run] = await db
    .select()
    .from(schema.autofillRuns)
    .where(and(eq(schema.autofillRuns.userId, userId), inArray(schema.autofillRuns.status, ["queued", "answered"])))
    .orderBy(schema.autofillRuns.createdAt)
    .limit(1);
  if (!run) {
    mem.pending.delete(userId);
    return null;
  }
  // Claim it, unless it changed in the meantime (cancelled, or answered again).
  const [claimed] = await db
    .update(schema.autofillRuns)
    .set({ status: "filling", message: run.status === "queued" ? "Opening the form in Chrome…" : "Filling in your answers…", updatedAt: new Date() })
    .where(and(eq(schema.autofillRuns.id, run.id), eq(schema.autofillRuns.status, run.status)))
    .returning({ id: schema.autofillRuns.id });
  if (!claimed) return nextTask(userId, true);
  bump(run.id);

  const [[job], profile, bank] = await Promise.all([
    db.select().from(schema.jobs).where(eq(schema.jobs.id, run.jobId)),
    getProfile(userId),
    getAnswerBank(userId),
  ]);
  let resume: HelperTask["resume"] = null;
  if (run.resumeId) {
    const pdf = await getResumePdf(userId, run.resumeId);
    if (pdf && !("error" in pdf)) resume = { id: run.resumeId, fileName: pdf.fileName };
  }
  return {
    runId: run.id,
    status: run.status as "queued" | "answered",
    applyUrl: run.applyUrl,
    platform: job ? (applyTarget(job)?.platform ?? null) : null,
    job: { title: job?.title ?? "", company: job?.company ?? "" },
    contact: contactFromProfile(profile),
    bank,
    runAnswers: run.answers,
    resume,
  };
}

/** What the helper can report. Anything else (e.g. reviving a cancelled run) is refused. */
const ONGOING: RunStatus[] = ["waiting", "needs_you", "review", "error", "submitted"];
const FROM_HELPER: Partial<Record<RunStatus, RunStatus[]>> = {
  filling: ONGOING,
  waiting: ONGOING,
  needs_you: ONGOING,
  review: ONGOING,
  // You answered on the site but the helper hasn't picked that up yet: only "it's done" or "it broke" count.
  answered: ["submitted", "error"],
};

/** The helper's report on a form. Returns the run's status afterwards ("cancelled" tells it to close the tab). */
export async function helperReport(
  userId: string,
  runId: string,
  input: { status: RunStatus; message: string; report: AutofillReport },
): Promise<RunStatus | null> {
  const run = await ownRun(userId, runId);
  if (!run) return null;
  const allowed = FROM_HELPER[run.status as RunStatus] ?? [];
  if (!allowed.includes(input.status)) return run.status as RunStatus;
  if (input.status === "submitted") {
    await markSubmitted(userId, runId, "The helper saw the confirmation page.");
    return "submitted";
  }
  const report: AutofillReport = { ...input.report, at: new Date().toISOString() };
  await updateRun(runId, { status: input.status, message: input.message.slice(0, 500), report });
  return input.status;
}

/** The resume file for a run, for the helper to upload. */
export async function runResume(userId: string, runId: string) {
  const run = await ownRun(userId, runId);
  if (!run?.resumeId) return null;
  return getResumePdf(userId, run.resumeId);
}
