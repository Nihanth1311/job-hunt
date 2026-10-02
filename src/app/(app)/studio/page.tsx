import { redirect } from "next/navigation";

// The old "Resume & Claude" page. Its jobs moved: tailoring lives on each job's page,
// adding an outside job is /jobs/new, and base resumes are on /resumes.
export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  const { job } = await searchParams;
  redirect(typeof job === "string" ? `/jobs/${encodeURIComponent(job)}#tailor` : "/jobs/new");
}
