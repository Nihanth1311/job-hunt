import "server-only";
import type { RawJob } from "../../core/analyze";
import { htmlToText } from "../../core/text";
import { DETAIL_LIMIT, getJson, inBatches, isRecent, pause, TECH_TITLE, type Reader } from "./shared";

// ---------- Oracle Recruiting Cloud (JPMorgan, Oracle…) ----------

interface OracleReq {
  Id: string;
  Title: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  ShortDescriptionStr?: string;
  ExternalResponsibilitiesStr?: string;
  ExternalQualificationsStr?: string;
  WorkplaceType?: string;
}
interface OracleSearch {
  items?: { TotalJobsCount?: number; requisitionList?: OracleReq[]; locationsFacet?: { Id: string; Name: string }[] }[];
}

interface OracleDetail {
  items?: { ExternalDescriptionStr?: string; ExternalResponsibilitiesStr?: string; ExternalQualificationsStr?: string }[];
}

export const readOracle: Reader = async ({ company, known }) => {
  const [host, site] = company.key.split("|");
  const api = (finder: string) =>
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList,locationsFacet&finder=findReqs;siteNumber=${site},${finder}`;

  // Use the site's own "India" location filter when it has one; otherwise keep jobs whose country is India.
  const facets = await getJson<OracleSearch>(api("facetsList=LOCATIONS,limit=1"));
  const india = facets.items?.[0]?.locationsFacet?.find((l) => /^india$/i.test(l.Name.trim()));

  const found: { r: OracleReq; postedAt: Date }[] = [];
  for (let offset = 0; offset < 250; offset += 25) {
    const data = await getJson<OracleSearch>(
      api(`${india ? `locationId=${india.Id},` : ""}limit=25,offset=${offset},sortBy=POSTING_DATES_DESC`),
    );
    const list = data.items?.[0]?.requisitionList ?? [];
    let reachedOld = false;
    for (const r of list) {
      const postedAt = r.PostedDate ? new Date(`${r.PostedDate}T00:00:00Z`) : null;
      if (!isRecent(postedAt)) {
        reachedOld = true;
        continue;
      }
      if (!india && r.PrimaryLocationCountry !== "IN") continue;
      if (!TECH_TITLE.test(r.Title) || known("oracle", `${company.id}:${r.Id}`)) continue;
      found.push({ r, postedAt });
    }
    if (list.length < 25 || reachedOld) break;
    await pause(300);
  }

  // The list only has a one-line summary; each job's details hold the description and qualifications.
  const results = await inBatches(found.slice(0, DETAIL_LIMIT), 4, async ({ r, postedAt }): Promise<RawJob> => {
    const d = await getJson<OracleDetail>(
      `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${r.Id}%22,siteNumber=${site}`,
    );
    const info = d.items?.[0] ?? {};
    const url = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${r.Id}`;
    return {
      source: "oracle",
      externalId: `${company.id}:${r.Id}`,
      title: r.Title.trim(),
      company: company.name,
      location: r.PrimaryLocation ?? "India",
      isRemote: /remote/i.test(r.WorkplaceType ?? ""),
      url,
      companyUrl: url,
      description: [info.ExternalDescriptionStr ?? r.ShortDescriptionStr, info.ExternalResponsibilitiesStr, info.ExternalQualificationsStr]
        .map((s) => htmlToText(s ?? ""))
        .filter(Boolean)
        .join("\n\n"),
      postedAt,
    };
  });
  return results.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
};

// ---------- Eightfold (Microsoft, Qualcomm…) ----------

interface EightfoldPosition {
  id: number;
  name: string;
  locations?: string[];
  postedTs?: number;
  positionUrl?: string;
  workLocationOption?: string;
  jobDescription?: string;
}

export const readEightfold: Reader = async ({ company, known }) => {
  const [host, domain] = company.key.split("|");
  const positions: EightfoldPosition[] = [];
  for (let start = 0; start < 200; start += 10) {
    const data = await getJson<{ data?: { positions?: EightfoldPosition[] } }>(
      `https://${host}/api/pcsx/search?domain=${domain}&query=&location=India&start=${start}&sort_by=timestamp`,
    );
    const list = data.data?.positions ?? [];
    // These are big employers; an empty first page means the site is throttling us, not "no jobs".
    if (start === 0 && !list.length) throw new Error("site returned no jobs (probably rate-limiting; will retry next run)");
    positions.push(...list);
    if (list.length < 10 || list.some((p) => !isRecent(p.postedTs ? new Date(p.postedTs * 1000) : null))) break;
    await pause(300);
  }

  // The date shown on the company's site is postedTs (creationTs is when the role was opened internally).
  const wanted = positions
    .filter((p) => isRecent(p.postedTs ? new Date(p.postedTs * 1000) : null) && TECH_TITLE.test(p.name))
    .filter((p) => (p.locations ?? []).some((l) => /india/i.test(l)))
    .filter((p) => !known("eightfold", `${company.id}:${p.id}`))
    .slice(0, DETAIL_LIMIT);

  const results = await inBatches(wanted, 3, async (p): Promise<RawJob> => {
    const d = await getJson<{ data?: EightfoldPosition }>(`https://${host}/api/pcsx/position_details?position_id=${p.id}&domain=${domain}&hl=en`);
    const url = `https://${host}${p.positionUrl ?? `/careers/job/${p.id}`}`;
    const location = (p.locations ?? []).join(" · ");
    return {
      source: "eightfold",
      externalId: `${company.id}:${p.id}`,
      title: p.name.trim(),
      company: company.name,
      location,
      isRemote: /remote/i.test(`${p.workLocationOption ?? ""} ${location}`),
      url,
      companyUrl: url,
      description: htmlToText(d.data?.jobDescription ?? ""),
      postedAt: new Date(p.postedTs! * 1000),
    };
  });
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
};

// ---------- SmartRecruiters (Bosch, ServiceNow, Freshworks…) ----------

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
}
interface SrDetail {
  postingUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
}

export const readSmartRecruiters: Reader = async ({ company, known }) => {
  const id = company.key;
  const postings: SrPosting[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const data = await getJson<{ content?: SrPosting[]; totalFound?: number }>(
      `https://api.smartrecruiters.com/v1/companies/${id}/postings?country=in&limit=100&offset=${offset}`,
    );
    const list = data.content ?? [];
    postings.push(...list);
    if (list.length < 100) break;
    await pause(300);
  }

  const wanted = postings
    .filter((p) => isRecent(p.releasedDate ? new Date(p.releasedDate) : null) && TECH_TITLE.test(p.name))
    .sort((a, b) => (b.releasedDate ?? "").localeCompare(a.releasedDate ?? ""))
    .filter((p) => !known("smartrecruiters", `${company.id}:${p.id}`))
    .slice(0, DETAIL_LIMIT);

  const results = await inBatches(wanted, 4, async (p): Promise<RawJob> => {
    const d = await getJson<SrDetail>(`https://api.smartrecruiters.com/v1/companies/${id}/postings/${p.id}`);
    const sections = Object.values(d.jobAd?.sections ?? {})
      .filter((s) => s.text)
      .map((s) => `${s.title ? `${s.title}\n` : ""}${htmlToText(s.text!)}`);
    const url = d.postingUrl ?? `https://jobs.smartrecruiters.com/${id}/${p.id}`;
    return {
      source: "smartrecruiters",
      externalId: `${company.id}:${p.id}`,
      title: p.name.trim(),
      company: company.name,
      location: [p.location?.city, p.location?.region, "India"].filter(Boolean).join(", "),
      isRemote: Boolean(p.location?.remote),
      url,
      companyUrl: url,
      description: sections.join("\n\n"),
      postedAt: new Date(p.releasedDate!),
    };
  });
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
};
