"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import {
  answerRun,
  cancelRun,
  createHelperDevice,
  helperOnline,
  markSubmitted,
  queueRun,
  removeHelperDevice,
  runIfChanged,
} from "../services/autofill";
import { getAnswerBank, saveAnswerBank } from "../services/settings";
import { ANSWER_FIELDS, type AnswerFields, type AutofillRunView } from "@/shared/autofill";

const FIELD_KEYS = new Set(ANSWER_FIELDS.map((f) => f.key));

/** Save Profile → Application answers. `learned` is the full list you kept (removed ones are dropped). */
export async function saveApplicationAnswers(fields: AnswerFields, learned: Record<string, string>): Promise<string> {
  const { id: uid } = await requireUser();
  const { labels = {} } = await getAnswerBank(uid);
  const clean: AnswerFields = {};
  for (const [k, v] of Object.entries(fields)) if (FIELD_KEYS.has(k) && typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 500);
  const kept: Record<string, string> = {};
  for (const [q, a] of Object.entries(learned)) if (typeof a === "string" && a.trim() && q.trim()) kept[q.slice(0, 500)] = a.trim().slice(0, 4000);
  await saveAnswerBank(uid, { fields: clean, learned: kept, labels: Object.fromEntries(Object.keys(kept).filter((q) => labels[q]).map((q) => [q, labels[q]])) });
  revalidatePath("/profile");
  return "Saved.";
}

// ---------- The laptop helper ----------

/** Link a laptop: returns the one-time token to give the helper. */
export async function connectLaptop(name: string): Promise<string> {
  const { id: uid } = await requireUser();
  const token = await createHelperDevice(uid, name);
  revalidatePath("/settings");
  return token;
}

export async function disconnectLaptop(id: string): Promise<void> {
  const { id: uid } = await requireUser();
  await removeHelperDevice(uid, id);
  revalidatePath("/settings");
}

// ---------- One job's autofill ----------

export async function startAutofill(jobId: string, resumeId: string): Promise<{ run: AutofillRunView; online: boolean } | { error: string }> {
  const { id: uid } = await requireUser();
  const out = await queueRun(uid, jobId, resumeId);
  return "error" in out ? out : { run: out.run, online: helperOnline(uid) };
}

/** The job page asks this every few seconds while an autofill is going. Cheap when nothing changed. */
export async function autofillUpdate(runId: string, version: number): Promise<{ run: AutofillRunView | null | "gone"; online: boolean }> {
  const { id: uid } = await requireUser();
  return { run: await runIfChanged(uid, runId, version), online: helperOnline(uid) };
}

export async function answerAutofill(runId: string, answers: { label: string; value: string; remember: boolean }[]) {
  const { id: uid } = await requireUser();
  return answerRun(uid, runId, answers);
}

export async function cancelAutofill(runId: string): Promise<void> {
  const { id: uid } = await requireUser();
  await cancelRun(uid, runId);
}

/** "I submitted it": for when the helper didn't spot the confirmation page. */
export async function confirmSubmitted(runId: string, jobId: string) {
  const { id: uid } = await requireUser();
  const run = await markSubmitted(uid, runId, "Marked as submitted by you.");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/tracker");
  return run;
}
