// Autofill: the rules both sides share. The site uses them to decide which jobs can be
// autofilled and to describe the answers bank; the laptop helper (helper/) uses them to
// decide what goes in each field of a real application form. Pure logic: no database, no browser.

import { isJobBoard } from "./core/links";
import type { Profile } from "./types";

// ---------- Which forms ----------

/**
 * greenhouse, lever, ashby: one-page forms, filled in one go.
 * workday: an account per company; you sign in, then it fills page after page up to Review.
 * site: any other company careers site; you move through it, each form page is filled as it appears.
 */
export const AUTOFILL_PLATFORMS = ["greenhouse", "lever", "ashby", "workday", "site"] as const;
export type AutofillPlatform = (typeof AUTOFILL_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<AutofillPlatform, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  site: "company careers site",
};

/** Forms the helper moves through page by page. */
export const MULTI_PAGE: AutofillPlatform[] = ["workday", "site"];

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
 * Workday postings are opened as they are (the helper presses Apply). Any other company site
 * works in guided mode. Job boards (LinkedIn, Naukri, Indeed…) never: their terms forbid it.
 */
export function applyTarget(job: { id: string; url: string; companyUrl: string | null }): { platform: AutofillPlatform; url: string } | null {
  const fromId = job.id.match(/(?:^|:)(greenhouse|lever|ashby):([^:]+):([^:]+)$/);
  if (fromId) {
    const platform = fromId[1] as AutofillPlatform;
    return { platform, url: applyUrlFor(platform, fromId[2], fromId[3]) };
  }
  const links = [job.companyUrl, job.url].filter((l): l is string => !!l && /^https?:\/\//i.test(l));
  for (const link of links) {
    const found = boardFromUrl(link);
    if (found) return found;
  }
  const workday = links.find((l) => /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/i.test(hostname(l)));
  if (workday) return { platform: "workday", url: workday };
  const site = links.find((l) => !isJobBoard(l));
  return site ? { platform: "site", url: site } : null;
}

const hostname = (link: string) => {
  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return "";
  }
};

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
  /** Which part of Profile → Application answers it sits in. */
  group: AnswerGroup;
  placeholder?: string;
  /** Shown as a dropdown when set. */
  options?: string[];
  /** The usual answer, used until you change it (shown pre-selected on the Profile page). */
  default?: string;
  /** A date, kept as YYYY-MM-DD and written in whatever format each form wants. */
  type?: "date";
  hint?: string;
}

export const ANSWER_GROUPS = ["About you", "Usual yes/no questions", "Work", "Education", "Address", "Diversity (optional)"] as const;
export type AnswerGroup = (typeof ANSWER_GROUPS)[number];

const YES_NO = ["Yes", "No"];
const NO_YES = ["No", "Yes"];
const DECLINE = "Prefer not to say";

/** Questions application forms ask again and again. Your contact details come from About you. */
export const ANSWER_FIELDS: AnswerField[] = [
  { key: "dob", label: "Date of birth", group: "About you", type: "date" },
  { key: "nationality", label: "Nationality", group: "About you", default: "Indian" },
  { key: "howHeard", label: "How you heard about jobs", group: "About you", default: "Company careers site", hint: "Matched to each form's wording, e.g. “Barclays Careers Website”." },

  { key: "workAuthorization", label: "Authorised to work in India?", group: "Usual yes/no questions", options: YES_NO, default: "Yes" },
  { key: "needsSponsorship", label: "Need visa sponsorship?", group: "Usual yes/no questions", options: NO_YES, default: "No" },
  { key: "workedHereBefore", label: "Worked at the company you're applying to before?", group: "Usual yes/no questions", options: NO_YES, default: "No", hint: "If you have worked at one, Remember a different answer for that company when it asks." },
  { key: "appliedBefore", label: "Applied to the same company before?", group: "Usual yes/no questions", options: NO_YES, default: "No" },
  { key: "relativesHere", label: "Relatives or family working at the company?", group: "Usual yes/no questions", options: NO_YES, default: "No" },
  { key: "boundByAgreement", label: "Bound by a non-compete or employment agreement?", group: "Usual yes/no questions", options: NO_YES, default: "No" },
  { key: "governmentOfficial", label: "A government official, or related to one?", group: "Usual yes/no questions", options: NO_YES, default: "No" },
  { key: "criminalRecord", label: "Any criminal conviction?", group: "Usual yes/no questions", options: NO_YES, default: "No" },
  { key: "backgroundCheck", label: "OK with a background check?", group: "Usual yes/no questions", options: YES_NO, default: "Yes" },
  { key: "willingToRelocate", label: "Willing to relocate?", group: "Usual yes/no questions", options: YES_NO },
  { key: "openToOffice", label: "OK with hybrid or in-office work?", group: "Usual yes/no questions", options: YES_NO },
  { key: "openToShifts", label: "OK with shifts (night or rotational)?", group: "Usual yes/no questions", options: YES_NO },

  { key: "currentCompany", label: "Current company", group: "Work", hint: "Empty if you're not working now." },
  { key: "currentTitle", label: "Current job title", group: "Work" },
  { key: "noticePeriod", label: "Notice period", group: "Work", placeholder: "Immediate, 30 days, 60 days…" },
  { key: "earliestStart", label: "Earliest start date", group: "Work", placeholder: "Immediately, or 1 March 2027" },
  { key: "currentCtc", label: "Current CTC (LPA)", group: "Work", placeholder: "8", hint: "Left blank, salary questions are asked each time." },
  { key: "expectedCtc", label: "Expected CTC (LPA)", group: "Work", placeholder: "12" },

  { key: "college", label: "College or university", group: "Education" },
  { key: "degree", label: "Degree", group: "Education", placeholder: "B.Tech" },
  { key: "discipline", label: "Branch or major", group: "Education", placeholder: "Computer Science" },
  { key: "cgpa", label: "CGPA", group: "Education", placeholder: "8.4" },
  { key: "graduation", label: "Graduation (month and year)", group: "Education", placeholder: "May 2023" },
  { key: "twelfth", label: "Class 12 percentage", group: "Education", placeholder: "92%" },
  { key: "tenth", label: "Class 10 percentage", group: "Education", placeholder: "95%" },

  { key: "addressLine1", label: "Street address", group: "Address", placeholder: "Flat, street, area", hint: "Workday forms ask for an address." },
  { key: "postalCode", label: "PIN code", group: "Address", placeholder: "500081" },
  { key: "state", label: "State", group: "Address", placeholder: "Telangana" },

  { key: "gender", label: "Gender", group: "Diversity (optional)", options: ["Male", "Female", "Non-binary", DECLINE] },
  { key: "disability", label: "Disability", group: "Diversity (optional)", options: ["No", "Yes", DECLINE] },
];

const DEFAULTS: Record<string, string> = Object.fromEntries(ANSWER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default!]));

/** Your answer to one of the questions above: what you saved, else the usual answer. */
export const answerOf = (fields: AnswerFields, key: string): string => fields[key]?.trim() || DEFAULTS[key] || "";

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

export type FieldKind = "text" | "textarea" | "number" | "date" | "select" | "radio" | "checkbox" | "combobox" | "file";

/** A question found on the form that the helper couldn't answer. */
export interface AutofillQuestion {
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: string[];
  /** Agreements and consent: always yours to answer, and never remembered. */
  agreement?: boolean;
  /** Something to do yourself in Chrome (attach a file, fill a work-history entry). */
  manual?: boolean;
}

export interface AutofillReport {
  filled?: { label: string; value: string }[];
  questions?: AutofillQuestion[];
  notes?: string[];
  /** The resume file put on the form. */
  resume?: string;
  /** Multi-page forms: the page it's on, and the pages done so far. */
  step?: string;
  pages?: string[];
  at?: string;
}

/**
 * waiting: the helper waits for you in Chrome (sign in, press Apply, move to the next page).
 * needs_you: questions on the site only you can answer. review: filled; check it and submit.
 */
export const RUN_STATUSES = ["queued", "filling", "waiting", "needs_you", "answered", "review", "submitted", "error", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
/** The helper still has work to do on these. */
export const ACTIVE_RUN: RunStatus[] = ["queued", "filling", "waiting", "needs_you", "answered", "review"];

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
    const v = answerOf(c.fields, key);
    if (!v) return null;
    return /ctc/i.test(key) && /^\d+(\.\d+)?$/.test(v) ? `${v} LPA` : v;
  },
  from: "bank",
});
const SKIPPED = (re: RegExp): Rule => ({ re, pick: () => SKIP, from: "bank" });

/** "Are you 18 or older?": yes when your date of birth says so, or when it isn't saved. */
function adult(dob: string): string {
  const born = Date.parse(dob);
  if (Number.isNaN(born)) return "Yes";
  return Date.now() - born >= 18 * 365.25 * 86_400_000 ? "Yes" : "No";
}

/** Agreements, consent and attestations: never answered for you. */
const AGREEMENT = /\b(i agree|agree to|consent|acknowledge|certify|attest|i understand|terms (and|&) conditions|privacy (policy|notice)|declare that|confirm that)\b/;

/** First match wins. Patterns run on normQuestion(label). */
const RULES: Rule[] = [
  // Never filled: hidden traps for bots, and optional fields that are better left empty.
  SKIPPED(/robots only|leave (this|it) (blank|empty)|preferred (first )?name|nickname|middle name|address line 2|\bsuffix\b|local (given|family|first|last) name|phone extension/),
  SKIPPED(/twitter|\bx com\b|instagram|facebook|tiktok/),
  P(/\bfirst name|given name/, "firstName"),
  P(/\blast name|surname|family name/, "lastName"),
  P(/^(full |legal |your )?name$|^name (as|in) |full name|legal name|^your name\b/, "fullName"),
  P(/e ?mail/, "email"),
  P(/country code|phone code|dial code/, "country"),
  P(/device type|phone type/, () => "Mobile"),
  B(/address line 1|street address|^address$|(current|home|residential) address/, "addressLine1"),
  B(/postal|zip|pin ?code/, "postalCode"),
  B(/^(state|province|region)\b|state or province/, "state"),
  P(/phone|mobile|contact number/, "phone"),
  P(/linkedin/, "linkedin"),
  P(/github/, "github"),
  P(/portfolio|personal (website|site)|^website|other website|\bblog\b/, "portfolio"),
  // The usual yes/no questions, worded every way companies word them.
  B(/date of birth|\bdob\b|birth ?date|born on/, "dob"),
  P(/\b18\b.{0,20}(years|older|age)|legal (working )?age|age of majority/, (c) => adult(answerOf(c.fields, "dob"))),
  B(/(previously|ever|before|formerly|in the past|prior).{0,40}(work|employ|consult|intern)|(work|employ|consult).{0,40}(before|previously|in the past)|former (employee|worker|intern)|ex employee|rehire/, "workedHereBefore"),
  B(/(previously|ever|already|before) appl(y|ied)|appl(y|ied) .{0,40}(before|previously|in the past|last \d+ months)/, "appliedBefore"),
  B(/relative|family member|related to (any|an?) |spouse|immediate family|know (anyone|someone) .{0,20}work/, "relativesHere"),
  B(/non ?compete|non ?solicit|restrictive covenant|employment agreements?|post ?employment restriction|bound by/, "boundByAgreement"),
  B(/government (official|employee|entity)|public official|politically exposed|\bpep\b|public office|government owned/, "governmentOfficial"),
  B(/convicted|criminal|felony|pending (criminal )?charges/, "criminalRecord"),
  B(/background (check|verification|screening)|drug (test|screen)/, "backgroundCheck"),
  B(/\bshifts?\b|night shift|rotational/, "openToShifts"),
  P(/currently (employed|working)|are you (currently )?employed/, (c) => (answerOf(c.fields, "currentCompany") ? "Yes" : "No")),
  B(/nationality|citizenship/, "nationality"),
  B(/\b10th\b|class (x|10)\b|\bssc\b|secondary school/, "tenth"),
  B(/\b12th\b|class (xii|12)\b|\bhsc\b|intermediate|higher secondary|pre university|\bpuc\b/, "twelfth"),
  B(/sponsor/, "needsSponsorship"),
  B(/authori[sz]ed to work|legally (eligible|authori[sz]ed|able)|entitled to work|right to work|work permit|eligible to work/, "workAuthorization"),
  B(/relocat/, "willingToRelocate"),
  B(/hybrid|on ?site|in office|in person|days (a|per|each) week|come (in)?to (the|our) office|work(ing)? from (the|our|one of our) offices?/, "openToOffice"),
  B(/notice period/, "noticePeriod"),
  B(/(current|present).{0,20}(ctc|compensation|salary|pay|package)/, "currentCtc"),
  B(/(expected|desired|expectation).{0,20}(ctc|compensation|salary|pay|package)|salary (expectation|requirement)/, "expectedCtc"),
  P(/years of (professional |relevant |work |industry )?experience|how many years|(total|overall|relevant) (work )?experience|experience (in )?years/, "yearsExperience"),
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
  // A long question is mostly background: the rules look at its actual question (the sentence
  // ending in "?", else the last sentence), and only then at the whole text.
  const asks = questionParts(label).map((p) => normQuestion(p, ctx.company)).filter(Boolean);
  const q = asks[0] ?? n;
  if (asks.some((a) => AGREEMENT.test(a))) return { value: null, agreement: true };
  if (learned !== undefined) return { value: learned, from: "learned" };
  if (DECLINE_ONLY.test(q)) return { value: DECLINE, from: "bank" };
  for (const text of [...asks, n]) {
    for (const rule of RULES) {
      if (!rule.re.test(text)) continue;
      const v = rule.pick({ contact: ctx.contact, fields: ctx.bank.fields });
      if (v === SKIP) return { value: null, skip: true };
      return v === null ? { value: null } : { value: v, from: rule.from };
    }
  }
  return { value: null };
}

/**
 * The parts of a long question that actually ask something: the sentence ending in "?" and the
 * last sentence. "We work from our offices… Are you able to commit to that?" → the last one;
 * "Have you worked at Barclays? If you're an employee, apply internally." → the first one.
 */
function questionParts(label: string): string[] {
  if (label.length < 120) return [label];
  const parts = label.split(/(?<=[.?!])\s+/).filter((p) => p.trim());
  const asked = parts.find((p) => p.trim().endsWith("?"));
  return [...new Set([asked, parts[parts.length - 1]].filter((p): p is string => !!p))];
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
  // Same thing, different words: "Company careers site" is "Barclays Careers Website", "Career Site", "Website"…
  for (const group of SAME_THING) {
    if (!group.test(answer)) continue;
    const match = opts.find((o) => group.test(o));
    if (match) return match;
  }
  const scored = opts.map((o) => ({ o, s: similarity(a, simple(o)) })).sort((x, y) => y.s - x.s);
  return scored[0].s >= 0.75 ? scored[0].o : null;
}

/** Answers that forms word differently. Order matters: the more specific groups come first. */
const SAME_THING = [
  /linked ?in/i,
  /naukri/i,
  /indeed/i,
  /glassdoor/i,
  /refer(red|ral)?\b|employee referral/i,
  /career|company (web ?)?site|corporate (web ?)?site|employer (web ?)?site|\bwebsite\b|careers? page|job site/i,
  /job (board|portal|site)|online job/i,
  /campus|university|college/i,
];

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

// ---------- Suggestions from your resume ----------

const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const JOB_WORD = /\b(engineer|developer|analyst|intern|scientist|consultant|manager|associate|architect|designer|lead|administrator|specialist|programmer|sde)\b/i;

/**
 * Best guesses for the Education and Work answers, read from your resume text (plain text or
 * LaTeX). Only suggestions: the Profile page puts them in empty boxes for you to check and save.
 */
export function suggestFromResume(resume: string): Partial<AnswerFields> {
  const text = resume
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ") // LaTeX commands
    .replace(/[{}$\\]/g, " ")
    .replace(/[ \t]+/g, " ");
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Partial<AnswerFields> = {};

  const collegeLine = lines.find((l) => /\b(university|institute|college|iit|nit|iiit|bits|school of)\b/i.test(l) && l.length < 140);
  if (collegeLine) {
    out.college = collegeLine
      .replace(new RegExp(`${MONTH}\\s*\\d{4}.*$`, "i"), "")
      .replace(/\b(19|20)\d{2}\b.*$/, "")
      .replace(/\s*[|,–—-]\s*$/, "")
      .trim();
  }
  const degree = text.match(/\b(b\.?\s?tech|b\.?\s?e\b|bachelor of [a-z]+|bachelor'?s|m\.?\s?tech|master of [a-z]+|master'?s|b\.?\s?sc|m\.?\s?sc|mca|bca|mba|b\.?com)\b/i);
  if (degree) out.degree = degree[0].replace(/\s+/g, " ").trim();
  const branch = text.match(/\b(computer science( and| &)? engineering|computer science|information technology|electronics( and| &)? communication( engineering)?|electrical( and| &)? electronics( engineering)?|electrical engineering|mechanical engineering|civil engineering|data science|artificial intelligence( and| &)? (machine learning|data science))\b/i);
  if (branch) out.discipline = branch[0].replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, "and");
  const gpa = text.match(/\b(?:c?gpa|cpi)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)/i) ?? text.match(/\b(\d\.\d{1,2})\s*\/\s*10\b/);
  if (gpa) out.cgpa = gpa[1];

  // Graduation: the latest month-year (or year) on the college's lines.
  if (collegeLine) {
    const i = lines.indexOf(collegeLine);
    const near = lines.slice(i, i + 3).join(" ");
    const dates = [...near.matchAll(new RegExp(`(${MONTH})\\s*((?:19|20)\\d{2})`, "gi"))];
    const years = [...near.matchAll(/\b((?:19|20)\d{2})\b/g)];
    if (dates.length) {
      const d = dates[dates.length - 1];
      out.graduation = `${d[1].slice(0, 3).replace(/^\w/, (c) => c.toUpperCase())} ${d[d.length - 1]}`;
    } else if (years.length) out.graduation = years[years.length - 1][1];
  }

  // Current job: the line that says "Present" (or the line just before it holds the title or company).
  const nowAt = lines.findIndex((l) => /\b(present|current|till date|to date|now)\b/i.test(l) && /\b(19|20)\d{2}\b/.test(l));
  if (nowAt >= 0) {
    const around = [lines[nowAt], lines[nowAt - 1] ?? "", lines[nowAt + 1] ?? ""];
    const parts = around
      .flatMap((l) => l.split(/\s+[|–—]\s+|\s+-\s+|,\s+|\s+at\s+/i))
      .map((p) => p.replace(new RegExp(`${MONTH}\\s*\\d{4}|\\b(19|20)\\d{2}\\b|present|current|till date|to date`, "gi"), "").replace(/[\s–—-]+$/, "").trim())
      .filter((p) => p.length > 1 && p.length < 70 && !/remote|india|bengaluru|bangalore|hyderabad|pune|chennai|mumbai|delhi|gurgaon|noida/i.test(p));
    const title = parts.find((p) => JOB_WORD.test(p));
    const company = parts.find((p) => p !== title && !JOB_WORD.test(p) && /[A-Za-z]/.test(p));
    if (title) out.currentTitle = title;
    if (company) out.currentCompany = company;
  }
  return out;
}
