import type { Category, SalaryBucket, SkillGroup, Track } from "../types";
import { extractSkills, skillGroup } from "./skills";

// ---------- Category ----------

const TITLE_RULES: [Category, RegExp][] = [
  ["devops", /\b(dev\s?ops|devsecops|sre|site reliability|platform engineer|cloud (engineer|ops|infrastructure)|infrastructure engineer|build (and|&) release|release engineer|kubernetes|systems? engineer)\b/i],
  ["fullstack", /\b(full[\s-]?stack|mern|mean stack)\b/i],
  ["frontend", /\b(front[\s-]?end|ui (developer|engineer)|react(\.?js)? (developer|engineer)|angular (developer|engineer)|vue(\.?js)? (developer|engineer)|web developer)\b/i],
  ["backend", /\b(back[\s-]?end|server[\s-]side|api (developer|engineer)|node(\.?js)? (developer|engineer)|java (developer|engineer)|python (developer|engineer)|golang|go (developer|engineer)|\.net (developer|engineer)|php (developer|engineer)|django|spring boot)\b/i],
  ["sde", /\b(software (development )?(engineer|developer)|sde|swe|associate engineer|programmer|application developer|member of technical staff|mts|graduate engineer|engineer trainee|product engineer)\b/i],
];

// Roles that aren't software development, even when the description mentions tech
// (e.g. a database company's sales job lists "MongoDB" ten times).
const NON_DEV_TITLE =
  /\b(sales|account (executive|manager|director|development)|business development|representative|recruit(er|ing|ment)|talent|coordinator|marketing|finance|financial|accountant|accounts? (payable|receivable)|legal|counsel|human resources|hr|people (partner|operations)|payroll|customer (success|support|service|experience)|support specialist|operations (manager|executive|associate|analyst)|content|copywriter|designer|partnerships?|alliances?|procurement|audit|compliance|tax|treasury|executive assistant|investor|strategy|brand|public relations|merchandis\w*|category manager|supply chain|logistics|warehouse|driver|store|collections|underwriter|credit|risk analyst|business analyst|program manager|project manager|product manager|scrum master|evaluator|translator|annotator|trainer|teacher|instructor|faculty|tutor|mentor)\b/i;
const DEV_WORD = /\b(engineer|engineering|developer|sde|swe|programmer|devops|sre)\b/i;
const PRESALES_ENGINEER = /\b(sales|solutions?|pre-?sales|customer success|support|field|partner) engineer/i;

// Native mobile, data/ML and embedded roles: real engineering, but outside the web
// Frontend / Backend / Full Stack / DevOps tracks this app matches you to.
const OTHER_ENGINEERING = /\b(ios|android|swift|kotlin|flutter|xamarin|mobile (developer|engineer)|data (scientist|analyst|engineer)|machine learning|ml engineer|ai\/ml|embedded|firmware|vlsi|sap|salesforce|mainframe)\b/i;

export function categorize(title: string, description: string): Category {
  if (NON_DEV_TITLE.test(title) && (!DEV_WORD.test(title) || PRESALES_ENGINEER.test(title))) return "other";
  if (OTHER_ENGINEERING.test(title) && !/\b(full[\s-]?stack|react native|backend|front[\s-]?end|devops)\b/i.test(title)) return "other";
  for (const [cat, re] of TITLE_RULES) if (re.test(title)) return cat;

  // Title didn't say; look at what the description emphasises.
  const counts = groupCounts(extractSkills(description));
  const fe = counts.frontend, be = counts.backend, ops = counts.devops;
  if (fe + be + ops < 3) return "other";
  if (ops >= 3 && ops > fe && ops > be) return "devops";
  if (fe >= 2 && be >= 2) return "fullstack";
  if (fe > be) return "frontend";
  if (be > fe) return "backend";
  return "sde";
}

function groupCounts(skills: string[]): Record<SkillGroup, number> {
  const c: Record<SkillGroup, number> = { frontend: 0, backend: 0, devops: 0, other: 0 };
  for (const s of skills) c[skillGroup(s)]++;
  return c;
}

/** Which of your four resumes this job should get. */
export function pickTrack(category: Category, jobSkills: string[]): Track {
  if (category === "frontend" || category === "backend" || category === "devops" || category === "fullstack") {
    return category;
  }
  const c = groupCounts(jobSkills);
  if (c.devops > c.frontend && c.devops > c.backend) return "devops";
  if (c.frontend >= 2 && c.backend >= 2) return "fullstack";
  if (c.backend > c.frontend) return "backend";
  if (c.frontend > c.backend) return "frontend";
  return "fullstack";
}

// ---------- Experience (see experience.ts) ----------

export {
  experienceFits,
  experienceLabel,
  isInternship,
  parseExperience,
  scanExperience,
  type Experience,
  type FoundExperience,
} from "./experience";

// ---------- Salary (all figures in LPA = lakhs per annum, INR) ----------

export interface Salary {
  min: number | null;
  max: number | null;
}

const CUR = String.raw`(?:₹|(?<![a-z])rs\.?|(?<![a-z])inr)?\s*`;

/** Pull a salary out of free text like "₹10-15 LPA", "12 Lacs P.A.", "INR 85,000/month". */
export function parseSalaryText(text: string): Salary | null {
  const t = text.toLowerCase().replace(/ /g, " ");

  // 10 - 15 LPA / 10L-15L / 10 to 15 lakhs
  let m = t.match(new RegExp(`${CUR}(\\d{1,3}(?:\\.\\d+)?)\\s*(?:l|lpa|lakhs?|lacs?)?\\s*(?:-|–|to)\\s*${CUR}(\\d{1,3}(?:\\.\\d+)?)\\s*(?:lpa|lakhs?|lacs?|l)\\b`));
  if (m) return range(+m[1], +m[2]);

  // up to 12 LPA
  m = t.match(new RegExp(`(?:up\\s?to|upto|max(?:imum)?)\\s*${CUR}(\\d{1,3}(?:\\.\\d+)?)\\s*(?:lpa|lakhs?|lacs?)\\b`));
  if (m) return range(null, +m[1]);

  // 12 LPA
  m = t.match(new RegExp(`${CUR}(\\d{1,3}(?:\\.\\d+)?)\\s*(?:lpa|lakhs? per annum|lacs? p\\.?a\\.?|lakhs? p\\.?a\\.?)`));
  if (m) return range(+m[1], +m[1]);

  // ₹12,00,000 - ₹16,00,000 [per annum|/month]
  m = t.match(/(?:₹|(?<![a-z])rs\.?|(?<![a-z])inr)\s*([\d,]{5,})(?:\s*(?:-|–|to)\s*(?:₹|rs\.?|inr)?\s*([\d,]{5,}))?\s*(\/\s*(?:month|mo|year|yr|annum)|per\s+(?:month|annum|year)|p\.?\s?m\.?|p\.?\s?a\.?|monthly|annually)?/);
  if (m) {
    const lo = +m[1].replace(/,/g, "");
    const hi = m[2] ? +m[2].replace(/,/g, "") : lo;
    const period = m[3] ?? "";
    const monthly = /month|mo\b|p\.?\s?m/.test(period) || (!period && hi < 300000);
    const k = monthly ? 12 : 1;
    return range((lo * k) / 1e5, (hi * k) / 1e5);
  }
  return null;
}

function range(min: number | null, max: number | null): Salary | null {
  const ok = (n: number | null) => n === null || (n >= 1 && n <= 300);
  if (!ok(min) || !ok(max)) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { min: round1(min), max: round1(max) };
}

/** Convert a structured amount from an API to LPA. */
export function amountToLpa(amount: number | null | undefined, period: string | null | undefined): number | null {
  if (!amount || !Number.isFinite(amount)) return null;
  const p = (period ?? "year").toLowerCase();
  const yearly = p.startsWith("hour") ? amount * 2080 : p.startsWith("month") ? amount * 12 : amount;
  const lpa = yearly / 1e5;
  return lpa >= 1 && lpa <= 300 ? round1(lpa) : null;
}

export function salaryBucket(s: Salary | null, floor: number): SalaryBucket {
  if (!s || (s.min === null && s.max === null)) return "unknown";
  if (s.min !== null && s.min >= floor) return "meets";
  // "up to X" or a range that crosses your floor: worth a look, negotiate.
  if ((s.max ?? s.min!) >= floor) return "possible";
  return "below";
}

export function mentionsCtc(text: string): boolean {
  return /\b(ctc|variable pay|variable component|performance bonus|incentives?)\b/i.test(text);
}

export function salaryLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return "";
  if (min === null) return `up to ₹${max} LPA`;
  if (max === null || min === max) return `₹${min} LPA`;
  return `₹${min}–${max} LPA`;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}
