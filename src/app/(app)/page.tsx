import Link from "next/link";
import { FetchButton } from "@/components/fetch-button";
import { JobsLink } from "@/components/jobs-memory";
import { ArrowLink, buttonClass, Card, CardTitle, CategoryBadge, cx, Icon, PageHeader, SalaryBadge, ScorePill, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, isOverdue, timeAgo } from "@/lib/format";
import { dashboardData, getBaseResumes } from "@/lib/queries";
import { getPreferences, getProfile, getSecrets, getState } from "@/lib/settings";
import { SOURCES } from "@/lib/sources";
import { APP_STATUSES, CATEGORIES, STATUS_LABEL, type Category } from "@/lib/types";

export default async function TodayPage() {
  const { id: uid } = await requireUser();
  const [data, profile, prefs, bases, lastFetch, secrets] = await Promise.all([
    dashboardData(uid),
    getProfile(uid),
    getPreferences(uid),
    getBaseResumes(uid),
    getState<string>(uid, "lastFetchAt"),
    getSecrets(uid),
  ]);

  const count = (rows: { category: string; n: number }[], c?: Category) =>
    rows.filter((r) => !c || r.category === c).reduce((s, r) => s + r.n, 0);
  const active = data.apps.filter((a) => ["applied", "assessment", "interview"].includes(a.status));
  const interviews = data.apps.filter((a) => a.status === "interview" || a.status === "assessment");
  const followUps = active.filter((a) => a.followUpAt && isOverdue(a.followUpAt));
  const upcoming = active.filter((a) => a.followUpAt && !isOverdue(a.followUpAt)).slice(0, 4);

  const hasSkills = Object.values(profile.skills).some((s) => s.length > 0);
  const extraSources = SOURCES.filter((s) => s.id === "jsearch" && s.configured(prefs, secrets)).length;
  const setup = [
    { done: hasSkills && profile.masterResume.trim().length > 0, label: "Add your skills and master resume", href: "/profile" },
    { done: Object.keys(bases).length > 0, label: "Create your base resumes with Claude", href: "/resumes" },
    { done: extraSources > 0, label: "Add your free Google Jobs (JSearch) key for more jobs", href: "/settings#keys" },
    { done: Boolean(lastFetch), label: "Fetch your first jobs", href: "/jobs" },
  ];
  const doneCount = setup.filter((s) => s.done).length;
  const statusCount = (s: string) => data.apps.filter((a) => a.status === s).length;
  const pipelineMax = Math.max(1, ...APP_STATUSES.map(statusCount));
  const firstName = profile.name.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hi ${firstName}` : "Today"}
        subtitle={lastFetch ? <span suppressHydrationWarning>Jobs last checked {timeAgo(lastFetch)}</span> : "No jobs fetched yet"}
        actions={<FetchButton variant="primary" />}
      />

      {setup.some((s) => !s.done) && (
        <Card className="mb-6 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Finish setting up</h2>
              <p className="text-xs text-muted">
                {doneCount} of {setup.length} done
              </p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(doneCount / setup.length) * 100}%` }}
              />
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {setup.map((s) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className={cx(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition",
                    s.done ? "text-muted" : "bg-surface-2 hover:bg-accent-soft hover:text-accent",
                  )}
                >
                  <span
                    className={cx(
                      "grid size-5 shrink-0 place-items-center rounded-full",
                      s.done ? "bg-good text-surface-solid" : "border border-line-strong",
                    )}
                  >
                    {s.done && <Icon name="check" className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={cx("flex-1", s.done && "line-through")}>{s.label}</span>
                  {!s.done && <Icon name="chevronRight" className="size-3.5 opacity-60" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat
          label="Ready to apply · 24h"
          icon="sparkles"
          value={count(data.last24)}
          hint={
            <Link href="/jobs?w=24h" className="group">
              <ArrowLink>View</ArrowLink>
            </Link>
          }
        />
        <Stat
          label="Ready to apply · 2 days"
          icon="jobs"
          value={count(data.last48)}
          hint={
            data.needsLook > 0 ? (
              <Link href="/jobs?fit=check" className="group">
                <ArrowLink>{`+${data.needsLook} need a look`}</ArrowLink>
              </Link>
            ) : (
              <Link href="/jobs" className="group">
                <ArrowLink>View</ArrowLink>
              </Link>
            )
          }
        />
        <Stat label="In progress" icon="pipeline" value={active.length} hint={`${interviews.length} at assessment/interview`} />
        <Stat
          label="Follow-ups due"
          icon="bell"
          value={<span className={followUps.length ? "text-bad" : ""}>{followUps.length}</span>}
          hint={
            <Link href="/tracker" className="group">
              <ArrowLink>Tracker</ArrowLink>
            </Link>
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle icon="jobs">Ready to apply, by category</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 text-right font-medium">Last 24h</th>
                    <th className="pb-2 text-right font-medium">Last 2 days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {CATEGORIES.filter((c) => c !== "other" && c !== "internship").map((c) => (
                    <tr key={c}>
                      <td className="py-2.5">
                        <CategoryBadge category={c} />
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <Link
                          href={`/jobs?w=24h&cat=${c}`}
                          className="rounded-md px-1.5 py-0.5 transition hover:bg-accent-soft hover:text-accent"
                        >
                          {count(data.last24, c)}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <Link href={`/jobs?cat=${c}`} className="rounded-md px-1.5 py-0.5 transition hover:bg-accent-soft hover:text-accent">
                          {count(data.last48, c)}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              Only jobs whose full requirements were checked against your experience, skills and ₹{prefs.salaryFloorLpa} LPA floor.
            </p>
          </Card>

          <Card className="p-5">
            <CardTitle
              icon="sparkles"
              action={
                <JobsLink className="group text-xs">
                  <ArrowLink>All jobs</ArrowLink>
                </JobsLink>
              }
            >
              Ready to apply now
            </CardTitle>
            {data.top.length === 0 ? (
              <p className="text-sm text-muted">
                {data.totalJobs === 0
                  ? "No jobs yet. Press “Fetch now” to pull the first batch."
                  : "No job confirmed as a fit in the last 2 days yet. Jobs that need a look are on the Jobs page."}
              </p>
            ) : (
              <ul className="-mx-2 space-y-1">
                {data.top.map((j) => (
                  <li key={j.id} className="relative flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-surface-2">
                    <ScorePill score={j.score} />
                    <div className="min-w-0 flex-1">
                      {/* The whole row opens the job; the Tailor button sits above this link. */}
                      <Link href={`/jobs/${j.id}`} className="line-clamp-2 text-sm font-medium leading-snug after:absolute after:inset-0">
                        {j.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {j.company} · {j.location} · <span suppressHydrationWarning>{timeAgo(j.postedAt ?? j.firstSeenAt)}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <CategoryBadge category={j.category} />
                        <SalaryBadge min={j.salaryMinLpa} max={j.salaryMaxLpa} bucket={j.salaryBucket} estimated={j.salaryEstimated} />
                      </div>
                    </div>
                    <Link
                      href={`/jobs/${j.id}#tailor`}
                      aria-label="Tailor resume"
                      className={cx(buttonClass("secondary", "sm"), "relative z-10 w-9 shrink-0 px-0 sm:w-auto sm:px-3")}
                    >
                      <Icon name="sparkles" className="size-3.5" />
                      <span className="hidden sm:inline">Tailor</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle icon="calendar">Follow-ups</CardTitle>
            {followUps.length === 0 && upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nothing due. Applications get a follow-up date 7 days after you apply.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {[...followUps, ...upcoming].map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/tracker/${a.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-surface-2"
                    >
                      <span className="min-w-0 truncate">
                        {a.company} <span className="text-muted">· {a.title}</span>
                      </span>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                          isOverdue(a.followUpAt) ? "bg-bad/10 font-medium text-bad" : "text-muted",
                        )}
                      >
                        {isOverdue(a.followUpAt) ? "Due" : formatDate(a.followUpAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardTitle icon="pipeline">Pipeline</CardTitle>
            <ul className="space-y-3 text-sm">
              {APP_STATUSES.map((s) => {
                const n = statusCount(s);
                return (
                  <li key={s}>
                    <div className="mb-1 flex justify-between">
                      <span className="text-muted">{STATUS_LABEL[s]}</span>
                      <span className="font-medium tabular-nums">{n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${(n / pipelineMax) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-accent/15 blur-2xl" />
            <h2 className="mb-1 text-[15px] font-semibold tracking-tight">Found a job elsewhere?</h2>
            <p className="mb-4 text-sm text-muted">Add it from LinkedIn or Naukri to track it and tailor your resume for it.</p>
            <Link href="/jobs/new" className={buttonClass("primary", "sm")}>
              <Icon name="plus" className="size-3.5" />
              Add a job
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
