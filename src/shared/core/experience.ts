// How much experience a posting asks for, read the way a person would: every mention is
// collected with its sentence, things that aren't about you (company age, education, bonds,
// contract length) are dropped, and the strongest requirement wins.

export interface Experience {
  min: number | null;
  max: number | null;
}

/** Experience plus the sentence it came from, so the app can show its working. */
export interface FoundExperience extends Experience {
  quote?: string;
}

const NONE: FoundExperience = { min: null, max: null };

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
};
const WORD_LIST = Object.keys(WORDS).join("|");
// "3", "2.5", "12.00", "five", "three (3)"
const NUM = String.raw`(\d{1,2}(?:\.\d+)?|${WORD_LIST})(?:\s*\(\d{1,2}\))?`;
const UNIT = String.raw`(years?|yrs?|months?)(?:\(s\))?'?`;
const RANGE = new RegExp(String.raw`(?<![\w.])${NUM}\s*\+?\s*(?:${UNIT}\s*)?(-|–|—|~|to|and|or|\s)\s*${NUM}\s*\+?\s*${UNIT}`, "g");
const SINGLE = new RegExp(String.raw`(?<![\w.])${NUM}\s*(\+|-?\s*plus)?\s*${UNIT}(\s*\+)?`, "g");
const HAS_NUMBER = new RegExp(String.raw`\d|\b(${WORD_LIST})\b`);

/** "Experience: 2-5 Years", "Exp - 3+", "Years of experience: 4", "Work Experience: 1 to 3 yrs" */
const LABEL =
  /^[\s•*-]*(?:total |relevant |work |overall |minimum |min\.? |required )?(?:experience|exp\.?|yoe|years of experience)(?: required| level| range| \(in years\)| \(years\))?\s*[:\-–]\s*/;
const LABEL_VALUE = new RegExp(
  String.raw`^(?:minimum |min\.? |at least )?${NUM}\s*\+?\s*(?:${UNIT}\s*)?(?:(?:-|–|to)\s*${NUM}\s*\+?\s*(?:${UNIT})?)?`,
);

const EXP_WORD = /\b(experience|exp|experienced|background|track record|worked|working in|hands-on)\b/;
const REQUIRED_WORD = /\b(minimum|min|at least|atleast|required|must|mandatory|need|needs|should have|looking for|seeking|eligib\w*)\b/;
const PREFERRED_WORD = /\b(preferred|preferably|nice to have|good to have|a plus|bonus|ideally|desirable|advantage|advantageous|would be great)\b/;
const CANDIDATE_WORD = /\b(you|your|you'll|you've|candidates?|applicants?|must|should|required|requirements?|minimum|at least|looking for|seeking|hiring|need|ideal|eligib\w*)\b/;
// The company talking about itself: "We have 30 years of experience", "Acme has 15 years in…".
const COMPANY_TALK = /\b(we|we've|we're|our|founded|established|in business|legacy|history|journey|has been|has (over|more than|nearly)|has \d)\b/;

// Right before a number: "over the last 2 years", "for nearly 30 years", "completed 12 months".
const NOT_EXP_BEFORE =
  /\b(aged?|age of|over the (last|past)|in the (last|past)|for (nearly|over|almost|more than|about|the (last|past))|nearly|almost|since|last|past|completed|every|within|initial|first|period of|duration( of)?|span of|education|qualification)\s*:?\s*$/;
// Right after: "years old", "two years in a row", "15 years full time education", "2 years bond".
const NOT_EXP_AFTER =
  /^\s*(old\b|of age|in a row|ago\b|warranty|bond|service agreement|contract\b|tenure|probation|notice|(of )?(full[- ]time )?(degree|course|program|programme|education|schooling)\b|of (rich |proven )?(history|legacy|existence|excellence|operations|innovation)\b)/;
// Months only count as experience when the sentence is about experience, not contract length or onboarding.
const MONTHS_NOT_EXP = /\b(duration|contract|bond|probation|notice|internship|training|tenure|initial|first)\b/;

const PREFERRED_HEAD = /\b(preferred|nice to have|good to have|bonus|desired|desirable|added advantage|plus points?)\b/;
const REQUIRED_HEAD =
  /\b(requirements?|qualifications?|must haves?|what you('ll)? (need|bring)|who you are|what we('re| are) looking for|eligibility|skills|about you|you have|you bring|basic|minimum)\b/;
const OTHER_HEAD =
  /^(about (?!(the )?(job|role|position|opportunity|team|you)\b).+|who we are|(our )?benefits\b.*|perks\b.*|what we offer\b.*|why join\b.*|our (story|culture|values|mission)\b.*|life at\b.*)$/;

const FRESHER = /\b(freshers?|entry[\s-]level|new grads?|recent (college )?graduates?|no (prior |previous )?experience (is )?(required|needed|necessary))\b/;
const FRESHER_NEGATED =
  /\b(no|not|non|don't|do not|isn't|aren't|need not|cannot|can't)\b[^.]{0,25}\b(freshers?|entry[\s-]level)\b|\bfreshers?\b[^.]{0,20}\b(need not|not eligible|cannot|can't|don't|do not|should not|will not)\b/;

type Section = "required" | "preferred" | "other" | null;

interface Mention extends FoundExperience {
  strength: number;
  at: number;
}

/** What the text asks for; nulls when it doesn't say. */
export function scanExperience(text: string): FoundExperience {
  if (!text.trim()) return NONE;
  const mentions: Mention[] = [];
  let section: Section = null;
  let at = 0;

  for (const line of text.replace(/[’‘`´]/g, "'").split(/\n+/)) {
    const head = headingOf(line);
    if (head !== null) {
      section = PREFERRED_HEAD.test(head) ? "preferred" : REQUIRED_HEAD.test(head) ? "required" : OTHER_HEAD.test(head) ? "other" : null;
      continue;
    }
    for (const sentence of line.split(/(?<=[.!?;|])\s+/)) {
      at++;
      for (const m of sentenceMentions(sentence, section)) mentions.push({ ...m, at });
    }
  }

  if (mentions.length) {
    const best = mentions.reduce((a, b) => (b.strength > a.strength || (b.strength === a.strength && b.at < a.at) ? b : a));
    return { min: best.min, max: best.max, quote: best.quote };
  }

  // No numbers anywhere: "freshers welcome" or "entry-level" still answers the question.
  for (const sentence of text.split(/\n+|(?<=[.!?;])\s+/)) {
    const s = sentence.toLowerCase();
    const at = s.search(FRESHER);
    if (at >= 0 && !FRESHER_NEGATED.test(s)) return { min: 0, max: 1, quote: quoteOf(sentence, at, at + 10) };
  }
  return NONE;
}

/** A short line that names a section ("Preferred Qualifications:", "About Acme"), or null. */
function headingOf(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 60 || HAS_NUMBER.test(t.toLowerCase()) || /^[•*·-]/.test(t) || /[.,;]$/.test(t)) return null;
  if (t.split(/\s+/).length > 7) return null;
  return t.toLowerCase().replace(/[:#*-]/g, " ").replace(/\s+/g, " ").trim();
}

function sentenceMentions(sentence: string, section: Section): Omit<Mention, "at">[] {
  const s = sentence.toLowerCase();
  if (!HAS_NUMBER.test(s)) return [];

  // A labelled field is the posting's own answer.
  const label = s.match(LABEL);
  if (label) {
    const v = s.slice(label[0].length).match(LABEL_VALUE);
    if (v) {
      const lo = toYears(num(v[1]), v[2] ?? v[4]);
      const hi = v[3] !== undefined ? toYears(num(v[3]), v[4] ?? v[2]) : null;
      const exp = sane(lo, hi, v[0], true);
      // "0.00-0.00 Years" is a blank form field, not "no experience needed".
      return exp && !(exp.min === 0 && exp.max === 0) ? [{ ...exp, quote: quoteOf(sentence), strength: 4 }] : [];
    }
  }

  const out: Omit<Mention, "at">[] = [];
  const taken: [number, number][] = [];
  const aboutThem = section !== "required" && COMPANY_TALK.test(s) && !CANDIDATE_WORD.test(s);

  const consider = (start: number, end: number, lo: number | null, hi: number | null, months: boolean, open: boolean, raw: string) => {
    const before = s.slice(Math.max(0, start - 40), start);
    if (NOT_EXP_BEFORE.test(before) || NOT_EXP_AFTER.test(s.slice(end, end + 40))) return;
    if (months && (!EXP_WORD.test(s) || MONTHS_NOT_EXP.test(before))) return;
    if (aboutThem || (section === "other" && !CANDIDATE_WORD.test(s))) return;

    const near = s.slice(Math.max(0, start - 60), end + 60);
    const isRange = hi !== null;
    const hasExpWord = EXP_WORD.test(near);
    const required = REQUIRED_WORD.test(near);
    // A bare "3 years" (no +, range or experience word) is usually about something else.
    if (!isRange && !open && !hasExpWord && !required) return;

    const upTo = /\b(up to|upto|maximum|max\.?|less than|under|below)\s*(of\s*)?$/.test(before);
    const exp = upTo ? sane(0, lo, raw) : sane(lo, hi, raw);
    if (!exp || (exp.min === 0 && exp.max === 0)) return;
    if (!isRange && !upTo && exp.min === 0) exp.max = 1; // "0 years", "6 months": fresher
    // "With 15 years of experience, Acme leads…": a big plain number outside the requirements is rarely about you.
    if (exp.min! >= 10 && !isRange && !open && section !== "required" && !CANDIDATE_WORD.test(s)) return;

    // "5+ years preferred" / "Ideally 3 years…", but not "Good to have: Angular. Minimum 5 years…".
    const clauseBefore = before.split(/[:;,()]|\b(?:minimum|required|must)\b/).pop() ?? "";
    const preferred = PREFERRED_WORD.test(clauseBefore) || PREFERRED_WORD.test(s.slice(end, end + 50).split(/[:;]/)[0]);

    let strength = hasExpWord ? 2 : 1;
    if (required) strength = 3;
    if (section === "preferred" || preferred) strength = 0;
    out.push({ ...exp, quote: quoteOf(sentence, start, end), strength });
  };

  for (const m of s.matchAll(RANGE)) {
    const [raw, a, unitA, sep, b, unitB] = m;
    const start = m.index!;
    // "3 5 years" (a board stripped the dash) only when it reads as a real range.
    if (sep.trim() === "" && !(/^\d+$/.test(a) && /^\d+$/.test(b) && +a < +b)) continue;
    if (sep === "and" && !/between\s*$/.test(s.slice(Math.max(0, start - 12), start))) continue;
    const lo = toYears(num(a), unitA ?? unitB);
    const hi = toYears(num(b), unitB);
    if (lo === null || hi === null || lo > hi) continue;
    taken.push([start, start + raw.length]);
    consider(start, start + raw.length, lo, hi, /^mo/.test(unitB), false, raw);
  }
  for (const m of s.matchAll(SINGLE)) {
    const [raw, a, plusBefore, unit, plusAfter] = m;
    const start = m.index!;
    if (taken.some(([x, y]) => start < y && start + raw.length > x)) continue;
    const after = s.slice(start + raw.length, start + raw.length + 25);
    const open = Boolean(plusBefore || plusAfter) || /^\s*(or more|and above|or above|& above|and more|or higher|plus)\b/.test(after);
    consider(start, start + raw.length, toYears(num(a), unit), null, /^mo/.test(unit), open, raw);
  }
  return out;
}

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  return s in WORDS ? WORDS[s] : Number.parseFloat(s);
}

function toYears(n: number | null, unit: string | undefined): number | null {
  if (n === null || Number.isNaN(n)) return null;
  return unit && /^mo/.test(unit) ? n / 12 : n;
}

function sane(min: number | null, max: number | null, raw: string, labelled = false): Experience | null {
  if (min === null) return null;
  // "Experience: 36 years" is 3–6 with the dash stripped, not a 36-year career.
  if (labelled && min > 20 && max === null && /^\d\d\b/.test(raw.trim()) && !/[+.]/.test(raw)) {
    const [a, b] = raw.trim().slice(0, 2).split("").map(Number);
    if (a < b) return { min: a, max: b };
  }
  if (min > 20 || (max !== null && max > 30)) return null;
  return { min: Math.floor(min), max: max === null ? null : Math.ceil(max) };
}

/** The sentence, or for a long one, the words around the mention. */
function quoteOf(sentence: string, start = 0, end = 0): string {
  const MAX = 160;
  if (sentence.length <= MAX) return sentence.replace(/^[\s•*·-]+/, "").replace(/\s+/g, " ").trim();
  let from = Math.max(0, start - 60);
  let to = Math.min(sentence.length, Math.max(end, from) + 100);
  if (from > 0) from = sentence.indexOf(" ", from) + 1 || from;
  if (to < sentence.length) to = sentence.lastIndexOf(" ", to) > from ? sentence.lastIndexOf(" ", to) : to;
  const q = sentence.slice(from, to).replace(/^[\s•*·-]+/, "").replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${q}${to < sentence.length ? "…" : ""}`;
}

const SENIOR_TITLE = /\b(senior|sr\.?|lead|principal|staff|architect|manager|head|director|distinguished|fellow|vp|avp|svp|evp|vice president|chief|cto)\b/i;

/** Experience from the title first ("Senior", "SDE II", "3-5 yrs"), then the description. */
export function parseExperience(title: string, description: string): FoundExperience {
  const fromTitle = scanExperience(title);
  if (fromTitle.min !== null || fromTitle.max !== null) return fromTitle;
  // Internships (min = max = 0) are their own thing, not a full-time 0–2 yr role.
  if (/\b(intern|internship|apprentice)\b/i.test(title)) return { min: 0, max: 0 };
  if (SENIOR_TITLE.test(title)) return { min: 4, max: null };
  if (/\b(sde|swe|engineer|developer)[\s-]*(iii|iv|v|3|4|5)\b/i.test(title)) return { min: 4, max: null };
  if (/\b(sde|swe|engineer|developer)[\s-]*(ii|2)\b/i.test(title)) {
    const d = scanExperience(description);
    return d.min !== null ? d : { min: 2, max: 4 };
  }
  if (/\b(junior|jr\.?|fresher|trainee|graduate|entry[\s-]level|associate|sde[\s-]?(1|i)\b|engineer (1|i)\b)\b/i.test(title)) {
    const d = scanExperience(description);
    return d.min !== null ? d : { min: 0, max: 2 };
  }
  return scanExperience(description);
}

export const isInternship = (exp: { min: number | null; max: number | null }) => exp.min === 0 && exp.max === 0;

/** Is this role open to someone with `maxYears` of experience? Unknown counts as yes. */
export function experienceFits(exp: Experience, maxYears: number): boolean {
  if (isInternship(exp)) return false;
  if (exp.min === null) return true;
  return exp.min <= maxYears;
}

export function experienceLabel(exp: { min: number | null; max: number | null }): string {
  if (exp.min === null && exp.max === null) return "";
  if (isInternship(exp)) return "Internship";
  if (exp.min === 0 && (exp.max ?? 0) <= 1) return "Fresher";
  if (exp.max === null) return `${exp.min}+ yrs`;
  if (exp.min === exp.max) return `${exp.min} yrs`;
  return `${exp.min}–${exp.max} yrs`;
}
