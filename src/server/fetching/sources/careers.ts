import "server-only";
import { isIndiaLocation, type RawJob } from "@/shared/core/analyze";
import { amountToLpa } from "@/shared/core/classify";
import { htmlToText } from "@/shared/core/text";
import type { Preferences } from "@/shared/types";
import { getJson } from "./http";
import type { JobSource } from "./";
import { REGISTRY_BOARDS } from "./companies/registry";

// Public company job boards. No keys, no limits worth worrying about. Every link here
// is the official posting on the company's own careers site.
// Add companies in Settings as "greenhouse:<slug>", "lever:<slug>" or "ashby:<slug>" —
// the slug is the last part of the company's careers URL, e.g. jobs.lever.co/<slug>.

/** Your own extra boards from Settings; ones the company list already covers are skipped. */
function slugsFor(prefs: Preferences, ats: string): string[] {
  return prefs.careerPages
    .map((s) => s.trim())
    .filter((s) => s.toLowerCase().startsWith(`${ats}:`) && !REGISTRY_BOARDS.has(s.toLowerCase()))
    .map((s) => s.slice(ats.length + 1).trim())
    .filter(Boolean);
}

function prettyName(slug: string) {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function periodOf(interval: string | undefined | null): string {
  const i = (interval ?? "").toLowerCase();
  return i.includes("hour") ? "hour" : i.includes("month") ? "month" : "year";
}

/** Fetch every board, but don't let one broken slug stop the others. */
async function eachBoard(slugs: string[], load: (slug: string) => Promise<RawJob[]>): Promise<RawJob[]> {
  const results = await Promise.allSettled(slugs.map(load));
  const failed = results
    .map((r, i) => (r.status === "rejected" ? `${slugs[i]} (${(r.reason as Error).message})` : null))
    .filter(Boolean);
  const jobs = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (failed.length && !jobs.length) throw new Error(`All boards failed: ${failed.join(", ")}`);
  if (failed.length) console.warn(`[careers] skipped: ${failed.join(", ")}`);
  return jobs;
}

// ---------- Greenhouse ----------

interface GreenhouseResponse {
  jobs: {
    id: number;
    title: string;
    absolute_url: string;
    location?: { name?: string };
    updated_at?: string;
    first_published?: string;
    company_name?: string;
    content?: string;
  }[];
}

/** India jobs on one Greenhouse board. */
export async function greenhouseBoard(slug: string): Promise<RawJob[]> {
  const data = await getJson<GreenhouseResponse>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  );
  return (data.jobs ?? [])
    .filter((j) => isIndiaLocation(j.location?.name ?? ""))
    .map((j) => ({
      source: "greenhouse",
      externalId: `${slug}:${j.id}`,
      title: j.title.trim(),
      company: j.company_name?.replace(/\s+(careers|job board|jobs)$/i, "").trim() || prettyName(slug),
      location: j.location?.name ?? "",
      isRemote: /remote/i.test(j.location?.name ?? ""),
      url: j.absolute_url,
      companyUrl: j.absolute_url,
      description: htmlToText(j.content ?? ""),
      postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
    }));
}

export const greenhouse: JobSource = {
  id: "greenhouse",
  label: "Career pages — Greenhouse",
  scope: "user",
  configured: (prefs) => slugsFor(prefs, "greenhouse").length > 0,
  fetch: ({ prefs }) => eachBoard(slugsFor(prefs, "greenhouse"), greenhouseBoard),
};

// ---------- Lever ----------

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  country?: string;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; team?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

/** India jobs on one Lever board. */
export async function leverBoard(slug: string): Promise<RawJob[]> {
  const data = await getJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  );
  return (Array.isArray(data) ? data : [])
    .map((p) => {
      const location = p.categories?.allLocations?.join(", ") || p.categories?.location || "";
      const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
      const inr = p.salaryRange?.currency?.toUpperCase() === "INR";
      const period = periodOf(p.salaryRange?.interval);
      return {
        india: p.country === "IN" || isIndiaLocation(location),
        job: {
          source: "lever",
          externalId: `${slug}:${p.id}`,
          title: p.text.trim(),
          company: prettyName(slug),
          location: location.replace(/\b\w/g, (c) => c.toUpperCase()),
          isRemote: p.workplaceType === "remote",
          url: p.hostedUrl,
          companyUrl: p.hostedUrl,
          description: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n").trim(),
          postedAt: p.createdAt ? new Date(p.createdAt) : null,
          salary: inr
            ? { min: amountToLpa(p.salaryRange?.min, period), max: amountToLpa(p.salaryRange?.max, period) }
            : undefined,
        } satisfies RawJob,
      };
    })
    .filter((x) => x.india)
    .map((x) => x.job);
}

export const lever: JobSource = {
  id: "lever",
  label: "Career pages — Lever",
  scope: "user",
  configured: (prefs) => slugsFor(prefs, "lever").length > 0,
  fetch: ({ prefs }) => eachBoard(slugsFor(prefs, "lever"), leverBoard),
};

// ---------- Ashby ----------

interface AshbyResponse {
  jobs: {
    id: string;
    title: string;
    location?: string;
    secondaryLocations?: { location?: string }[];
    isListed?: boolean;
    isRemote?: boolean | null;
    publishedAt?: string;
    jobUrl: string;
    descriptionPlain?: string;
    address?: { postalAddress?: { addressCountry?: string } };
    compensation?: {
      summaryComponents?: {
        compensationType?: string;
        interval?: string;
        currencyCode?: string;
        minValue?: number;
        maxValue?: number;
      }[];
    };
  }[];
}

/** India jobs on one Ashby board. */
export async function ashbyBoard(slug: string): Promise<RawJob[]> {
  const data = await getJson<AshbyResponse>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)]
        .filter(Boolean)
        .join(", ");
      const country = j.address?.postalAddress?.addressCountry ?? "";
      const pay = j.compensation?.summaryComponents?.find(
        (c) => c.compensationType === "Salary" && c.currencyCode?.toUpperCase() === "INR",
      );
      return {
        india: isIndiaLocation(`${location} ${country}`),
        job: {
          source: "ashby",
          externalId: `${slug}:${j.id}`,
          title: j.title.trim(),
          company: prettyName(slug),
          location,
          isRemote: Boolean(j.isRemote),
          url: j.jobUrl,
          companyUrl: j.jobUrl,
          description: (j.descriptionPlain ?? "").trim(),
          postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
          salary: pay
            ? { min: amountToLpa(pay.minValue, periodOf(pay.interval)), max: amountToLpa(pay.maxValue, periodOf(pay.interval)) }
            : undefined,
        } satisfies RawJob,
      };
    })
    .filter((x) => x.india)
    .map((x) => x.job);
}

export const ashby: JobSource = {
  id: "ashby",
  label: "Career pages — Ashby",
  scope: "user",
  configured: (prefs) => slugsFor(prefs, "ashby").length > 0,
  fetch: ({ prefs }) => eachBoard(slugsFor(prefs, "ashby"), ashbyBoard),
};
