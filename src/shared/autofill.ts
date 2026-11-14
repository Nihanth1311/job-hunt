// Autofill: the rules both sides share. The site uses them to decide which jobs can be
// autofilled and to describe the answers bank; the laptop helper (helper/) uses them to
// decide what goes in each field of a real application form. Pure logic: no database, no browser.

import type { Profile } from "./types";

// ---------- Which forms ----------

export const AUTOFILL_PLATFORMS = ["greenhouse", "lever", "ashby"] as const;
export type AutofillPlatform = (typeof AUTOFILL_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<AutofillPlatform, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

const applyUrlFor = (platform: AutofillPlatform, slug: string, id: string) => {
  const s = encodeURIComponent(slug);
  const i = encodeURIComponent(id);
  if (platform === "greenhouse") return `https://job-boards.greenhouse.io/${s}/jobs/${i}`;
  if (platform === "lever") return `https://jobs.lever.co/${s}/${i}/apply`;
  return `https://jobs.ashbyhq.com/${s}/${i}/application`;
};

/**
 * The application form to open for a job, or null when autofill can't do that site yet.
 * Jobs read from a careers board carry "<platform>:<board>:<id>" at the end of their id, which
 * gives the form even when the posting lives on the company's own domain (stripe.com/jobs/…).
 * Other jobs (added by hand, Google Jobs) work when their link is on one of these boards.
 */
export function applyTarget(job: { id: string; url: string; companyUrl: string | null }): { platform: AutofillPlatform; url: string } | null {
  const fromId = job.id.match(/(?:^|:)(greenhouse|lever|ashby):([^:]+):([^:]+)$/);
  if (fromId) {
    const platform = fromId[1] as AutofillPlatform;
    return { platform, url: applyUrlFor(platform, fromId[2], fromId[3]) };
  }
  for (const link of [job.companyUrl, job.url]) {
    const found = boardFromUrl(link);
    if (found) return found;
  }
  return null;
}

function boardFromUrl(link: string | null | undefined): { platform: AutofillPlatform; url: string } | null {
  if (!link) return null;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const embed = u.searchParams.get("for") && u.searchParams.get("token");
    if (embed) return { platform: "greenhouse", url: applyUrlFor("greenhouse", u.searchParams.get("for")!, u.searchParams.get("token")!) };
    if (parts.length >= 3 && parts[1] === "jobs") return { platform: "greenhouse", url: applyUrlFor("greenhouse", parts[0], parts[2]) };
  }
  if (/(^|\.)lever\.co$/.test(host) && parts.length >= 2) return { platform: "lever", url: applyUrlFor("lever", parts[0], parts[1]) };
  if (host === "jobs.ashbyhq.com" && parts.length >= 2) return { platform: "ashby", url: applyUrlFor("ashby", parts[0], parts[1]) };
  return null;
}

// ---------- Your answers bank ----------

export interface AnswerField {
  key: string;
  label: string;
  placeholder?: string;
  /** Shown as a dropdown when set. */
  options?: string[];
  hint?: string;
}

const YES_NO = ["Yes", "No"];
const DECLINE = "Prefer not to say";

/** Questions application forms ask again and again. Your contact details come from About you. */
export const ANSWER_FIELDS: AnswerField[] = [
  { key: "workAuthorization", label: "Authorised to work in India?", options: YES_NO },
  { key: "needsSponsorship", label: "Need visa sponsorship?", options: ["No", "Yes"] },
  { key: "willingToRelocate", label: "Willing to relocate?", options: YES_NO },
  { key: "openToOffice", label: "OK with hybrid or in-office work?", options: YES_NO },
  { key: "noticePeriod", label: "Notice period", placeholder: "Immediate, 30 days, 60 days…" },
  { key: "earliestStart", label: "Earliest start date", placeholder: "Immediately, or 1 March 2027" },
  { key: "currentCtc", label: "Current CTC (LPA)", placeholder: "8", hint: "Left blank, salary questions are asked each time." },
  { key: "expectedCtc", label: "Expected CTC (LPA)", placeholder: "12" },
  { key: "currentCompany", label: "Current company" },
  { key: "currentTitle", label: "Current job title" },
  { key: "college", label: "College or university" },
  { key: "degree", label: "Degree", placeholder: "B.Tech" },
  { key: "discipline", label: "Branch or major", placeholder: "Computer Science" },
  { key: "cgpa", label: "CGPA", placeholder: "8.4" },
  { key: "graduation", label: "Graduation (month and year)", placeholder: "May 2023" },
  { key: "howHeard", label: "How you heard about the job", placeholder: "Company careers page" },
  { key: "gender", label: "Gender (optional)", options: ["Male", "Female", "Non-binary", DECLINE] },
  { key: "disability", label: "Disability (optional)", options: ["No", "Yes", DECLINE] },
];

export type AnswerKey = string;
export type AnswerFields = Record<AnswerKey, string>;

export interface AnswerBank {
  fields: AnswerFields;
  /** Answers you gave to other questions, keyed by the question in normal form (see normQuestion). */
  learned: Record<string, string>;
  /** The question as the form worded it, for showing (same keys as learned). */
  labels?: Record<string, string>;
}

/** Your contact details as forms ask for them, from Profile → About you. */
export interface Contact {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  yearsExperience: string;
}

export function contactFromProfile(p: Profile): Contact {
  const name = p.name.trim().replace(/\s+/g, " ");
  const words = name ? name.split(" ") : [];
  const links = p.links
    .split(/\s+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`));
  const linkedin = links.find((l) => /linkedin\.com/i.test(l)) ?? "";
  const github = links.find((l) => /github\.com/i.test(l)) ?? "";
  const portfolio = links.find((l) => l !== linkedin && l !== github) ?? "";
  return {
    firstName: words[0] ?? "",
    lastName: words.length > 1 ? words[words.length - 1] : "",
    fullName: name,
    email: p.email.trim(),
    phone: p.phone.trim(),
    city: p.location.split(",")[0]?.trim() ?? "",
    country: "India",
    linkedin,
    github,
    portfolio,
    yearsExperience: p.yearsExperience ? String(p.yearsExperience) : "",
  };
}

// ---------- What the helper reports ----------

export type FieldKind = "text" | "textarea" | "number" | "select" | "radio" | "checkbox" | "combobox" | "file";

/** A question found on the form that the helper couldn't answer. */
export interface AutofillQuestion {
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: string[];
  /** Agreements and consent: always yours to answer, and never remembered. */
  agreement?: boolean;
}

export interface AutofillReport {
  filled?: { label: string; value: string }[];
  questions?: AutofillQuestion[];
  notes?: string[];
  /** The resume file put on the form. */
  resume?: string;
  at?: string;
}

export const RUN_STATUSES = ["queued", "filling", "needs_you", "answered", "review", "submitted", "error", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
/** The helper still has work to do on these. */
export const ACTIVE_RUN: RunStatus[] = ["queued", "filling", "needs_you", "answered", "review"];

/** What the helper gets for one form. */
export interface HelperTask {
  runId: string;
  /** "queued": open and fill the form. "answered": you answered questions; fill those in. */
  status: "queued" | "answered";
  applyUrl: string;
  platform: AutofillPlatform | null;
  job: { title: string; company: string };
  contact: Contact;
  bank: AnswerBank;
  /** Answers for this form only. */
  runAnswers: Record<string, string>;
  resume: { id: string; fileName: string } | null;
}

// ---------- Matching a form's question to an answer ----------

/**
 * A question in a form-independent shape, so an answer given once is found again:
 * "7. Have you worked at Stripe before? *" → "have you worked at {company} before".
 */
export function normQuestion(label: string, company = ""): string {
  let s = label.toLowerCase();
  const co = company.toLowerCase().trim();
  for (const name of new Set([co, co.split(/\s+/)[0]].filter((n) => n.length > 2))) s = s.split(name).join(" {company} ");
  return s
    .replace(/\(required\)|\boptional\b/g, " ")
    .replace(/^\s*\d{1,2}\s*[.)]\s*/, "")
    .replace(/[^a-z0-9{} ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const SKIP = Symbol("skip");
export type Answer = string | typeof SKIP | null;

type Ctx = { contact: Contact; fields: AnswerFields };
type Rule = { re: RegExp; pick: (c: Ctx) => Answer; from: "profile" | "bank" };

/** From About you. */
const P = (re: RegExp, pick: keyof Contact | ((c: Ctx) => string | null)): Rule => ({
  re,
  pick: typeof pick === "function" ? pick : (c) => c.contact[pick] || null,
  from: "profile",
});
/** From the answers bank; salary answers given as a plain number get "LPA". */
const B = (re: RegExp, key: string): Rule => ({
  re,
  pick: (c) => {
    const v = c.fields[key]?.trim();
    if (!v) return null;
    return /ctc/i.test(key) && /^\d+(\.\d+)?$/.test(v) ? `${v} LPA` : v;
  },
  from: "bank",
});
const SKIPPED = (re: RegExp): Rule => ({ re, pick: () => SKIP, from: "bank" });

/** Agreements, consent and attestations: never answered for you. */
const AGREEMENT = /\b(i agree|agree to|consent|acknowledge|certify|attest|i understand|terms (and|&) conditions|privacy (policy|notice)|declare that|confirm that)\b/;

/** First match wins. Patterns run on normQuestion(label). */
const RULES: Rule[] = [
  // Never filled: hidden traps for bots, and optional fields that are better left empty.
  SKIPPED(/robots only|leave (this|it) (blank|empty)|preferred (first )?name|nickname|middle name|address line 2|\bsuffix\b/),
  SKIPPED(/twitter|\bx com\b|instagram|facebook|tiktok/),
  P(/\bfirst name|given name/, "firstName"),
  P(/\blast name|surname|family name/, "lastName"),
  P(/^(full |legal |your )?name$|^name (as|in) |full name|legal name|^your name\b/, "fullName"),
  P(/e ?mail/, "email"),
  P(/country code|phone code|dial code/, "country"),
  P(/phone|mobile|contact number/, "phone"),
  P(/linkedin/, "linkedin"),
  P(/github/, "github"),
  P(/portfolio|personal (website|site)|^website|other website|\bblog\b/, "portfolio"),
  B(/sponsor/, "needsSponsorship"),
  B(/authori[sz]ed to work|legally (eligible|authori[sz]ed|able)|entitled to work|right to work|work permit|eligible to work/, "workAuthorization"),
  B(/relocat/, "willingToRelocate"),
  B(/hybrid|on ?site|in office|in person|days (a|per|each) week|come (in)?to (the|our) office|work(ing)? from (the|our|one of our) offices?/, "openToOffice"),
  B(/notice period/, "noticePeriod"),
  B(/(current|present).{0,20}(ctc|compensation|salary|pay|package)/, "currentCtc"),
  B(/(expected|desired|expectation).{0,20}(ctc|compensation|salary|pay|package)|salary (expectation|requirement)/, "expectedCtc"),
  P(/years of (professional |relevant |work |industry )?experience|how many years/, "yearsExperience"),
  B(/start date|when can you (start|join)|earliest .*(start|join)|available to (start|join)|availability/, "earliestStart"),
  B(/how did you (hear|find|learn)|^source$|where did you (hear|find)|referral source/, "howHeard"),
  B(/current or (previous|most recent) employer|current (company|employer|organi[sz]ation)|(most recent|last) (company|employer)|^company( name)?$|^employer$/, "currentCompany"),
  B(/current or (previous|most recent) (job )?title|current (job )?(title|role|designation)|^title$/, "currentTitle"),
  B(/school|university|college|institution/, "college"),
  B(/\bc?gpa\b|grade point|percentage/, "cgpa"),
  B(/discipline|major|field of study|speciali[sz]ation|branch/, "discipline"),
  B(/degree|qualification/, "degree"),
  B(/graduat/, "graduation"),
  P(/country/, "country"),
  P(/\bcity\b|location|where are you (currently )?(located|based)|where do you (currently )?(live|reside)/, "city"),
  B(/gender|pronoun/, "gender"),
  B(/disabilit/, "disability"),
];

/** US diversity questions (race, veteran, ethnicity): the "decline" option, whatever the form calls it. */
const DECLINE_ONLY = /\brace\b|ethnic|hispanic|latin[oa]|veteran/;
const DECLINE_OPTION = /decline|prefer not|don.?t (wish|want)|do not (wish|want)|not to (say|disclose|answer|identify)|rather not|choose not/i;

export interface Decision {
  value: string | null;
  /** Where the answer came from, shown in the report. */
  from?: "profile" | "bank" | "learned" | "this form";
  skip?: boolean;
  agreement?: boolean;
}

/**
 * The answer for one question, before fitting it to the field's options.
 * Order: what you answered for this form, then what you taught it, then the built-in rules.
 */
export function decide(
  label: string,
  ctx: { contact: Contact; bank: AnswerBank; runAnswers: Record<string, string>; company: string },
): Decision {
  const n = normQuestion(label, ctx.company);
  if (!n) return { value: null, skip: true };
  const own = ctx.runAnswers[n] ?? ctx.runAnswers[label];
  if (own !== undefined) return { value: own, from: "this form" };
  const learned = ctx.bank.learned[n] ?? closest(n, ctx.bank.learned);
  // A long question is mostly background; the rules look only at its last sentence, the actual question.
  const q = normQuestion(lastSentence(label), ctx.company) || n;
  if (AGREEMENT.test(q)) return { value: null, agreement: true };
  if (learned !== undefined) return { value: learned, from: "learned" };
  if (DECLINE_ONLY.test(q)) return { value: DECLINE, from: "bank" };
  for (const rule of RULES) {
    if (!rule.re.test(q)) continue;
    const v = rule.pick({ contact: ctx.contact, fields: ctx.bank.fields });
    if (v === SKIP) return { value: null, skip: true };
    return v === null ? { value: null } : { value: v, from: rule.from };
  }
  return { value: null };
}

/** "We work from our offices on Mondays… Are you able to commit to that?" → "Are you able to commit to that?" */
function lastSentence(label: string): string {
  if (label.length < 120) return label;
  const parts = label.split(/(?<=[.?!])\s+/).filter((p) => p.trim());
  return parts[parts.length - 1] ?? label;
}

/** A remembered question worded a little differently ("…before?" vs "…previously?"). */
function closest(n: string, learned: Record<string, string>): string | undefined {
  let best: string | undefined;
  let score = 0.88;
  for (const [q, a] of Object.entries(learned)) {
    const s = similarity(n, q);
    if (s >= score) {
      score = s;
      best = a;
    }
  }
  return best;
}

/** Dice coefficient on letter pairs: 1 for the same text, near 0 for unrelated text. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const pairs = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let both = 0;
  for (const [p, c] of pa) both += Math.min(c, pb.get(p) ?? 0);
  const total = Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0);
  return total ? (2 * both) / total : 0;
}

const simple = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The option that says the same as your answer, or null when none does (then the question is
 * asked rather than guessed). "Yes" picks "Yes, I am authorised…"; "30 days" picks "Within 30 days".
 */
export function pickOption(answer: string, options: string[]): string | null {
  const opts = options.filter((o) => o.trim() && !/^(select|choose|please select)\b/i.test(o.trim()));
  if (!opts.length) return null;
  const a = simple(answer);
  if (!a) return null;
  const exact = opts.find((o) => simple(o) === a);
  if (exact) return exact;
  if (DECLINE_OPTION.test(answer)) return opts.find((o) => DECLINE_OPTION.test(o)) ?? null;
  const yes = /^(yes|y|true)\b/.test(a);
  const no = /^(no|n|false)\b/.test(a);
  if (yes || no) {
    const word = yes ? /^yes\b/ : /^no\b/;
    return opts.find((o) => word.test(simple(o))) ?? null;
  }
  const starts = opts.find((o) => simple(o).startsWith(a) || a.startsWith(simple(o)));
  if (starts) return starts;
  const inside = opts.filter((o) => simple(o).includes(a) || a.includes(simple(o)));
  if (inside.length === 1) return inside[0];
  // Numbers decide between "0-15 days", "30 days", "60 days": the option holding your number.
  const num = a.match(/\d+(\.\d+)?/)?.[0];
  if (num) {
    const withNum = opts.filter((o) => new RegExp(`(^|[^0-9.])${num.replace(".", "\\.")}([^0-9.]|$)`).test(o));
    if (withNum.length === 1) return withNum[0];
  }
  const scored = opts.map((o) => ({ o, s: similarity(a, simple(o)) })).sort((x, y) => y.s - x.s);
  return scored[0].s >= 0.75 ? scored[0].o : null;
}

/** Questions about this company in particular ("Why Stripe?"): kept for this form, not remembered by default. */
export function isCompanySpecific(label: string, company: string): boolean {
  const n = normQuestion(label, company);
  return n.includes("{company}") || /^why\b|tell us (why|about)|cover letter|what (excites|interests|draws|attracts) you/.test(n);
}

/** One autofill as the job page shows it. */
export interface AutofillRunView {
  id: string;
  status: RunStatus;
  message: string;
  report: AutofillReport;
  resumeId: string | null;
  updatedAt: string;
  /** Changes whenever the run does, so the page can ask "anything new?" cheaply. */
  version: number;
}
