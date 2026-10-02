import "server-only";
import type { RawJob } from "../../core/analyze";
import { htmlToText } from "../../core/text";
import { DETAIL_LIMIT, fromRelative, getJson, inBatches, isRecent, postJson, TECH_TITLE, type Reader } from "./shared";

// Workday careers sites (https://<tenant>.<wdN>.myworkdayjobs.com/<Site>) load their listings
// from a JSON endpoint. The list says "Posted 3 Days Ago"; each job's page has the exact
// start date and the full description.

interface Facet {
  facetParameter: string;
  values?: (Facet & { descriptor?: string; id?: string })[];
}
interface ListResponse {
  total?: number;
  facets?: Facet[];
  jobPostings?: { title: string; externalPath: string; locationsText?: string; postedOn?: string }[];
}
interface DetailResponse {
  jobPostingInfo: {
    id: string;
    title: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    startDate?: string;
    postedOn?: string;
    externalUrl?: string;
    remoteType?: string;
  };
}

const INDIA_PLACE = /india|bengaluru|bangalore|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|delhi|kolkata|ahmedabad|kochi|coimbatore/i;

/**
 * Each company names its location filter differently (locationCountry, Country, locations…).
 * Prefer a country value called "India"; otherwise select every Indian city in a locations facet.
 */
export function indiaFacet(facets: Facet[] | undefined): Record<string, string[]> | null {
  let country: Record<string, string[]> | null = null;
  const cities: Record<string, string[]> = {};
  const walk = (list: Facet[] | undefined) => {
    for (const f of list ?? []) {
      for (const v of f.values ?? []) {
        if (v.values) walk([v]);
        else if (!v.id || !v.descriptor) continue;
        else if (/^india$/i.test(v.descriptor.trim())) country ??= { [f.facetParameter]: [v.id] };
        else if (/^locations?$/i.test(f.facetParameter) && INDIA_PLACE.test(v.descriptor)) (cities[f.facetParameter] ??= []).push(v.id);
      }
    }
  };
  walk(facets);
  return country ?? (Object.keys(cities).length ? cities : null);
}

export const readWorkday: Reader = async ({ company, known }) => {
  const [tenant, wd, site] = company.key.split("|");
  const host = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const api = `${host}/wday/cxs/${tenant}/${site}`;

  const first = await postJson<ListResponse>(`${api}/jobs`, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" });
  const facet = indiaFacet(first.facets);
  if (!facet) throw new Error("this site has no India location filter");

  // Newest first; stop at the first page that reaches "30+ Days Ago".
  const postings: NonNullable<ListResponse["jobPostings"]> = [];
  for (let offset = 0; offset < 100; offset += 20) {
    const page = await postJson<ListResponse>(`${api}/jobs`, { appliedFacets: facet, limit: 20, offset, searchText: "" });
    const list = page.jobPostings ?? [];
    postings.push(...list);
    if (list.length < 20 || list.some((p) => /30\+/.test(p.postedOn ?? ""))) break;
  }

  const wanted = postings
    .filter((p) => !/30\+/.test(p.postedOn ?? "") && TECH_TITLE.test(p.title))
    .filter((p) => !known("workday", `${company.id}:${p.externalPath}`))
    .slice(0, DETAIL_LIMIT);

  const results = await inBatches(wanted, 4, async (p): Promise<RawJob | null> => {
    const d = (await getJson<DetailResponse>(`${api}${p.externalPath}`)).jobPostingInfo;
    const postedAt = d.startDate ? new Date(`${d.startDate}T00:00:00Z`) : fromRelative(d.postedOn ?? p.postedOn);
    if (!isRecent(postedAt)) return null;
    const location = [d.location, ...(d.additionalLocations ?? [])].filter(Boolean).join(" · ");
    const url = d.externalUrl ?? `${host}/en-US/${site}${p.externalPath}`;
    return {
      source: "workday",
      externalId: `${company.id}:${p.externalPath}`,
      title: d.title.trim(),
      company: company.name,
      location,
      isRemote: /remote/i.test(`${d.remoteType ?? ""} ${location}`),
      url,
      companyUrl: url,
      description: htmlToText(d.jobDescription ?? ""),
      postedAt,
    };
  });
  return results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
};
