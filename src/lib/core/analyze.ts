import type { Category, Preferences, Profile, SalaryBucket, Track } from "../types";
import {
  categorize,
  experienceFits,
  experienceLabel,
  isInternship,
  mentionsCtc,
  parseExperience,
  parseSalaryText,
  pickTrack,
  salaryBucket,
  salaryLabel,
  type Experience,
  type Salary,
} from "./classify";
import { canonicalize, extractSkills } from "./skills";
import { normKey } from "./text";

/** What every source adapter hands back, before analysis. */
export interface RawJob {
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  isRemote?: boolean;
  url: string;
  /** The same job on the employer's own careers site, when the source tells us. */
  companyUrl?: string | null;
  description: string;
  /** The source only gave the start of the description. */
  descriptionIsPreview?: boolean;
  postedAt: Date | null;
  /** Structured salary from the API, already in LPA. */
  salary?: Salary & { estimated?: boolean };
  publisher?: string | null;
  /** Experience the source itself reported, in months (0 = no experience needed). */
  requiredExpMonths?: number | null;
  /** The built-in company it came from (company careers sites only). */
  companyId?: string;
}

export type FitVerdict = "fit" | "check" | "no";

export interface Fit {
  verdict: FitVerdict;
  /** Short reasons; the first is the headline. */
  reasons: string[];
}

export interface Analysis {
  category: Category;
  track: Track;
  experience: Experience;
  expFit: boolean;
  salary: Salary | null;
  salaryEstimated: boolean;
  salaryBucket: SalaryBucket;
  mentionsCtc: boolean;
  skills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  score: number;
  fit: Fit;
}

export function profileSkills(profile: Profile): string[] {
  return canonicalize([
    ...profile.skills.frontend,
    ...profile.skills.backend,
    ...profile.skills.devops,
    ...(profile.skills.data ?? []),
    ...(profile.skills.security ?? []),
    ...profile.skills.other,
  ]);
}

/** Pure function: used by the background fetcher and live in the browser. */
export function analyzeJob(
  input: {
    title: string;
    description: string;
    salary?: RawJob["salary"];
    descriptionIsPreview?: boolean;
    requiredExpMonths?: number | null;
  },
  profile: Profile,
  prefs: Preferences,
): Analysis {
  const text = `${input.title}\n${input.description}`;
  const skills = extractSkills(text);
  const parsed = parseExperience(input.title, input.description);
  const experience = withSourceExperience(parsed, input.requiredExpMonths);
  // Tech internships get their own category ("Frontend Intern" → Internship); the role type
  // still picks which base resume fits. Non-tech internships stay "other".
  const roleCategory = categorize(input.title, input.description);
  const category: Category = roleCategory !== "other" && isInternship(experience) ? "internship" : roleCategory;
  const track = pickTrack(roleCategory, skills);
  // Where the experience figure came from: written in the posting, guessed from the title, or reported by the source.
  const expSource: ExpSource =
    parsed.min === null
      ? experience.min === null
        ? null
        : "source"
      : parseExperience("", text).min !== null
        ? "stated"
        : "title";
  const expFit = experienceFits(experience, prefs.maxExperience);

  const structured = input.salary && (input.salary.min !== null || input.salary.max !== null) ? input.salary : null;
  const salary = structured ?? parseSalaryText(text);
  const bucket = salaryBucket(salary, prefs.salaryFloorLpa);

  const mine = new Set(profileSkills(profile).map((s) => s.toLowerCase()));
  const matchedSkills = skills.filter((s) => mine.has(s.toLowerCase()));
  const missingSkills = skills.filter((s) => !mine.has(s.toLowerCase()));

  // Smoothed toward 50% so a job mentioning just one skill can't score a perfect match.
  const skillFit = mine.size === 0 ? 0.5 : (matchedSkills.length + 1) / (skills.length + 2);
  const expScore = experience.min === null ? 0.8 : expFit ? 1 : 0;
  const salaryScore = { meets: 1, possible: 0.8, unknown: 0.6, below: 0.1 }[bucket];
  const categoryScore = category === "other" ? 0.2 : 1;
  const raw = Math.round(100 * (0.55 * skillFit + 0.25 * expScore + 0.1 * salaryScore + 0.1 * categoryScore));
  // No skills on the profile yet (e.g. someone who just signed up): nothing to match against, so 0.
  // A role you don't qualify for (too senior, internship) is never a strong match.
  const score = mine.size === 0 ? 0 : expFit ? raw : Math.min(raw, 35);

  const fit = judgeFit({
    title: input.title,
    category,
    experience,
    expSource,
    salary,
    salaryBucket: bucket,
    skills,
    matchedSkills,
    hasProfileSkills: mine.size > 0,
    descriptionIsPreview: Boolean(input.descriptionIsPreview),
    prefs,
  });

  return {
    category,
    track,
    experience,
    expFit,
    salary,
    salaryEstimated: Boolean(structured?.estimated),
    salaryBucket: bucket,
    mentionsCtc: mentionsCtc(text),
    skills,
    matchedSkills,
    missingSkills,
    score,
    fit,
  };
}

/** When the text doesn't state experience, use what the source reported (e.g. Google Jobs). */
function withSourceExperience(exp: Experience, months: number | null | undefined): Experience {
  if (exp.min !== null || months === null || months === undefined) return exp;
  if (months <= 0) return { min: 0, max: 1 };
  return { min: Math.floor(months / 12), max: null };
}

type ExpSource = "stated" | "title" | "source" | null;

const JUNIOR_TITLE = /\b(junior|jr\.?|fresher|trainee|graduate|entry[\s-]level|associate|sde[\s-]?(1|i)|(engineer|developer)[\s-](1|i))\b/i;

/**
 * Can you apply to this job right now? Only says "fit" when it has actually checked the full
 * requirements: experience (stated, from a junior title, or reported by the source), your skills,
 * and the complete description. Anything it can't confirm is "check", never a silent yes.
 */
export function judgeFit(x: {
  title: string;
  category: Category;
  experience: Experience;
  expSource?: ExpSource;
  salary: Salary | null;
  salaryBucket: SalaryBucket;
  skills: string[];
  matchedSkills: string[];
  hasProfileSkills: boolean;
  descriptionIsPreview: boolean;
  prefs: Preferences;
}): Fit {
  const { prefs } = x;
  const exp = experienceLabel(x.experience);

  // Deal-breakers first.
  if (x.category === "other") return { verdict: "no", reasons: ["Not a software, data or security role"] };
  if (isInternship(x.experience)) return { verdict: "no", reasons: ["Internship, not a full-time role"] };
  // "2027 Campus Hire", "University Graduate 2026": hiring from colleges, for students still studying.
  if (/\bcampus\b|\buniversity (hire|grad(uate)?)\b|\b20\d\d (batch|graduates?|grads?|campus)\b|\b(batch|graduates?|grads?) (of )?20\d\d\b/i.test(x.title)) {
    return { verdict: "no", reasons: ["Campus hiring, for students still in college"] };
  }
  if (x.experience.min !== null && x.experience.min > prefs.maxExperience) {
    const why = x.expSource === "title" ? "Senior-level role" : `Asks ${exp}${x.expSource === "source" ? " (per Google Jobs)" : ""}`;
    return { verdict: "no", reasons: [`${why} (you're targeting up to ${prefs.maxExperience} yrs)`] };
  }
  if (x.salaryBucket === "below" && x.salary) {
    return {
      verdict: "no",
      reasons: [`Pays ${salaryLabel(x.salary.min, x.salary.max)} (below your ₹${prefs.salaryFloorLpa} LPA)`],
    };
  }

  const ok: string[] = [];
  const missing: string[] = [];

  if (x.descriptionIsPreview) missing.push("Only a short preview, so requirements aren't visible");

  if (x.experience.min !== null) {
    const per = x.expSource === "source" ? " (per Google Jobs)" : "";
    if (x.expSource === "title") ok.push(x.experience.min === 0 ? "Junior-level role" : `Title level suggests ${exp}`);
    else ok.push(exp === "Fresher" ? `Open to freshers${per}` : `Asks ${exp}${per}`);
  } else if (JUNIOR_TITLE.test(x.title)) ok.push("Junior-level role");
  else if (!x.descriptionIsPreview) missing.push("Experience isn't mentioned");

  const n = x.skills.length;
  const m = x.matchedSkills.length;
  if (!x.hasProfileSkills) missing.push("Add your skills in Profile to check skills");
  else if (n === 0) {
    if (!x.descriptionIsPreview) missing.push("No familiar skills mentioned");
  } else if (m >= 3 || m / n >= 0.5) ok.push(`${m} of ${n} skills match`);
  else missing.push(`Only ${m} of ${n} skills match`);

  if (missing.length) return { verdict: "check", reasons: [...missing, ...ok] };
  return { verdict: "fit", reasons: [...ok, "Full description checked"] };
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  gurgaon: "gurugram",
  bombay: "mumbai",
  madras: "chennai",
  "new delhi": "delhi",
  trivandrum: "thiruvananthapuram",
};

const INDIA_RE =
  /\b(india|bengaluru|bangalore|hyderabad|pune|chennai|mumbai|gurugram|gurgaon|noida|delhi|kolkata|ahmedabad|kochi|cochin|jaipur|chandigarh|indore|coimbatore|thiruvananthapuram|trivandrum|mysore|mysuru|visakhapatnam|vizag|bhubaneswar|nagpur|lucknow|karnataka|telangana|maharashtra|tamil nadu|kerala|haryana)\b/i;

export function isIndiaLocation(location: string): boolean {
  return INDIA_RE.test(location);
}

export function normCity(location: string): string {
  const first = location.toLowerCase().split(/[,/|(]/)[0].trim();
  return CITY_ALIASES[first] ?? first;
}

export function dedupeKey(job: Pick<RawJob, "company" | "title" | "location">): string {
  return `${normKey(job.company)}|${normKey(job.title)}|${normKey(normCity(job.location))}`;
}
