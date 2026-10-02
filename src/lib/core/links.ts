// Telling a company's own job posting apart from a job board's copy of it.

/** Where a job came from, for badges. */
export const SOURCE_LABEL: Record<string, string> = {
  adzuna: "Adzuna",
  jsearch: "Google Jobs",
  greenhouse: "Company careers page",
  lever: "Company careers page",
  ashby: "Company careers page",
  workday: "Company careers page",
  amazon: "Company careers page",
  google: "Company careers page",
  oracle: "Company careers page",
  eightfold: "Company careers page",
  smartrecruiters: "Company careers page",
  manual: "Added by you",
};

/** Sources that read the employer's own careers site, so the posting date is the company's own. */
export const CAREER_SOURCES = new Set(["greenhouse", "lever", "ashby", "workday", "amazon", "google", "oracle", "eightfold", "smartrecruiters"]);

/** "Amazon careers site", "LinkedIn via Google Jobs", "Added by you"… */
export function sourceLabel(job: { source: string; company: string; publisher?: string | null }): string {
  if (job.publisher) return `${job.publisher} via Google Jobs`;
  if (CAREER_SOURCES.has(job.source)) return `${job.company} careers site`;
  return SOURCE_LABEL[job.source] ?? job.source;
}

// Job boards and aggregators: they repost jobs, so they're never "the company site".
const JOB_BOARDS =
  /(^|\.)(linkedin\.com|naukri\.com|indeed\.(com|co\.in)|glassdoor\.(com|co\.in)|foundit\.in|monsterindia\.com|shine\.com|timesjobs\.com|instahyre\.com|cutshort\.io|wellfound\.com|angel\.co|iimjobs\.com|hirist\.(com|tech)|adzuna\.(in|com)|apna\.co|ziprecruiter\.com|simplyhired\.com|talent\.com|jooble\.org|jobgether\.com|bebee\.com|careerjet\.(co\.in|com)|freshersworld\.com|internshala\.com|jobrapido\.com|whatjobs\.com|learn4good\.com|recruit\.net|workindia\.in|quikr\.com|expertini\.com|google\.com|jobsora\.com|trabajo\.org|jobleads\.com|ladders\.com|dice\.com|builtin\.com|themuse\.com|snaphunt\.com|weekday\.works|uplers\.com|turing\.com)$/i;

// Hiring systems companies run their own careers pages on.
const COMPANY_ATS =
  /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com|workable\.com|icims\.com|successfactors\.(com|eu)|taleo\.net|oraclecloud\.com|jobvite\.com|recruitee\.com|breezy\.hr|bamboohr\.com|darwinbox\.in|keka\.com|zohorecruit\.(com|in)|freshteam\.com|personio\.(de|com)|teamtailor\.com|eightfold\.ai|phenompeople\.com|avature\.net|turbohire\.co|rippling\.com|pinpointhq\.com|dover\.com|amazon\.jobs|metacareers\.com|careers\.google\.com|careers\.microsoft\.com)$/i;

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isJobBoard(url: string | null | undefined): boolean {
  const h = hostOf(url);
  return Boolean(h && JOB_BOARDS.test(h));
}

export function isCompanyAts(url: string | null | undefined): boolean {
  const h = hostOf(url);
  return Boolean(h && COMPANY_ATS.test(h));
}

/** Best guess that a link is the employer's own posting: a known hiring system, or any site that isn't a job board. */
export function looksLikeCompanySite(url: string | null | undefined): boolean {
  return Boolean(hostOf(url)) && !isJobBoard(url);
}

/** A short, readable name for where a link goes, e.g. "Workday", "careers.purestorage.com". */
export function siteLabel(url: string | null | undefined): string {
  const h = hostOf(url);
  if (!h) return "";
  const known: [RegExp, string][] = [
    [/greenhouse\.io$/, "Greenhouse"],
    [/lever\.co$/, "Lever"],
    [/ashbyhq\.com$/, "Ashby"],
    [/myworkday(jobs|site)\.com$/, "Workday"],
    [/smartrecruiters\.com$/, "SmartRecruiters"],
    [/workable\.com$/, "Workable"],
    [/icims\.com$/, "iCIMS"],
    [/successfactors\.(com|eu)$/, "SuccessFactors"],
    [/taleo\.net$/, "Taleo"],
    [/oraclecloud\.com$/, "Oracle"],
    [/darwinbox\.in$/, "Darwinbox"],
  ];
  return known.find(([re]) => re.test(h))?.[1] ?? h.replace(/^www\./, "");
}


/** A Google search for the company, role and pay, to size up a job at a glance. */
export function researchUrl(job: { company: string; title: string }): string {
  const q = [job.company.trim(), job.title.trim(), "salary"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
