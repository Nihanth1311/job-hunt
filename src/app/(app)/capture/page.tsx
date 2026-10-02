import type { Metadata } from "next";
import { CaptureClient } from "@/components/capture-client";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPreferences, getProfile } from "@/lib/settings";

export const metadata: Metadata = { title: "Clip a job" };

/** Opened by the "Clip to Job Hunt" bookmark on a job posting. */
export default async function CapturePage() {
  const { id: uid } = await requireUser();
  const [profile, prefs] = await Promise.all([getProfile(uid), getPreferences(uid)]);
  return (
    <>
      <PageHeader title="Clip a job" subtitle="The full job posting, captured from the page you had open." />
      <CaptureClient profile={profile} prefs={prefs} />
    </>
  );
}
