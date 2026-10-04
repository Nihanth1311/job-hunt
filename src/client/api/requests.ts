// The browser's calls to the addresses in endpoints.ts. Components use these functions instead
// of writing fetch("/api/…") themselves, so each address and its rules live in one place.

import type { FetchStatus } from "@/shared/types";
import { API } from "./endpoints";

/** Start "Fetch now" (or join the one already running). Returns when it started; throws if the server can't be reached. */
export async function startFetch(): Promise<string> {
  const res = await fetch(API.fetch, { method: "POST" });
  if (!res.ok) throw new Error(`Couldn't start the fetch (${res.status}).`);
  const { startedAt } = (await res.json()) as { startedAt: string };
  return startedAt;
}

/** Is my fetch running, and how did my last one end? null when the server can't be reached right now. */
export async function getFetchStatus(): Promise<FetchStatus | null> {
  try {
    const res = await fetch(API.fetch, { cache: "no-store" });
    return res.ok ? ((await res.json()) as FetchStatus) : null;
  } catch {
    return null; // offline, or the app was in the background
  }
}

/** Ask the server to stop my running fetch. Rejects if the request didn't go through. */
export async function cancelFetch(): Promise<void> {
  await fetch(API.fetchCancel, { method: "POST" });
}

export interface RestoreAnswer {
  ok: boolean;
  status: number;
  body: { error?: string; added?: { profile?: boolean; jobs?: number; applications?: number; resumeVersions?: number } };
}

/** Send an "Export my data" file to be restored into this account. Throws if the answer can't be read. */
export async function restoreBackup(fileText: string): Promise<RestoreAnswer> {
  const res = await fetch(API.importData, { method: "POST", headers: { "content-type": "application/json" }, body: fileText });
  return { ok: res.ok, status: res.status, body: await res.json() };
}
