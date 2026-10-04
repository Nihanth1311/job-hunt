import "server-only";
import type { RawJob } from "@/shared/core/analyze";
import { amountToLpa, parseSalaryText } from "@/shared/core/classify";
import { isCompanyAts, isJobBoard } from "@/shared/core/links";
import { cleanTitle, htmlToText, normKey } from "@/shared/core/text";
import { setState } from "../../services/settings";
import type { JobSource } from "./";

// JSearch reads Google's job search, which lists LinkedIn, Naukri, Indeed, Glassdoor and
// company-site postings. Free key via RapidAPI ("JSearch" by OpenWeb Ninja). The free plan
// has a small monthly quota, so this source runs once a day with a few queries.
interface JSearchJobRaw {
    job_id: string;
    job_title: string;
    employer_name?: string;
    job_publisher?: string;
    job_apply_link?: string;
    job_description?: string;
    job_is_remote?: boolean;
    job_city?: string | null;
    job_state?: string | null;
    job_country?: string | null;
    job_location?: string | null;
    job_posted_at_datetime_utc?: string | null;
    job_posted_at_timestamp?: number | null;
    job_min_salary?: number | null;
    job_max_salary?: number | null;
    job_salary_period?: string | null;
    job_salary_currency?: string | null;
    job_apply_is_direct?: boolean | null;
    /** Every "Apply on …" button Google shows; is_direct = the employer's own site. */
    apply_options?: { publisher?: string; apply_link?: string; is_direct?: boolean }[] | null;
    /** Google's own read of the experience asked. */
    job_required_experience?: {
      no_experience_required?: boolean | null;
      required_experience_in_months?: number | null;
    } | null;
    /** Newer response shape. */
    required_experience_years?: number | null;
    /** e.g. "₹5L–₹8L a year", when the posting shows pay. */
    job_salary_string?: string | null;
}

/** /search-v2 wraps jobs in { jobs, cursor }; the old /search returned a plain array. */
interface JSearchResponse {
  data?: { jobs?: JSearchJobRaw[]; cursor?: string | null } | JSearchJobRaw[];
}

type JSearchJob = JSearchJobRaw;

/** Experience Google reported, in months (0 = none needed), or null when it didn't say. */
function experienceMonths(r: JSearchJob): number | null {
  const e = r.job_required_experience;
  if (e?.no_experience_required) return 0;
  if (typeof e?.required_experience_in_months === "number") return e.required_experience_in_months;
  if (typeof r.required_experience_years === "number") return r.required_experience_years * 12;
  return null;
}

/** The employer's own posting: Google's "direct" option, else any option on a company hiring system. */
function companyLink(r: JSearchJob): string | null {
  const options = (r.apply_options ?? []).filter((o) => o.apply_link);
  const direct = options.find((o) => o.is_direct && !isJobBoard(o.apply_link));
  if (direct) return direct.apply_link!;
  if (r.job_apply_is_direct && r.job_apply_link && !isJobBoard(r.job_apply_link)) return r.job_apply_link;
  return options.find((o) => isCompanyAts(o.apply_link))?.apply_link ?? null;
}

/** Pay from the numeric fields, else from the salary text Google shows. */
function structuredSalary(r: JSearchJob) {
  const min = amountToLpa(r.job_min_salary, r.job_salary_period);
  const max = amountToLpa(r.job_max_salary, r.job_salary_period);
  if (min !== null || max !== null) return { min, max };
  return (r.job_salary_string && parseSalaryText(r.job_salary_string)) || undefined;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * One search = one request = up to 10 jobs with full descriptions. (Google's "under 3 years"
 * filter is skipped on purpose: most Indian postings aren't tagged, so it returns almost
 * nothing. The app judges experience from the full description instead.)
 */
async function search(
  apiKey: string,
  query: string,
  datePosted = "3days",
  addJobsInIndia = true,
): Promise<{ jobs: RawJob[]; remaining: number | null; limit: number | null }> {
  const params = new URLSearchParams({
    query: addJobsInIndia ? `${query} jobs in India` : query,
    country: "in",
    date_posted: datePosted,
  });
  const res = await fetch(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    headers: {
      accept: "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
    signal: AbortSignal.timeout(60_000), // it searches Google live
    cache: "no-store",
  });
  const num = (h: string) => (res.headers.get(h) === null ? null : Number(res.headers.get(h)));
  const remaining = num("x-ratelimit-requests-remaining");
  const limit = num("x-ratelimit-requests-limit");
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).match(/"message"s*:s*"([^"]{1,120})"/)?.[1];
    throw new Error(`${res.status} ${detail ?? res.statusText}`);
  }
  const body = (await res.json()) as JSearchResponse;
  const found = Array.isArray(body.data) ? body.data : (body.data?.jobs ?? []);
  return { jobs: found.map(toRawJob), remaining, limit };
}

function toRawJob(r: JSearchJob): RawJob {
  const location = r.job_location || [r.job_city, r.job_state].filter(Boolean).join(", ") || r.job_country || "India";
  const inr = !r.job_salary_currency || r.job_salary_currency.toUpperCase() === "INR";
  const posted = r.job_posted_at_datetime_utc
    ? new Date(r.job_posted_at_datetime_utc)
    : r.job_posted_at_timestamp
      ? new Date(r.job_posted_at_timestamp * 1000)
      : null;
  return {
    source: "jsearch",
    externalId: r.job_id,
    title: r.job_title,
    company: r.employer_name?.trim() || "Unknown company",
    location,
    isRemote: Boolean(r.job_is_remote),
    url: r.job_apply_link ?? "",
    companyUrl: companyLink(r),
    requiredExpMonths: experienceMonths(r),
    description: htmlToText(r.job_description ?? ""),
    postedAt: posted,
    publisher: r.job_publisher ?? null,
    salary: inr ? structuredSalary(r) : undefined,
  };
}

export const jsearch: JobSource = {
  id: "jsearch",
  label: "Google Jobs (JSearch) — LinkedIn, Naukri, Indeed…",
  scope: "user",
  configured: (prefs, secrets) => Boolean(secrets.jsearchKey) && prefs.jsearchQueriesPerDay > 0,
  // Free plan: 200 requests a month. One run a day (5 searches) keeps it well inside that.
  due: ({ lastRun }) => !lastRun || Date.now() - lastRun.getTime() > 20 * 60 * 60 * 1000,
  budgeted: true,

  async fetch({ prefs, secrets, userId }) {
    const all = prefs.searchQueries;
    const n = Math.min(prefs.jsearchQueriesPerDay, all.length);
    // Rotate through your queries day by day so all of them get covered.
    const start = (Math.floor(Date.now() / DAY) * n) % Math.max(all.length, 1);
    const queries = Array.from({ length: n }, (_, i) => all[(start + i) % all.length]);

    // All searches at once: each one searches Google live and can take a while.
    const results = await Promise.allSettled(queries.map((q) => search(secrets.jsearchKey!, q)));
    const jobs = results.flatMap((r) => (r.status === "fulfilled" ? r.value.jobs : []));
    const errors = results.flatMap((r, i) => (r.status === "rejected" ? [`"${queries[i]}": ${(r.reason as Error).message}`] : []));

    // Remember the remaining monthly quota so Settings can show it.
    const quota = results.flatMap((r) => (r.status === "fulfilled" && r.value.remaining !== null ? [r.value] : []));
    if (quota.length) {
      const last = quota.reduce((lo, q) => (q.remaining! < lo.remaining! ? q : lo));
      await setState(userId, "jsearchQuota", { remaining: last.remaining, limit: last.limit, at: new Date().toISOString() });
    }

    // One slow or failed search shouldn't lose the others; only fail if nothing came back.
    if (errors.length && !jobs.length) throw new Error(errors.join("; "));
    if (errors.length) console.warn("[jsearch]", errors.join("; "));
    return jobs;
  },
};

const words = (s: string) => new Set(normKey(cleanTitle(s)).split(" ").filter((w) => w.length > 1));

/** Same company, and titles that share most of their words. */
function sameJob(a: { title: string; company: string }, b: { title: string; company: string }): boolean {
  const ca = normKey(a.company);
  const cb = normKey(b.company);
  if (!ca || !cb || !(ca === cb || ca.includes(cb) || cb.includes(ca))) return false;
  const ta = words(a.title);
  const tb = words(b.title);
  const shared = [...ta].filter((w) => tb.has(w)).length;
  return shared / Math.max(1, Math.min(ta.size, tb.size)) >= 0.6;
}

/**
 * Look one job up on Google Jobs (1 request) to get its full description, e.g. for an
 * Adzuna preview. Returns null when Google Jobs doesn't list it.
 */
export async function findOnGoogleJobs(userId: string, apiKey: string, job: { title: string; company: string }): Promise<RawJob | null> {
  const { jobs, remaining, limit } = await search(apiKey, `${cleanTitle(job.title)} ${job.company}`, "month", false);
  if (remaining !== null) await setState(userId, "jsearchQuota", { remaining, limit, at: new Date().toISOString() });
  return jobs.find((r) => sameJob(job, r) && r.description.length > 300) ?? null;
}
