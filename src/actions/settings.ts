"use server";

import { revalidatePath } from "next/cache";
import { invite, removePerson } from "@/lib/accounts";
import { requireAdmin, requireUser } from "@/lib/auth";
import { fillFromPool, sendMorningDigest } from "@/lib/fetcher";
import { rescoreAll } from "@/lib/jobs";
import { sendTelegram } from "@/lib/notify/telegram";
import { getPreferences, getSecrets, savePreferences, saveProfile, SECRET_NAMES, setSecret, setTelegramEnabled, telegramEnabled, type SecretName } from "@/lib/settings";
import type { Preferences, Profile } from "@/lib/types";

const refreshAll = () => revalidatePath("/", "layout");

export async function saveProfileAction(profile: Profile) {
  const { id: uid } = await requireUser();
  await saveProfile(uid, profile);
  await rescoreAll(uid);
  refreshAll();
}

export async function savePreferencesAction(prefs: Preferences) {
  const { id: uid } = await requireUser();
  // The company list is saved on its own (below); don't let an older copy of the form undo it.
  const current = await getPreferences(uid);
  await savePreferences(uid, { ...prefs, skippedCompanies: current.skippedCompanies });
  await rescoreAll(uid);
  refreshAll();
}

/** Follow or stop following companies from the built-in list. Newly followed ones fill in from the shared pool. */
export async function setCompaniesFollowed(ids: string[], follow: boolean) {
  const { id: uid } = await requireUser();
  const prefs = await getPreferences(uid);
  const skipped = new Set(prefs.skippedCompanies);
  for (const id of ids) {
    if (follow) skipped.delete(id);
    else skipped.add(id);
  }
  await savePreferences(uid, { ...prefs, skippedCompanies: [...skipped] });
  if (follow) await fillFromPool(uid);
  revalidatePath("/settings");
}

// ---------- Your API keys ----------

/** Save the keys that were changed. An empty value removes that key. */
export async function saveApiKeys(changes: Partial<Record<SecretName, string>>): Promise<string> {
  const { id: uid } = await requireUser();
  for (const [name, value] of Object.entries(changes)) {
    if ((SECRET_NAMES as readonly string[]).includes(name) && typeof value === "string") await setSecret(uid, name as SecretName, value);
  }
  refreshAll();
  return "Saved.";
}

/** One cheap request to check a Google Jobs (JSearch) key works, and how much of the month's quota is left. */
export async function testJsearchKey(): Promise<string> {
  const { id: uid } = await requireUser();
  const { jsearchKey } = await getSecrets(uid);
  if (!jsearchKey) return "Add a key first.";
  const res = await fetch("https://jsearch.p.rapidapi.com/search-v2?query=software%20engineer%20jobs%20in%20India&country=in&date_posted=today", {
    headers: { "X-RapidAPI-Key": jsearchKey, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    signal: AbortSignal.timeout(60_000),
  }).catch((e: Error) => e);
  if (res instanceof Error) return `Couldn't reach RapidAPI (${res.message}).`;
  if (res.status === 403) return "This key isn't subscribed to JSearch yet. Open JSearch on RapidAPI and subscribe to the free Basic plan.";
  if (res.status === 401) return "RapidAPI doesn't recognise this key. Copy it again from RapidAPI.";
  if (!res.ok) return `RapidAPI answered ${res.status}.`;
  const left = res.headers.get("x-ratelimit-requests-remaining");
  return `Works.${left ? ` ${left} searches left this month.` : ""}`;
}

export async function sendTestNotification(): Promise<string> {
  const { id: uid } = await requireUser();
  try {
    await sendTelegram(await getSecrets(uid), "✅ Job Hunt is connected. Job alerts and your morning digest will arrive here.");
    return "Sent! Check Telegram.";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function sendDigestNow(): Promise<string> {
  const { id: uid } = await requireUser();
  try {
    await sendMorningDigest(uid);
    return "Digest sent.";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// ---------- Admin: who can sign in ----------

export async function inviteAction(email: string): Promise<string | null> {
  const admin = await requireAdmin();
  const error = await invite(email, admin.email);
  revalidatePath("/admin");
  return error;
}

export async function removePersonAction(email: string, deleteData: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (email.trim().toLowerCase() === admin.email) return;
  await removePerson(email, deleteData);
  revalidatePath("/admin");
}

/** Admin: show or hide Telegram alerts for everyone. Returns the saved state. */
export async function setTelegramForEveryone(on: boolean): Promise<boolean> {
  await requireAdmin();
  await setTelegramEnabled(Boolean(on));
  refreshAll();
  return telegramEnabled();
}
