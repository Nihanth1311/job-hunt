import type { Category, Preferences, Profile } from "../types";
import { profileSkills } from "./analyze";
import { categorize } from "./classify";
import { experienceLabel, isInternship, parseExperience, scanExperience } from "./experience";
import { isLatex } from "./latex";
import { extractSkills } from "./skills";

// How a recruiter and an ATS would rate one resume for one job, without an AI model. Built on
// how screening software is described as working:
//  - required skills weigh more than "nice to have" ones, and missing most of them is a knockout;
//  - a skill used in a job counts more than one only listed under Skills (it's proven), and
//    recent jobs count more than old ones;
//  - years of experience are their own check, read from the dates on the resume, and years in
//    *relevant* roles count most;
//  - recruiters also look for the same kind of role, numbers in the bullets, a readable layout
//    and the degree when one is asked for.
// Salary plays no part: most postings don't state it.
// Pure, so the job page scores while you paste and the server scores saved resumes the same way.

export const WEIGHTS = { skills: 45, experience: 20, role: 10, impact: 10, format: 10, education: 5 } as const;
type Part = keyof typeof WEIGHTS;

export interface ResumeScore {
  /** 0-100, or null when the posting names no skills we know (nothing to check against). */
  score: number | null;
  /** Points per part, out of WEIGHTS[part]. */
  parts: Record<Part, number>;
  /** A knockout that capped the score, e.g. "Missing most required skills". */
  cappedBy: string | null;
  skills: {
    /** Asked for as a must-have (or in the title, or again and again). */
    required: SkillCheck[];
    /** Everything else the posting mentions. */
    other: SkillCheck[];
  };
  experience: {
    /** What the posting asks for, e.g. "3+ yrs"; "" when it doesn't say. */
    asked: string;
    /** Years worked, read from the dates on the resume (internships count half). */
    years: number;
    /** Years in roles that use this job's skills or are the same kind of role. */
    relevantYears: number;
    /** True when the resume has no dates and Profile's figure was used. */
    fromProfile: boolean;
  };
  /** Tips a recruiter would give, most useful first. */
  notes: string[];
}

export interface SkillCheck {
  name: string;
  /** Where the resume shows it: used in recent work, older work, a project, only listed, or not at all. */
  shown: "recent" | "work" | "project" | "listed" | "no";
  /** Not written as such, but implied by this skill on the resume (PostgreSQL → SQL). */
  via?: string;
  /** In your Profile skills (so you can honestly add it). */
  known: boolean;
}

/** Skills a recruiter takes as given from another one: using PostgreSQL means you know SQL. */
const IMPLIES: Record<string, string[]> = {
  SQL: ["PostgreSQL", "MySQL"],
  Python: ["Django", "FastAPI", "Pandas", "NumPy", "Scikit-learn", "TensorFlow", "PyTorch"],
  JavaScript: ["TypeScript", "React", "Next.js", "Angular", "Vue", "Node.js", "Express", "NestJS"],
  React: ["Next.js", "React Native"],
  "Node.js": ["Express", "NestJS"],
  Java: ["Spring Boot"],
  "REST APIs": ["Django", "FastAPI", "Express", "Spring Boot", "NestJS"],
  Docker: ["Kubernetes"],
  Kubernetes: ["Helm"],
  "CI/CD": ["Jenkins", "GitHub Actions", "ArgoCD"],
  "Machine Learning": ["Scikit-learn", "TensorFlow", "PyTorch", "XGBoost", "Deep Learning"],
  "Deep Learning": ["TensorFlow", "PyTorch"],
};

// ---------- The job ----------

const REQUIRED_HEAD = /\b(requirements?|required|must[\s-]?haves?|minimum qualifications|basic qualifications|qualifications|what you('ll)? need|you (will )?have|who you are|what we('re| are) looking for|skills (and|&) experience)\b/i;
const PREFERRED_HEAD = /\b(preferred|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|bonus|plus points|desired|desirable|additional qualifications|it'?s a plus)\b/i;
const OTHER_HEAD = /\b(about (us|the (company|team))|benefits|perks|what we offer|why join|equal opportunity|our culture)\b/i;
const PREFERRED_LINE = /\b(preferred|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|bonus|a plus|is a plus|added advantage|desirable|familiarity)\b/i;
const REQUIRED_LINE = /\b(must|required|mandatory|strong|expert|proficien\w*|hands[\s-]on|solid|deep)\b/i;

/** Each skill the job asks for, how much it matters (1 preferred … 3 required), and whether it's a must-have. */
function jobSkills(title: string, description: string): { name: string; weight: number; required: boolean }[] {
  const found = new Map<string, { weight: number; count: number; required: boolean }>();
  const add = (names: string[], weight: number, required: boolean) => {
    for (const name of names) {
      const s = found.get(name) ?? { weight: 0, count: 0, required: false };
      found.set(name, { weight: Math.max(s.weight, weight), count: s.count + 1, required: s.required || required });
    }
  };
  add(extractSkills(title), 3, true);

  let mode: "required" | "preferred" | "normal" | "other" = "normal";
  for (const raw of description.split(/\n|(?<=[.;])\s+(?=[A-Z])/)) {
    const line = raw.trim();
    if (!line) continue;
    const isHeading = line.length < 70 && !/[.]$/.test(line) && extractSkills(line).length === 0;
    if (isHeading) {
      if (PREFERRED_HEAD.test(line)) mode = "preferred";
      else if (REQUIRED_HEAD.test(line)) mode = "required";
      else if (OTHER_HEAD.test(line)) mode = "other";
      else if (/:$/.test(line)) mode = "normal";
      continue;
    }
    const skills = extractSkills(line);
    if (!skills.length) continue;
    if (PREFERRED_LINE.test(line) || mode === "preferred") add(skills, 1, false);
    else if (mode === "required" || REQUIRED_LINE.test(line)) add(skills, 3, true);
    else add(skills, mode === "other" ? 1 : 2, false);
  }
  // Said again and again means it matters, even without a "requirements" heading.
  return [...found].map(([name, s]) => ({
    name,
    weight: s.weight * (1 + 0.15 * Math.min(s.count - 1, 3)),
    required: s.required || (s.count >= 3 && s.weight >= 2),
  }));
}

// ---------- The resume ----------

type SectionKind = "experience" | "projects" | "skills" | "education" | "summary" | "other";
interface Section {
  kind: SectionKind;
  text: string;
}

const SECTION_KINDS: [SectionKind, RegExp][] = [
  ["experience", /experience|employment|work history|career|internships?/i],
  ["projects", /projects?|portfolio|open source|publications?|achievements?|certifications?|awards?/i],
  ["skills", /skills|technolog|tools|tech stack|competenc/i],
  ["education", /education|academic|qualification/i],
  ["summary", /summary|profile|objective|about/i],
];
const kindOf = (heading: string): SectionKind => SECTION_KINDS.find(([, re]) => re.test(heading))?.[0] ?? "other";

/** The resume split into its sections (Experience, Projects, Skills…), as plain text. */
function sections(content: string): Section[] {
  if (isLatex(content)) {
    const body = latexBody(content);
    const parts = body.split(/\\section\*?\{([^}]*)\}/);
    const out: Section[] = [{ kind: "summary", text: plain(parts[0]) }];
    for (let i = 1; i < parts.length; i += 2) out.push({ kind: kindOf(parts[i]), text: plain(parts[i + 1] ?? "") });
    return out;
  }
  // Plain text (an uploaded PDF): a short line that is a known heading starts a section.
  const out: Section[] = [{ kind: "summary", text: "" }];
  for (const line of content.split("\n")) {
    const t = line.trim();
    const heading = t.length > 2 && t.length < 40 && !/[.,]$/.test(t) && SECTION_KINDS.some(([, re]) => re.test(t)) && t.split(/\s+/).length <= 4;
    if (heading) out.push({ kind: kindOf(t), text: "" });
    else out[out.length - 1].text += `${line}\n`;
  }
  return out;
}

function latexBody(content: string): string {
  const start = content.indexOf("\\begin{document}");
  const end = content.lastIndexOf("\\end{document}");
  return content
    .slice(start >= 0 ? start + "\\begin{document}".length : 0, end >= 0 ? end : undefined)
    .replace(/(^|[^\\])%.*$/gm, "$1"); // comments (Claude's report lines name skills that may not be in the resume)
}

/** LaTeX → the words a reader sees. Bullets become "• " lines; arguments are kept, commands dropped. */
function plain(tex: string): string {
  return tex
    .replace(/\\(resumeItem|item)\b\s*/g, "\n• ")
    .replace(/\\href\{[^}]*\}/g, " ")
    .replace(/\\\\/g, "\n")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}[\]$]/g, " ")
    .replace(/\\([&%$#_])/g, "$1")
    .replace(/[ \t]+/g, " ");
}

/** The words a reader (or an ATS) actually sees. */
export function resumeText(content: string): string {
  return isLatex(content) ? plain(latexBody(content)) : content;
}

// ---------- Dates → years of experience ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`;
const POINT = String.raw`(?:${MONTH}\s*'?\d{2,4}|\d{1,2}[/.-]\d{4}|\d{4})`;
const END = String.raw`(?:${POINT}|present|current|now|till date|to date|ongoing)`;
const RANGE = new RegExp(String.raw`(${POINT})\s*(?:-{1,3}|–|—|to|until)\s*(${END})`, "gi");

/** Months since year 0, from "Jan 2023", "01/2023", "2023" (start: January, end: December), "Present". */
function toMonth(s: string, isEnd: boolean, now: Date): number | null {
  const t = s.toLowerCase().trim();
  if (/present|current|now|till|to date|ongoing/.test(t)) return now.getFullYear() * 12 + now.getMonth();
  const m = t.match(/^([a-z]+)\.?\s*'?(\d{2,4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3));
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return month < 0 ? null : year * 12 + month;
  }
  const n = t.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (n) return Number(n[2]) * 12 + Number(n[1]) - 1;
  const y = t.match(/^(\d{4})$/);
  if (y) return Number(y[1]) * 12 + (isEnd ? 11 : 0);
  return null;
}

interface Job {
  start: number;
  end: number;
  text: string;
  intern: boolean;
}

/** Each job in the Experience section: its dates and what's written under it. Newest first. */
function jobsIn(experience: string, now: Date): Job[] {
  const hits = [...experience.matchAll(RANGE)];
  const jobs: Job[] = [];
  hits.forEach((m, i) => {
    const start = toMonth(m[1], false, now);
    const end = toMonth(m[2], true, now);
    if (start === null || end === null || end < start || end - start > 600) return;
    // A job's text: from the line before its dates (company / title) to the next job's dates.
    const from = experience.lastIndexOf("\n", Math.max(0, (m.index ?? 0) - 2));
    const to = hits[i + 1]?.index ?? experience.length;
    const text = experience.slice(Math.max(0, from), to);
    jobs.push({ start, end, text, intern: /\bintern(ship)?\b|\btrainee\b|\bapprentice/i.test(text.split("•")[0]) });
  });
  return jobs.sort((a, b) => b.end - a.end || b.start - a.start);
}

/** Total months covered by these jobs, counting overlapping months once; internships count half. */
function months(jobs: Job[]): number {
  const covered = new Map<number, number>();
  for (const j of jobs) for (let m = j.start; m <= j.end; m++) covered.set(m, Math.max(covered.get(m) ?? 0, j.intern ? 0.5 : 1));
  return [...covered.values()].reduce((a, b) => a + b, 0);
}

// ---------- Scoring ----------

const RELATED: Partial<Record<Category, Category[]>> = {
  fullstack: ["frontend", "backend", "sde"],
  frontend: ["fullstack", "sde"],
  backend: ["fullstack", "sde", "devops", "data"],
  sde: ["fullstack", "frontend", "backend"],
  devops: ["backend", "security"],
  data: ["backend"],
  security: ["devops"],
};
const SHOWN_CREDIT = { recent: 1, work: 0.9, project: 0.8, listed: 0.45, no: 0 } as const;
const VERB =
  /^(built|designed|developed|led|launched|shipped|created|implemented|improved|reduced|increased|optimi[sz]ed|automated|migrated|architected|owned|scaled|deployed|delivered|cut|drove|integrated|refactored|wrote|engineered|introduced|streamlined|mentored|managed|analy[sz]ed|trained|researched|secured|maintained|resolved|debugged)\b/i;
const NUMBER = /\d+(\.\d+)?\s*(%|x\b|k\b|m\b|\+|ms\b|users|customers|requests|rps|qps|hours|hrs|days|weeks|lakh|crore|million)|[$₹]\s*\d|\b\d{2,}\b/i;

export function scoreResume(
  job: { title: string; description: string },
  resume: string,
  profile: Profile,
  prefs: Preferences,
  now = new Date(),
): ResumeScore {
  void prefs; // the same signature as job matching; this score doesn't depend on your search settings
  const secs = sections(resume);
  const all = secs.map((s) => s.text).join("\n");
  const of = (kind: SectionKind) =>
    secs
      .filter((s) => s.kind === kind)
      .map((s) => s.text)
      .join("\n");
  const experienceText = of("experience");
  const jobs = jobsIn(experienceText, now);
  const known = new Set(profileSkills(profile).map((s) => s.toLowerCase()));
  const has = (text: string) => new Set(extractSkills(text).map((s) => s.toLowerCase()));
  /** The skill on the resume that implies `name` in this set of skills, if any. */
  const impliedBy = (name: string, set: Set<string>) => IMPLIES[name]?.find((x) => set.has(x.toLowerCase()));
  const inRecent = has(jobs[0]?.text ?? "");
  const inWork = has(experienceText);
  const inProjects = has(`${of("projects")}\n${of("summary")}`);
  const anywhere = has(all);

  // Skills: weighted by importance, credited by how well the resume proves them.
  const wanted = jobSkills(job.title, job.description);
  const levels: [SkillCheck["shown"], Set<string>][] = [
    ["recent", inRecent],
    ["work", inWork],
    ["project", inProjects],
    ["listed", anywhere],
  ];
  const check = (name: string): SkillCheck => {
    const k = name.toLowerCase();
    for (const [shown, set] of levels) if (set.has(k)) return { name, shown, known: known.has(k) };
    // Not written, but implied by something that is (credited a little less: exact-match ATS miss it).
    for (const [shown, set] of levels) {
      const via = impliedBy(name, set);
      if (via) return { name, shown, via, known: known.has(k) };
    }
    return { name, shown: "no", known: known.has(k) };
  };
  const checks = wanted.map((w) => ({ ...w, ...check(w.name) }));
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  const credit = (c: SkillCheck) => SHOWN_CREDIT[c.shown] * (c.via ? 0.85 : 1);
  const skillFit = totalWeight ? checks.reduce((a, c) => a + c.weight * credit(c), 0) / totalWeight : 0;
  const required = checks.filter((c) => c.required);
  const requiredMissing = required.filter((c) => c.shown === "no");

  // Experience: years from the resume's own dates; relevant = jobs that use this job's skills or are the same kind of role.
  const jobCategory = categorize(job.title, job.description);
  const wantedSet = new Set(wanted.map((w) => w.name.toLowerCase()));
  const relevant = jobs.filter((j) => {
    const used = [...has(j.text)].filter((s) => wantedSet.has(s)).length;
    return used >= 2 || (jobCategory !== "other" && categorize(j.text.split("•")[0], j.text) === jobCategory);
  });
  const fromProfile = jobs.length === 0;
  const years = fromProfile ? profile.yearsExperience : months(jobs) / 12;
  const relevantYears = fromProfile ? profile.yearsExperience : months(relevant) / 12;
  // The title's guess ("Senior" → 4+) or what the description states, whichever asks for more.
  const fromTitle = parseExperience(job.title, job.description);
  const stated = scanExperience(job.description);
  const asked = stated.min !== null && (fromTitle.min === null || stated.min > fromTitle.min) ? stated : fromTitle;
  const need = isInternship(asked) ? 0 : asked.min;
  // Relevant years count fully, other years count a third.
  const effective = Math.min(years, relevantYears + (years - relevantYears) / 3);
  const expFit =
    need === null ? 0.85 : need === 0 ? 1 : effective >= need ? 1 : Math.max(0.15, 0.25 + 0.75 * (effective / need));

  // Role: is this resume the same kind of role as the job?
  const latestTitle = jobs[0]?.text.split("•")[0] ?? "";
  const resumeCategory = categorize(`${latestTitle}\n${of("summary").slice(0, 300)}`, all);
  const roleFit =
    jobCategory === "other" || resumeCategory === jobCategory ? 1 : RELATED[jobCategory]?.includes(resumeCategory) ? 0.7 : 0.35;

  // Impact: bullets with numbers and strong verbs.
  const bullets = `${experienceText}\n${of("projects")}`
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("•") || l.startsWith("-") || l.startsWith("*"))
    .map((l) => l.replace(/^[•*-]\s*/, ""))
    .filter((l) => l.length > 15);
  const withNumbers = bullets.filter((b) => NUMBER.test(b.replace(RANGE, ""))).length;
  const withVerbs = bullets.filter((b) => VERB.test(b)).length;
  const impactFit = bullets.length ? 0.7 * Math.min(1, withNumbers / bullets.length / 0.5) + 0.3 * Math.min(1, withVerbs / bullets.length / 0.7) : 0.2;

  // ATS-readable: the basics a parser needs to find.
  const words = all.split(/\s+/).filter(Boolean).length;
  const formatChecks = [
    { ok: /[\w.+-]+@[\w-]+\.[\w.]+/.test(resume), tip: "Add your email" },
    { ok: /(\+?\d[\d\s-]{8,}\d)/.test(all), tip: "Add your phone number" },
    { ok: secs.some((s) => s.kind === "experience") || secs.some((s) => s.kind === "projects"), tip: "Use a heading named Experience (or Projects)" },
    { ok: secs.some((s) => s.kind === "skills"), tip: "Add a Skills section, so the ATS can find your skills" },
    { ok: secs.some((s) => s.kind === "education"), tip: "Add an Education section" },
    { ok: words >= 250 && words <= 1100, tip: words < 250 ? "It's very short; add detail to your bullets" : "It's long; aim for one page or two" },
  ];
  const formatFit = formatChecks.filter((c) => c.ok).length / formatChecks.length;

  // Education: only matters if the job asks for a degree.
  const wantsDegree = /\b(bachelor'?s?|b\.?\s?tech|b\.?e\.?\b|degree|graduat\w*|master'?s?|m\.?\s?tech|ph\.?d)\b/i.test(job.description);
  const hasDegree = /\b(bachelor'?s?|b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|bca|mca|master'?s?|m\.?\s?tech|m\.?\s?sc|ph\.?d|degree)\b/i.test(all);
  const eduFit = !wantsDegree ? 1 : hasDegree ? 1 : 0;

  const parts: Record<Part, number> = {
    skills: WEIGHTS.skills * skillFit,
    experience: WEIGHTS.experience * expFit,
    role: WEIGHTS.role * roleFit,
    impact: WEIGHTS.impact * impactFit,
    format: WEIGHTS.format * formatFit,
    education: WEIGHTS.education * eduFit,
  };
  let score = Object.values(parts).reduce((a, b) => a + b, 0);

  // Knockouts: what an ATS filter or a recruiter's first glance rejects outright. Either one caps
  // the score at 45 (a good layout can't make up for it); both at 30.
  const knockouts = [
    required.length >= 2 && requiredMissing.length / required.length > 0.5 && "Missing most of the must-have skills",
    need !== null && need > 0 && effective < need / 2 && "Far less experience than the job asks for",
  ].filter((k): k is string => Boolean(k));
  const cappedBy = knockouts.length ? knockouts.join("; ") : null;
  if (knockouts.length) score = Math.min(score, knockouts.length === 2 ? 30 : 45);

  // Tips, most useful first.
  const notes: string[] = [];
  const addable = requiredMissing.filter((c) => c.known).map((c) => c.name);
  if (addable.length) notes.push(`Must-haves you know but didn't mention: ${addable.join(", ")}`);
  const onlyListed = checks.filter((c) => c.shown === "listed" && c.required).map((c) => c.name);
  if (onlyListed.length) notes.push(`Only in your Skills list, show them in a job or project bullet: ${onlyListed.join(", ")}`);
  const implied = checks.filter((c) => c.via && c.required).map((c) => `${c.name} (you wrote ${c.via})`);
  if (implied.length) notes.push(`Write these words exactly too, older ATS only match exact words: ${implied.join(", ")}`);
  const gaps = requiredMissing.filter((c) => !c.known).map((c) => c.name);
  if (gaps.length) notes.push(`Must-haves not in your Profile at all: ${gaps.join(", ")}`);
  if (bullets.length && withNumbers / bullets.length < 0.4)
    notes.push(`Only ${withNumbers} of ${bullets.length} bullets have numbers. Add results (%, users, time saved).`);
  for (const c of formatChecks) if (!c.ok) notes.push(c.tip);
  if (wantsDegree && !hasDegree) notes.push("The job asks for a degree and the resume doesn't show one");

  return {
    score: wanted.length ? Math.round(score) : null,
    parts,
    cappedBy,
    skills: {
      required: checks.filter((c) => c.required).map(({ name, shown, via, known: k }) => ({ name, shown, via, known: k })),
      other: checks.filter((c) => !c.required).map(({ name, shown, via, known: k }) => ({ name, shown, via, known: k })),
    },
    experience: { asked: need === null ? "" : experienceLabel(asked), years: round1(years), relevantYears: round1(relevantYears), fromProfile },
    notes,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreTone(score: number): "good" | "warn" | "bad" {
  return score >= 75 ? "good" : score >= 55 ? "warn" : "bad";
}
