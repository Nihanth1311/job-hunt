import type { Metadata } from "next";
import Link from "next/link";
import { CompanyFilter, type CompanyChoice } from "@/components/company-filter";
import { FetchButton } from "@/components/fetch-button";
import { FilterNavProvider, FilterOption, NavLink, PendingArea } from "@/components/filter-nav";
import { JobCard } from "@/components/job-card";
import { RememberJobsFilters } from "@/components/jobs-memory";
import { buttonClass, Card, cx, EmptyState, Icon, PageHeader, Segmented, segmentClass } from "@/components/ui";
import {
  categoryCounts,
  companyCounts,
  filterSummary,
  fitCounts,
  listJobs,
  parseFilters,
  type FilterSummary,
  type JobFilters,
  type WindowKey,
} from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { getPreferences, getSecrets, getState } from "@/lib/settings";
import { SOURCES } from "@/lib/sources";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Jobs" };

const DEFAULTS: JobFilters = {
  window: "48h",
  category: "tech",
  salary: "ok",
  fit: "ready",
  view: "new",
  sort: "score",
  loc: "pref",
  q: "",
  company: "",
};
const KEYS: Record<keyof JobFilters, string> = {
  window: "w",
  category: "cat",
  salary: "sal",
  fit: "fit",
  view: "view",
  sort: "sort",
  loc: "loc",
  q: "q",
  company: "co",
};

function href(f: JobFilters, patch: Partial<JobFilters>): string {
  const next = { ...f, ...patch };
  const qs = new URLSearchParams();
  for (const k of Object.keys(KEYS) as (keyof JobFilters)[]) {
    if (next[k] !== DEFAULTS[k]) qs.set(KEYS[k], String(next[k]));
  }
  const s = qs.toString();
  return s ? `/jobs?${s}` : "/jobs";
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const { id: uid } = await requireUser();
  const f = parseFilters(await searchParams);
  const [jobs, counts, prefs, summary, fc, companyRows, secrets] = await Promise.all([
    listJobs(uid, f),
    categoryCounts(uid, f),
    getPreferences(uid),
    filterSummary(uid, f),
    fitCounts(uid, f),
    companyCounts(uid, f),
    getSecrets(uid),
  ]);
  const floor = prefs.salaryFloorLpa;
  const hasSearchSources = SOURCES.some((s) => s.id === "jsearch" && s.configured(prefs, secrets));
  const googleQuota = secrets.jsearchKey ? ((await getState<{ remaining: number }>(uid, "jsearchQuota"))?.remaining ?? null) : undefined;
  const changed = (["window", "category", "salary", "fit", "loc", "company"] as const).filter((k) => f[k] !== DEFAULTS[k]).length;
  const companies: CompanyChoice[] = companyRows.map((c) => ({ name: c.company, n: c.n, total: c.total, href: href(f, { company: c.company }) }));
  // A company picked earlier that has no jobs in this window still shows, so you can see it's selected.
  if (f.company && !companies.some((c) => c.name === f.company)) companies.unshift({ name: f.company, n: 0, total: 0, href: href(f, {}) });
  const resetHref = href(DEFAULTS, { view: f.view, sort: f.sort, q: f.q });
  const at = f.company ? ` at ${f.company}` : "";
  // Jobs in this view and window at the chosen company (or everywhere), before the other filters.
  const pool = summary.total - summary.hidden.company;

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={`Fresh roles in India, matched to you · ₹${floor} LPA+ · up to ${prefs.maxExperience} yrs experience`}
        actions={
          <>
            <Link href="/jobs/new" className={buttonClass("secondary")}>
              <Icon name="plus" /> Add a job
            </Link>
            <FetchButton variant="primary" />
          </>
        }
      />

      {/* Which list + search */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented className="max-sm:w-full max-sm:[&>*]:flex-1 max-sm:[&>*]:text-center">
          {(["new", "saved", "applied", "skipped"] as const).map((v) => (
            <Link key={v} href={href(f, { view: v })} className={cx(segmentClass(f.view === v), "capitalize")}>
              {v === "new" ? "New" : v}
            </Link>
          ))}
        </Segmented>
        <form action="/jobs" className="relative ml-auto flex min-w-0 flex-1 basis-56 sm:max-w-sm">
          {Object.entries(KEYS).map(([k, key]) =>
            k !== "q" && f[k as keyof JobFilters] !== DEFAULTS[k as keyof JobFilters] ? (
              <input key={key} type="hidden" name={key} value={String(f[k as keyof JobFilters])} />
            ) : null,
          )}
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" type="search" defaultValue={f.q} placeholder="Search title, company, skill…" className="field pl-10" />
        </form>
        {/* Phones: filters open as a sheet from here. */}
        <label
          htmlFor="filters-toggle"
          aria-label="Filters"
          className={cx(buttonClass("secondary"), "relative h-auto shrink-0 cursor-pointer self-stretch px-3.5 lg:hidden")}
        >
          <Icon name="settings" className="size-4" /> Filters
          {changed > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">{changed}</span>
          )}
        </label>
      </div>

      <RememberJobsFilters />
      <FilterNavProvider>
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Filters: a panel on desktop, a fold-out on phones */}
        <div className="max-lg:contents lg:sticky lg:top-6">
          {/* Phones: a CSS-only toggle (checkbox + labels) opens the panel as a bottom sheet; the
              checkbox keeps its state while filter taps reload the list, so you can change several. */}
          <input id="filters-toggle" type="checkbox" className="peer sr-only" />
          <label htmlFor="filters-toggle" aria-hidden className="fixed inset-0 z-40 hidden bg-black/40 peer-checked:block lg:hidden" />
          {/* Desktop: capped to the window height; the options scroll inside the panel, separate from the job list. */}
          <Card className="hidden flex-col overflow-hidden peer-checked:flex max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[85dvh] max-lg:rounded-b-none max-lg:rounded-t-2xl max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[var(--shadow-lg)] lg:flex lg:max-h-[calc(100dvh-3rem)]">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold tracking-tight">Filters</h2>
              <div className="flex items-center gap-4">
                {changed > 0 && (
                  <NavLink href={resetHref} className="text-xs font-medium text-accent hover:underline">
                    Reset
                  </NavLink>
                )}
                <label htmlFor="filters-toggle" aria-label="Close filters" className="-m-2 cursor-pointer p-2 text-muted hover:text-ink lg:hidden">
                  <Icon name="x" className="size-5" />
                </label>
              </div>
            </div>
            <div className="filter-scroll my-1.5 mr-1.5 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-3.5 pl-5 pr-3.5">

            <FilterGroup title="Can I apply?">
              <FilterOption group="fit" to={href(f, { fit: "ready" })} active={f.fit === "ready"} label="Ready to apply" count={fc.fit} />
              <FilterOption group="fit" to={href(f, { fit: "check" })} active={f.fit === "check"} label="Needs a look" count={fc.check} />
              <FilterOption group="fit" to={href(f, { fit: "no" })} active={f.fit === "no"} label="Not a fit" count={fc.no} />
              <FilterOption group="fit" to={href(f, { fit: "all" })} active={f.fit === "all"} label="Everything" count={fc.all} />
            </FilterGroup>

            {f.view === "new" && (
              <FilterGroup title="Posted">
                {(Object.keys(WINDOW_SHORT) as WindowKey[]).map((w) => (
                  <FilterOption key={w} group="window" to={href(f, { window: w })} active={f.window === w} label={WINDOW_SHORT[w]} />
                ))}
              </FilterGroup>
            )}

            <FilterGroup title="Role type">
              <FilterOption group="category" to={href(f, { category: "tech" })} active={f.category === "tech"} label="All tech roles" count={counts.tech ?? 0} />
              {CATEGORIES.map((c) => (
                <FilterOption
                  key={c}
                  group="category"
                  to={href(f, { category: c })}
                  active={f.category === c}
                  label={c === "other" ? "Non-tech / other" : CATEGORY_LABEL[c]}
                  count={counts[c] ?? 0}
                />
              ))}
            </FilterGroup>

            {companies.length > 0 && (
              <FilterGroup title="Company">
                <CompanyFilter companies={companies} selected={f.company} anyHref={href(f, { company: "" })} />
              </FilterGroup>
            )}

            <FilterGroup title="Salary">
              <FilterOption group="salary" to={href(f, { salary: "ok" })} active={f.salary === "ok"} label={`₹${floor} LPA+ or not shown`} />
              <FilterOption group="salary" to={href(f, { salary: "meets" })} active={f.salary === "meets"} label={`₹${floor} LPA+ only`} />
              <FilterOption group="salary" to={href(f, { salary: "all" })} active={f.salary === "all"} label="Any salary" />
            </FilterGroup>


            {prefs.locations.length > 0 && (
              <FilterGroup title="Location">
                <FilterOption group="loc" to={href(f, { loc: "pref" })} active={f.loc === "pref"} label={prefs.locations.join(", ")} />
                <FilterOption group="loc" to={href(f, { loc: "all" })} active={f.loc === "all"} label="Anywhere in India" />
              </FilterGroup>
            )}
            </div>
            <div className="shrink-0 border-t border-line p-3 lg:hidden">
              <label htmlFor="filters-toggle" className={cx(buttonClass("primary"), "w-full cursor-pointer")}>
                Show {jobs.length >= 150 ? "150+" : jobs.length} {jobs.length === 1 ? "job" : "jobs"}
              </label>
            </div>
          </Card>
        </div>

        {/* Results (fade while a filter change loads) */}
        <PendingArea className="min-w-0">
          <div className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold tracking-tight">
              {jobs.length >= 150 ? "150+" : jobs.length} {jobs.length === 1 ? "job" : "jobs"}
              {f.fit !== "all" && <span> {FIT_HEADING[f.fit]}</span>}
              {f.company && <span> at {f.company}</span>}
              {f.view === "new" && <span className="font-normal text-muted"> {WINDOW_LABEL[f.window]}</span>}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted">
              Sort
              <Segmented>
                <NavLink href={href(f, { sort: "score" })} className={segmentClass(f.sort === "score")}>
                  Best match
                </NavLink>
                <NavLink href={href(f, { sort: "recent" })} className={segmentClass(f.sort === "recent")}>
                  Newest
                </NavLink>
              </Segmented>
            </div>
          </div>
          {f.view === "new" && <HiddenSummary s={summary} f={f} floor={floor} fc={fc} />}
          </div>

          {jobs.length === 0 ? (
            f.view === "new" ? (
              <Card className="px-6 py-14 text-center">
                <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Icon name="search" className="size-5" />
                </span>
                <p className="font-medium">
                  {pool === 0
                    ? `No new jobs${at} ${WINDOW_LABEL[f.window]}`
                    : f.fit === "ready"
                      ? `No job${at} is confirmed as a fit ${WINDOW_LABEL[f.window]} yet`
                      : `None of the ${pool} jobs${at} ${WINDOW_LABEL[f.window]} match all your filters`}
                </p>
                {f.company && pool === 0 && summary.total > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    <Link className="font-medium text-accent underline" href={href(f, { company: "" })}>
                      Show every company
                    </Link>{" "}
                    ({summary.total} {summary.total === 1 ? "job" : "jobs"} {WINDOW_LABEL[f.window]})
                  </p>
                )}
                {f.fit === "ready" && fc.check > 0 && (
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                    <Link className="font-medium text-accent underline" href={href(f, { fit: "check" })}>
                      {fc.check} {fc.check === 1 ? "job needs" : "jobs need"} a look
                    </Link>
                    : their full requirements or experience aren&apos;t confirmed yet. Open one to check it.
                  </p>
                )}
                {summary.longer.some((l) => l.shown > 0) && (
                  <p className="mt-3 text-sm text-muted">
                    With the same filters:{" "}
                    {summary.longer
                      .filter((l) => l.shown > 0)
                      .map((l, i) => (
                        <span key={l.window}>
                          {i > 0 && " · "}
                          <Link className="text-accent underline" href={href(f, { window: l.window })}>
                            {l.shown} {WINDOW_LABEL[l.window]}
                          </Link>
                        </span>
                      ))}
                  </p>
                )}
                {summary.total === 0 && !summary.longer.some((l) => l.shown > 0) && (
                  <p className="mt-2 text-sm text-muted">
                    Press <b>Fetch now</b>, or check back after the next automatic fetch.
                  </p>
                )}
              </Card>
            ) : (
              <EmptyState title={`No ${f.view} jobs yet`}>Jobs you act on from the New tab show up here.</EmptyState>
            )
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} googleQuota={googleQuota} />
              ))}
              {jobs.length >= 150 && <p className="py-4 text-center text-sm text-muted">Showing the top 150. Narrow the filters to see others.</p>}
            </div>
          )}

          {f.view === "new" && !hasSearchSources && jobs.length < 10 && (
            <Card className="mt-5 p-5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Icon name="info" className="text-accent" />
                Want a lot more 0–2 year roles?
              </p>
              <p className="mt-1 text-muted">
                Big companies mostly post senior roles. Google Jobs adds LinkedIn, Naukri and Indeed listings, about 50 a day. Add your
                free key in{" "}
                <Link className="text-accent underline" href="/settings#keys">
                  Settings → Your API keys
                </Link>
                .
              </p>
            </Card>
          )}
        </PendingArea>
      </div>
      </FilterNavProvider>
    </>
  );
}

const FIT_HEADING: Record<Exclude<JobFilters["fit"], "all">, string> = {
  ready: "ready to apply",
  check: "that need a look",
  no: "that aren't a fit",
};

const WINDOW_SHORT: Record<WindowKey, string> = {
  "24h": "Last 24 hours",
  "48h": "Last 2 days",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const WINDOW_LABEL: Record<WindowKey, string> = {
  "24h": "in the last 24 hours",
  "48h": "in the last 2 days",
  "7d": "in the last 7 days",
  "30d": "in the last 30 days",
};

/** One line that says what you're seeing and which filters hide what, each with a one-click "show". */
function HiddenSummary({
  s,
  f,
  floor,
  fc,
}: {
  s: FilterSummary;
  f: JobFilters;
  floor: number;
  fc: Record<"fit" | "check" | "no" | "all", number>;
}) {
  const reasons = [
    s.hidden.category > 0 && {
      n: s.hidden.category,
      text: f.category === "tech" ? "non-tech roles" : "in other categories",
      to: href(f, { category: f.category === "tech" ? "other" : "tech" }),
    },
    f.fit === "ready" && fc.check > 0 && { n: fc.check, text: "need a look (requirements not confirmed)", to: href(f, { fit: "check" }) },
    f.fit === "ready" && fc.no > 0 && { n: fc.no, text: "aren't a fit", to: href(f, { fit: "no" }) },
    f.fit !== "ready" && f.fit !== "all" && s.hidden.fit > 0 && { n: s.hidden.fit, text: "with another verdict", to: href(f, { fit: "all" }) },
    s.hidden.salary > 0 && {
      n: s.hidden.salary,
      text: f.salary === "meets" ? `don't show ₹${floor}L+` : `below ₹${floor} LPA`,
      to: href(f, { salary: "all" }),
    },
    s.hidden.loc > 0 && { n: s.hidden.loc, text: "outside your cities", to: href(f, { loc: "all" }) },
    s.hidden.q > 0 && { n: s.hidden.q, text: `don't match “${f.q}”`, to: href(f, { q: "" }) },
  ].filter(Boolean) as { n: number; text: string; to: string }[];

  if (s.total === 0 || reasons.length === 0) return null;
  return (
    <p className="mt-1 text-sm text-muted">
      Hidden by your filters:{" "}
      {reasons.map((r, i) => (
        <span key={r.text}>
          {i > 0 && " · "}
          <Link href={r.to} scroll={false} className="text-accent hover:underline">
            {r.n} {r.text}
          </Link>
        </span>
      ))}
    </p>
  );
}
