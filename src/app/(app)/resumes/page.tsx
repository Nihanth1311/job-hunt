import type { Metadata } from "next";
import Link from "next/link";
import { JobsLink } from "@/client/components/layout/jobs-memory";
import { DeleteResumeButton } from "@/client/components/resumes/delete-resume-button";
import { PreviewButton } from "@/client/components/resumes/resume-preview";
import { ResumeLibrary, type BaseResume } from "@/client/components/resumes/resume-library";
import { buttonClass, Callout, Card, Icon, PageHeader } from "@/client/components/ui";
import { isLatex } from "@/shared/core/latex";
import { formatDate } from "@/shared/format";
import { allResumes, getBaseResumes } from "@/server/services/queries";
import { resumeIdsWithPdf } from "@/server/services/resume-files";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/services/settings";
import { TRACK_LABEL, type Track } from "@/shared/types";

export const metadata: Metadata = { title: "Resumes" };

export default async function ResumesPage() {
  const { id: uid } = await requireUser();
  const [profile, bases, everything, withPdf] = await Promise.all([
    getProfile(uid),
    getBaseResumes(uid),
    allResumes(uid),
    resumeIdsWithPdf(uid),
  ]);
  const inUse = new Set(Object.values(bases).map((b) => b.id));
  const hasMaster = profile.masterResume.trim().length > 0;

  const library: Partial<Record<Track, BaseResume>> = {};
  for (const [t, b] of Object.entries(bases)) {
    const kind = withPdf.get(b.id) ?? (isLatex(b.content) ? "latex" : "text");
    library[t as Track] = { id: b.id, kind, content: b.content, createdAt: b.createdAt };
  }

  return (
    <>
      <PageHeader title="Resumes" subtitle="Upload or paste your resumes, see them as PDFs, and keep every version you tailored for a job." />

      {!hasMaster && (
        <Callout tone="warn" className="mb-6 text-sm">
          Also paste your full resume in{" "}
          <Link href="/profile" className="font-medium underline">
            Profile → Master resume
          </Link>
          . Claude reads it to score jobs and tailor resumes.
        </Callout>
      )}

      <ResumeLibrary bases={library} profile={profile} />

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">All your resumes · {everything.length}</h2>
        <p className="mb-4 text-sm text-muted">
          Every resume you&apos;ve saved, newest first: base resumes (older versions too) and the ones tailored for jobs. Named role type ·
          company · job title. Delete the ones you don&apos;t need.
        </p>
        {everything.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">
            Nothing yet. Add a resume above, or <JobsLink className="font-medium text-accent hover:underline">open a job</JobsLink> and tailor
            your resume to it.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {everything.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.label || TRACK_LABEL[r.track as Track]}</p>
                  <p className="text-xs text-muted">
                    {r.isBase ? (inUse.has(r.id) ? "Base resume, in use" : "Older base resume") : "Tailored for a job"} ·{" "}
                    {r.hasFile && !r.isLatex ? (withPdf.get(r.id) === "upload" ? "uploaded PDF" : "text, made into a PDF") : r.isLatex ? "LaTeX" : "text"} ·{" "}
                    {formatDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PreviewButton id={r.id} title={r.label} />
                  {r.jobId && (
                    <Link href={`/jobs/${r.jobId}#tailor`} className={buttonClass("ghost", "sm")}>
                      Open job <Icon name="arrowRight" className="size-3.5" />
                    </Link>
                  )}
                  <DeleteResumeButton id={r.id} name={r.label} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
