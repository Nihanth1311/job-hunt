import type { Metadata } from "next";
import Link from "next/link";
import { JobsLink } from "@/client/components/layout/jobs-memory";
import { notFound, redirect } from "next/navigation";
import { adoptSharedJob } from "@/server/services/jobs";
import { AutofillCard } from "@/client/components/jobs/autofill-card";
import { FitLine } from "@/client/components/jobs/fit-line";
import { JobAbout } from "@/client/components/jobs/job-about";
import { JobActions } from "@/client/components/jobs/job-actions";
import { ClaudeHelp } from "@/client/components/resumes/claude-help";
import { JumpLink } from "@/client/components/layout/jump-link";
import { TailorResume } from "@/client/components/resumes/tailor-resume";
import { Badge, buttonClass, Card, CardTitle, CategoryBadge, cx, Icon, SalaryBadge, ScorePill } from "@/client/components/ui";
import { experienceLabel, isInternship, parseExperience, salaryLabel } from "@/shared/core/classify";
import { isLatex } from "@/shared/core/latex";
import { scoreResume } from "@/shared/core/resume-score";
import { siteLabel, SOURCE_LABEL, sourceLabel } from "@/shared/core/links";
import type { Job } from "@/server/db/schema";
import { formatDate, isOverdue, timeAgo } from "@/shared/format";
import { getBaseResumes, jobPageData } from "@/server/services/queries";
import { requireUser } from "@/server/auth";
import { getPreferences, getProfile, getSecrets, getState } from "@/server/services/settings";
import { helperOnline, latestRun } from "@/server/services/autofill";
import { resumeIdsWithPdf } from "@/server/services/resume-files";
import { applyTarget } from "@/shared/autofill";
import { STATUS_LABEL, TRACK_LABEL, TRACK_TITLE, type AppStatus, type Preferences, type Track } from "@/shared/types";

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const { id: uid } = await requireUser();
  const data = await jobPageData(uid, (await params).id);
  return { title: data ? `${data.job.title} · ${data.job.company}` : "Job" };
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const { id: uid } = await requireUser();
  const [data, profile, prefs, bases, secrets, withPdf, lastRun] = await Promise.all([
    jobPageData(uid, id),
    getProfile(uid),
    getPreferences(uid),
    getBaseResumes(uid),
    getSecrets(uid),
    resumeIdsWithPdf(uid),
    latestRun(uid, id),
  ]);
  if (!data) {
    // A link someone shared from their feed: open (or add) the same job in this person's feed.
    const own = await adoptSharedJob(uid, id);
    if (own && own !== id) redirect(`/jobs/${own}`);
    notFound();
  }
  const { job, application, versions, moreFromCompany, similar } = data;

  const baseResumes: Partial<Record<Track, string>> = {};
  for (const [t, r] of Object.entries(bases)) baseResumes[t as Track] = r.content;

  const exp = experienceLabel({ min: job.expMin, max: job.expMax });
  const source = sourceLabel(job);
  const via = job.publisher ?? SOURCE_LABEL[job.source] ?? "The job board";
  const postingUrl = job.companyUrl ?? job.url ?? null;
  const googleQuota = secrets.jsearchKey ? ((await getState<{ remaining: number }>(uid, "jsearchQuota"))?.remaining ?? null) : undefined;
  const track = (job.track in TRACK_TITLE ? job.track : "fullstack") as Track;
  // Autofill: resumes that are (or can become) a PDF. One made for this job first, then the one for its role.
  const target = applyTarget(job);
  const hasPdf = (r: { id: string; content: string }) => withPdf.has(r.id) || isLatex(r.content);
  const autofillResumes = [
    ...versions.filter(hasPdf).map((v) => ({ id: v.id, label: `${v.label || "Made for this job"} (this job)` })),
    ...Object.values(bases)
      .filter(hasPdf)
      .sort((a, b) => (a.track === track ? -1 : b.track === track ? 1 : 0))
      .map((b) => ({ id: b.id, label: `${TRACK_LABEL[b.track as Track] ?? b.track} base resume` })),
  ];
  const followUpDue = application?.followUpAt && !["offer", "rejected", "saved"].includes(application.status) ? application.followUpAt : null;

  return (
    <>
      <JobsLink
        className="mb-4 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <Icon name="arrowLeft" className="size-3.5" /> Jobs
      </JobsLink>

      {/* Header */}
      <Card className="mb-6 p-5 sm:p-7">
        {/* Score beside the title; below it, phones use the full width and wider screens line up under the title. */}
        <div className="flex items-start gap-3 sm:gap-5">
          <ScorePill score={job.score} />
          <h1 className="min-w-0 flex-1 font-display text-[24px] leading-[1.15] sm:text-[30px]">{job.title}</h1>
        </div>
        <div className="min-w-0 sm:pl-16">
          <div>
            <p className="mt-2 text-[15px] text-muted">
              <span className="font-medium text-ink">{job.company}</span>
              {job.location && ` · ${job.location}`}
              {job.isRemote && " · Remote"}
              {" · "}
              <span suppressHydrationWarning>{job.postedAt ? `Posted ${timeAgo(job.postedAt)}` : `Found ${timeAgo(job.firstSeenAt)}`}</span>
            </p>
            <FitLine fit={job.fit} reasons={job.fitReasons} className="mt-3" />
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={job.category} />
              {(job.salaryMinLpa !== null || job.salaryMaxLpa !== null) && (
                <SalaryBadge
                  min={job.salaryMinLpa}
                  max={job.salaryMaxLpa}
                  bucket={job.salaryBucket}
                  estimated={job.salaryEstimated}
                  ctc={job.mentionsCtc}
                />
              )}
              {exp && <Badge tone={job.expFit ? "neutral" : "bad"}>{exp}</Badge>}
              <Badge tone="neutral">{source}</Badge>
              {job.companyUrl && (
                <Badge tone="good">
                  <Icon name="check" className="size-3" />
                  Official link · {siteLabel(job.companyUrl)}
                </Badge>
              )}
            </div>

            {application && (
              <Link
                href={`/tracker/${application.id}`}
                className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent transition hover:brightness-95"
              >
                <Icon name="tracker" className="size-4" />
                <span>
                  In your tracker: <b>{STATUS_LABEL[application.status as AppStatus] ?? application.status}</b>
                  {application.appliedAt && ` · applied ${formatDate(application.appliedAt)}`}
                </span>
                {followUpDue && (
                  <span className={cx(isOverdue(followUpDue) && "font-semibold text-bad")}>
                    · {isOverdue(followUpDue) ? "follow-up due now" : `follow up ${formatDate(followUpDue)}`}
                  </span>
                )}
                <Icon name="arrowRight" className="ml-auto size-4" />
              </Link>
            )}

            <JobActions
              job={{ id: job.id, url: job.url, companyUrl: job.companyUrl, publisher: job.publisher, source: job.source, status: job.status, company: job.company, title: job.title }}
              className="mt-5 border-t border-line pt-5 max-sm:[&>*]:grow"
              leading={
                <JumpLink to="tailor" className={buttonClass("primary", "sm")}>
                  <Icon name="sparkles" className="size-3.5" />
                  Tailor resume
                </JumpLink>
              }
            />
          </div>
        </div>
      </Card>

      {/* Phones: one column, verdict first (order-*). Desktop: description and tailoring left, match and help right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 max-lg:contents lg:space-y-8">
          <div className="max-lg:order-2">
          <JobAbout
            jobId={job.id}
            description={job.description}
            isPreview={job.descriptionIsPreview}
            postingUrl={postingUrl}
            via={via}
            googleQuota={googleQuota}
          />
          </div>

          <div className="max-lg:order-3">
          <TailorResume
            job={{ title: job.title, company: job.company, location: job.location, url: postingUrl ?? "", description: job.description, descriptionIsPreview: job.descriptionIsPreview }}
            jobId={job.id}
            applicationId={application?.id ?? null}
            profile={profile}
            prefs={prefs}
            baseResumes={baseResumes}
            suggestedTrack={track}
            versions={versions.map((v) => ({ id: v.id, label: v.label, track: v.track, createdAt: v.createdAt, pdf: isLatex(v.content), score: scoreResume(job, v.content, profile, prefs) }))}
            isPreview={job.descriptionIsPreview}
          />
          </div>
        </div>

        <aside className="max-lg:contents lg:space-y-6">
          <div className="max-lg:order-1">
            <MatchCard job={job} prefs={prefs} track={track} hasSkills={Object.values(profile.skills).some((s) => s.length > 0)} />
          </div>
          <div className="max-lg:order-1">
            <AutofillCard
              jobId={job.id}
              company={job.company}
              platform={target?.platform ?? null}
              resumes={autofillResumes}
              suggested={lastRun?.resumeId ?? autofillResumes[0]?.id ?? null}
              initialRun={lastRun}
              initialOnline={helperOnline(uid)}
            />
          </div>

          <div className="max-lg:order-4">
          <ClaudeHelp
            job={{ title: job.title, company: job.company, location: job.location, url: postingUrl ?? "", description: job.description, descriptionIsPreview: job.descriptionIsPreview }}
            profile={profile}
            prefs={prefs}
            track={track}
            baseResume={baseResumes[track] ?? ""}
          />
          </div>

          {moreFromCompany.length > 0 && (
            <Card className="p-5 max-lg:order-5">
              <CardTitle icon="building">More at {job.company}</CardTitle>
              <JobList jobs={moreFromCompany} showCompany={false} />
            </Card>
          )}

          {similar.length > 0 && (
            <Card className="p-5 max-lg:order-6">
              <CardTitle icon="search">Similar jobs for you</CardTitle>
              <JobList jobs={similar} showCompany />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

type RowState = "good" | "warn" | "bad" | "unknown";

function MatchCard({ job, prefs, track, hasSkills }: { job: Job; prefs: Preferences; track: Track; hasSkills: boolean }) {
  const exp = experienceLabel({ min: job.expMin, max: job.expMax });
  const salary = salaryLabel(job.salaryMinLpa, job.salaryMaxLpa);
  const floor = prefs.salaryFloorLpa;

  const expRow: [RowState, string] =
    job.expMin === null
      ? ["unknown", job.descriptionIsPreview ? "Experience isn't in the short preview" : "Experience isn't mentioned"]
      : isInternship({ min: job.expMin, max: job.expMax })
        ? ["bad", "Internship, not a full-time role"]
        : job.expFit
          ? ["good", `Asks ${exp}: fits your experience`]
          : ["bad", `Asks ${exp}: more than the ${prefs.maxExperience} yrs you're targeting`];

  // Show where the experience figure came from, so you can check it at a glance.
  const found = job.expMin === null ? null : parseExperience(job.title, job.description);
  const expNote =
    !found || isInternship({ min: job.expMin, max: job.expMax })
      ? null
      : found.min !== job.expMin || found.max !== job.expMax
        ? "As reported by Google Jobs"
        : found.quote
          ? <q className="italic">{found.quote}</q>
          : "Going by the job title";

  const salaryNote = job.salaryEstimated ? " (Adzuna's estimate)" : "";
  const salaryRow: [RowState, string] =
    job.salaryBucket === "meets"
      ? ["good", `${salary}${salaryNote}: meets your ₹${floor} LPA`]
      : job.salaryBucket === "possible"
        ? ["warn", `${salary}${salaryNote}: your ₹${floor} LPA is inside the range`]
        : job.salaryBucket === "below"
          ? ["bad", `${salary}${salaryNote}: below your ₹${floor} LPA`]
          : ["unknown", "Salary isn't mentioned"];

  return (
    <Card className="p-5">
      <CardTitle icon="check">Your match</CardTitle>
      <Verdict fit={job.fit} reasons={job.fitReasons} />

      {hasSkills ? (
        <div className="space-y-3">
          <SkillGroup title={`Skills you have · ${job.matchedSkills.length}`} skills={job.matchedSkills} tone="good" empty="None of your skills are mentioned" />
          <SkillGroup title={`Not on your profile · ${job.missingSkills.length}`} skills={job.missingSkills} tone="neutral" empty="Nothing missing" />
        </div>
      ) : (
        <p className="text-sm text-muted">
          <Link href="/profile" className="font-medium text-accent hover:underline">
            Add your skills
          </Link>{" "}
          to see which ones this job asks for.
        </p>
      )}

      <ul className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
        <Row state={expRow[0]} label={expRow[1]} note={expNote} />
        <Row state={salaryRow[0]} label={salaryRow[1]} />
        {job.mentionsCtc && <Row state="warn" label="Quotes CTC or variable pay: confirm the base salary" />}
      </ul>

      <JumpLink
        to="tailor"
        className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm transition hover:bg-accent-soft hover:text-accent"
      >
        <span>
          Best resume: <b>{TRACK_LABEL[track]}</b>
        </span>
        <Icon name="arrowRight" className="size-4" />
      </JumpLink>

      {job.descriptionIsPreview && (
        <p className="mt-3 text-xs text-muted">Checked against the short preview only. Paste the full description for an exact match.</p>
      )}
    </Card>
  );
}

const VERDICT_STYLE = {
  fit: { title: "You can apply", box: "bg-good/8 ring-good/25 text-good" },
  check: { title: "Can't confirm yet", box: "bg-warn/8 ring-warn/25 text-warn" },
  no: { title: "Not a fit", box: "bg-bad/8 ring-bad/25 text-bad" },
} as const;

/** The headline answer for this job, with every reason behind it. */
function Verdict({ fit, reasons }: { fit: string; reasons: string[] }) {
  const v = VERDICT_STYLE[fit as keyof typeof VERDICT_STYLE] ?? VERDICT_STYLE.check;
  return (
    <div className={cx("mb-4 rounded-xl px-3.5 py-3 ring-1 ring-inset", v.box)}>
      <p className="text-sm font-semibold">{v.title}</p>
      {reasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SkillGroup({ title, skills, tone, empty }: { title: string; skills: string[]; tone: "good" | "neutral"; empty: string }) {
  return (
    <div>
      <p className={cx("mb-1.5 text-xs font-medium", tone === "good" ? "text-good" : "text-muted")}>{title}</p>
      {skills.length ? (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <Badge key={s} tone={tone}>
              {s}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">{empty}</p>
      )}
    </div>
  );
}

function Row({ state, label, note }: { state: RowState; label: string; note?: React.ReactNode }) {
  const style = {
    good: "bg-good/12 text-good",
    warn: "bg-warn/12 text-warn",
    bad: "bg-bad/12 text-bad",
    unknown: "bg-surface-2 text-muted",
  }[state];
  const icon = state === "good" ? "check" : state === "bad" ? "x" : state === "warn" ? "info" : null;
  return (
    <li className="flex items-start gap-2.5">
      <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", style)}>
        {icon ? <Icon name={icon} className="size-3" strokeWidth={2.5} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0">
        <span className={cx(state === "unknown" && "text-muted")}>{label}</span>
        {note && <span className="mt-1 block text-xs leading-relaxed text-muted">{note}</span>}
      </span>
    </li>
  );
}

function JobList({ jobs, showCompany }: { jobs: Job[]; showCompany: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {jobs.map((j) => {
        const salary = salaryLabel(j.salaryMinLpa, j.salaryMaxLpa);
        return (
          <li key={j.id} className="py-3 first:pt-0 last:pb-0">
            <Link href={`/jobs/${j.id}`} className="group block">
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium leading-snug group-hover:text-accent">{j.title}</span>
                <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">{j.score}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted" suppressHydrationWarning>
                {[showCompany && j.company, j.location, salary, timeAgo(j.postedAt ?? j.firstSeenAt)].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
