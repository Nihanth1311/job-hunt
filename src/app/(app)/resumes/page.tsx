import type { Metadata } from "next";
import Link from "next/link";
import { JobsLink } from "@/components/jobs-memory";
import { BaseResumeCard } from "@/components/base-resume-card";
import { buttonClass, Callout, Card, Icon, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getBaseResumes, listTailoredResumes } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/settings";
import { TRACK_LABEL, TRACKS, type Track } from "@/lib/types";

export const metadata: Metadata = { title: "Resumes" };

export default async function ResumesPage() {
  const { id: uid } = await requireUser();
  const [profile, bases, tailored] = await Promise.all([getProfile(uid), getBaseResumes(uid), listTailoredResumes(uid)]);
  const hasMaster = profile.masterResume.trim().length > 0;

  return (
    <>
      <PageHeader
        title="Resumes"
        subtitle="One base resume per role type, plus every version you tailored for a specific job."
      />

      {/* How it fits together */}
      <Card className="mb-8 grid gap-4 p-5 sm:grid-cols-3">
        <HowStep n={1} title="Master resume" done={hasMaster}>
          Your full, honest resume.{" "}
          <Link href="/profile" className="font-medium text-accent hover:underline">
            {hasMaster ? "Edit in Profile" : "Add it in Profile"}
          </Link>
        </HowStep>
        <HowStep n={2} title="Base resumes" done={Object.keys(bases).length > 0}>
          One per role type, made once with Claude from your master resume. Below.
        </HowStep>
        <HowStep n={3} title="Tailored resumes" done={tailored.length > 0}>
          Made per job on the job&apos;s page with <b>Tailor your resume</b>.
        </HowStep>
      </Card>

      {!hasMaster && (
        <Callout tone="warn" className="mb-6 text-sm">
          Start by pasting your current resume in{" "}
          <Link href="/profile" className="font-medium underline">
            Profile → Master resume
          </Link>
          . Everything else is built from it.
        </Callout>
      )}

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Base resumes</h2>
        <p className="mb-4 text-sm text-muted">
          When you tailor a resume for a job, Claude starts from the matching one, so a DevOps job starts from your DevOps resume.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {TRACKS.map((t) => {
            const b = bases[t];
            return (
              <BaseResumeCard
                key={t}
                track={t}
                base={b ? { id: b.id, content: b.content, createdAt: b.createdAt } : null}
                profile={profile}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Tailored for jobs</h2>
        <p className="mb-4 text-sm text-muted">Every resume you saved for a specific job, newest first.</p>
        {tailored.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">
            Nothing yet. Open any job and use <b className="text-ink">Tailor your resume</b>.{" "}
            <JobsLink className="font-medium text-accent hover:underline">Go to Jobs</JobsLink>
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {tailored.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.jobTitle ? `${r.jobTitle} · ${r.company}` : r.label}</p>
                  <p className="text-xs text-muted">
                    {TRACK_LABEL[r.track as Track] ?? r.track} resume · {r.label} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/print/resume/${r.id}`} target="_blank" className={buttonClass("secondary", "sm")}>
                    <Icon name="printer" className="size-3.5" /> PDF
                  </Link>
                  {r.jobId && (
                    <Link href={`/jobs/${r.jobId}#tailor`} className={buttonClass("ghost", "sm")}>
                      Open job <Icon name="arrowRight" className="size-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}

function HowStep({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className={
          done
            ? "grid size-7 shrink-0 place-items-center rounded-full bg-good/12 text-good"
            : "grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
        }
      >
        {done ? <Icon name="check" className="size-3.5" strokeWidth={2.5} /> : n}
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}
