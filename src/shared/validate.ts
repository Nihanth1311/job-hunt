// Cleaning what arrives from outside before it is stored. A server action or an import file can
// carry anything, whatever the form on the screen allows, so the server never saves a profile or
// preferences object as it was sent: it rebuilds one from the pieces it recognises, with sane
// types, sizes and ranges. Pure functions, used by the actions, the import route and (for
// preferences) on every read, so a bad value saved before these checks existed can't do harm either.

import { DEFAULT_PREFERENCES, DEFAULT_PROFILE, SKILL_GROUPS, type Preferences, type Profile } from "./types";

/** The only periods the schedule supports: each divides 24, so the fixed fetch times line up every day. */
export const FETCH_INTERVALS = [1, 2, 3, 4, 6, 12, 24] as const;

/** Text of at most `max` characters, without control characters ("" when it isn't text). */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
}

/** A list of non-empty lines of text: at most `maxItems`, each at most `maxLength` characters. */
export function cleanList(v: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = cleanText(item, maxLength).replace(/\s+/g, " ").trim();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** A number between `min` and `max`; `fallback` when it isn't a real number. */
export function cleanNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** An extra career page as Settings takes it: "greenhouse:stripe", "lever:meesho", "ashby:notion". */
const CAREER_PAGE = /^(greenhouse|lever|ashby): ?[a-z0-9][a-z0-9._-]{0,59}$/i;

export function sanitizePreferences(input: unknown): Preferences {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  const hours = Number(p.fetchIntervalHours);
  return {
    salaryFloorLpa: cleanNumber(p.salaryFloorLpa, 0, 300, d.salaryFloorLpa),
    maxExperience: Math.round(cleanNumber(p.maxExperience, 0, 40, d.maxExperience)),
    showUnknownSalary: typeof p.showUnknownSalary === "boolean" ? p.showUnknownSalary : d.showUnknownSalary,
    locations: cleanList(p.locations, 20, 60),
    searchQueries: cleanList(p.searchQueries, 20, 80),
    careerPages: cleanList(p.careerPages, 30, 70).filter((s) => CAREER_PAGE.test(s)),
    skippedCompanies: cleanList(p.skippedCompanies, 300, 40),
    // Anything that isn't one of the supported periods becomes the default: a period of 0 or a
    // fraction of an hour would break the schedule's arithmetic and refetch the pool non-stop.
    fetchIntervalHours: (FETCH_INTERVALS as readonly number[]).includes(hours) ? hours : d.fetchIntervalHours,
    jsearchQueriesPerDay: Math.round(cleanNumber(p.jsearchQueriesPerDay, 0, 10, d.jsearchQueriesPerDay)),
    morningDigest: typeof p.morningDigest === "boolean" ? p.morningDigest : d.morningDigest,
    instantAlertScore: Math.round(cleanNumber(p.instantAlertScore, 0, 100, d.instantAlertScore)),
  };
}

export function sanitizeProfile(input: unknown): Profile {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const skillsIn = (p.skills && typeof p.skills === "object" ? p.skills : {}) as Record<string, unknown>;
  const skills = { ...DEFAULT_PROFILE.skills };
  for (const group of SKILL_GROUPS) skills[group] = cleanList(skillsIn[group], 100, 60);
  const claudeUrl = cleanText(p.claudeUrl, 300).trim();
  return {
    name: cleanText(p.name, 120).trim(),
    email: cleanText(p.email, 200).trim(),
    phone: cleanText(p.phone, 40).trim(),
    location: cleanText(p.location, 120).trim(),
    links: cleanText(p.links, 1000),
    yearsExperience: cleanNumber(p.yearsExperience, 0, 50, DEFAULT_PROFILE.yearsExperience),
    skills,
    masterResume: cleanText(p.masterResume, 60_000),
    claudeNotes: cleanText(p.claudeNotes, 20_000),
    resumeFacts: cleanText(p.resumeFacts, 10_000),
    // Only ever a page on claude.ai (the "Open Claude" buttons open this address).
    claudeUrl: /^https:\/\/claude\.ai\//.test(claudeUrl) ? claudeUrl : DEFAULT_PROFILE.claudeUrl,
  };
}
