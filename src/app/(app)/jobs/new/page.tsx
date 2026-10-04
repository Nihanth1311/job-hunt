import type { Metadata } from "next";
import { JobsLink } from "@/client/components/layout/jobs-memory";
import { AddJobForm } from "@/client/components/jobs/add-job-form";
import { Icon, PageHeader } from "@/client/components/ui";
import { requireUser } from "@/server/auth";
import { getPreferences, getProfile } from "@/server/services/settings";

export const metadata: Metadata = { title: "Add a job" };

export default async function AddJobPage() {
  const { id: uid } = await requireUser();
  const [profile, prefs] = await Promise.all([getProfile(uid), getPreferences(uid)]);
  return (
    <>
      <JobsLink
        className="mb-4 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <Icon name="arrowLeft" className="size-3.5" /> Jobs
      </JobsLink>
      <PageHeader
        title="Add a job"
        subtitle="Found a job on LinkedIn, Naukri or a company site? Add it here to track it and tailor your resume for it."
      />
      <AddJobForm profile={profile} prefs={prefs} />
    </>
  );
}
