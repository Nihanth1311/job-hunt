import "server-only";
import type { RawJob } from "../../core/analyze";
import { htmlToText } from "../../core/text";
import { getJson, getText, isRecent, pause, type Reader } from "./shared";

// ---------- Amazon (amazon.jobs) ----------

interface AmazonJob {
  id_icims: string;
  title: string;
  posted_date: string; // "September 30, 2026"
  normalized_location?: string;
  location?: string;
  job_path: string;
  description?: string;
  basic_qualifications?: string;
  preferred_qualifications?: string;
}

/** Software development roles in India, newest first, with Amazon's own posting date and qualifications. */
export const readAmazon: Reader = async ({ company }) => {
  const jobs: RawJob[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const data = await getJson<{ jobs?: AmazonJob[] }>(
      `https://www.amazon.jobs/en/search.json?country=IND&category%5B%5D=software-development&result_limit=100&offset=${offset}&sort=recent`,
    );
    const page = data.jobs ?? [];
    let reachedOld = false;
    for (const j of page) {
      const postedAt = new Date(j.posted_date);
      if (!isRecent(postedAt)) {
        reachedOld = true;
        continue;
      }
      const url = `https://www.amazon.jobs${j.job_path}`;
      jobs.push({
        source: "amazon",
        externalId: j.id_icims,
        title: j.title.trim(),
        company: company.name,
        location: j.normalized_location ?? j.location ?? "India",
        url,
        companyUrl: url,
        description: [
          htmlToText(j.description ?? ""),
          j.basic_qualifications && `Basic qualifications\n${htmlToText(j.basic_qualifications)}`,
          j.preferred_qualifications && `Preferred qualifications\n${htmlToText(j.preferred_qualifications)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        postedAt,
      });
    }
    if (page.length < 100 || reachedOld) break;
    await pause(300);
  }
  return jobs;
};

// ---------- Google (google.com/about/careers) ----------

// The results page carries its jobs as data inside the HTML (AF_initDataCallback "ds:1").
// Each job is an array; the positions below were read off the live page. If Google changes
// them, the reader finds no jobs and the company shows an error in Settings.
// (qualifications holds both the minimum and preferred lists.)
const G = { id: 0, title: 1, responsibilities: 3, qualifications: 4, locations: 9, about: 10, dates: [12, 13, 14] } as const;

type GoogleJob = unknown[];

function googleJobs(html: string): GoogleJob[] {
  for (const m of html.matchAll(/AF_initDataCallback\(\{key: 'ds:\d+'[^]*?data:([^]*?), sideChannel/g)) {
    try {
      const data = JSON.parse(m[1]);
      // The jobs block (not the companies block before it): each row has an id, a title and a job link.
      const row = data?.[0]?.[0];
      if (Array.isArray(row) && /^\d+$/.test(String(row[0])) && /^https:\/\//.test(String(row[2]))) return data[0];
    } catch {}
  }
  return [];
}

const text = (v: unknown) => (Array.isArray(v) && typeof v[1] === "string" ? htmlToText(v[1]) : "");

/** Early- and mid-career roles in India, newest first. */
export const readGoogle: Reader = async ({ company }) => {
  const jobs: RawJob[] = [];
  for (let page = 1; page <= 10; page++) {
    const html = await getText(
      `https://www.google.com/about/careers/applications/jobs/results?location=India&target_level=EARLY&target_level=MID&sort_by=date&page=${page}`,
    );
    const list = googleJobs(html);
    if (!list.length) {
      if (page === 1) throw new Error("couldn't read Google's results page (its layout may have changed)");
      break;
    }
    let reachedOld = false;
    for (const j of list) {
      const stamps = G.dates.map((i) => (Array.isArray(j[i]) ? Number((j[i] as number[])[0]) : NaN)).filter(Number.isFinite);
      const postedAt = stamps.length ? new Date(Math.min(...stamps) * 1000) : null;
      if (!isRecent(postedAt)) {
        reachedOld = true;
        continue;
      }
      const locations = Array.isArray(j[G.locations]) ? (j[G.locations] as unknown[][]).map((l) => String(l[0])) : [];
      const id = String(j[G.id]);
      const url = `https://www.google.com/about/careers/applications/jobs/results/${id}`;
      jobs.push({
        source: "google",
        externalId: id,
        title: String(j[G.title]).trim(),
        company: company.name,
        location: locations.join(" · ") || "India",
        url,
        companyUrl: url,
        description: [
          text(j[G.about]),
          `Responsibilities\n${text(j[G.responsibilities])}`,
          text(j[G.qualifications]),
        ]
          .filter(Boolean)
          .join("\n\n"),
        postedAt,
      });
    }
    if (reachedOld || list.length < 20) break;
    await pause(400);
  }
  return jobs;
};
