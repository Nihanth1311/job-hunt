export const TRACKS = ["frontend", "backend", "fullstack", "devops"] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABEL: Record<Track, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Full Stack",
  devops: "DevOps",
};

/** The job title you present yourself as on that track's resume. */
export const TRACK_TITLE: Record<Track, string> = {
  frontend: "Frontend Developer",
  backend: "Backend Developer",
  fullstack: "Full Stack Developer",
  devops: "DevOps Engineer",
};

export const CATEGORIES = ["fullstack", "frontend", "backend", "devops", "sde", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  fullstack: "Full Stack",
  frontend: "Frontend",
  backend: "Backend",
  devops: "DevOps",
  sde: "SDE",
  other: "Other",
};

export type SalaryBucket = "meets" | "possible" | "below" | "unknown";

export const APP_STATUSES = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export const SKILL_GROUPS = ["frontend", "backend", "devops", "other"] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];

export interface Profile {
  name: string;
  email: string;
  phone: string;
  location: string;
  /** One link per line (LinkedIn, GitHub, portfolio). */
  links: string;
  yearsExperience: number;
  skills: Record<SkillGroup, string[]>;
  /** Your full, honest resume. Every tailored version is built from this. */
  masterResume: string;
  /** Private context for Claude only. Never shown on any resume. */
  claudeNotes: string;
  /** Where the "Open Claude" buttons go: a Claude Project link or claude.ai/new. */
  claudeUrl: string;
}

export interface Preferences {
  salaryFloorLpa: number;
  maxExperience: number;
  showUnknownSalary: boolean;
  /** Preferred cities. Empty = anywhere in India. */
  locations: string[];
  searchQueries: string[];
  /** Extra company career pages beyond the built-in list, e.g. "lever:meesho". */
  careerPages: string[];
  /** Companies from the built-in list you've switched off (ids from sources/companies/registry). */
  skippedCompanies: string[];
  fetchIntervalHours: number;
  jsearchQueriesPerDay: number;
  morningDigest: boolean;
  /** Send an instant Telegram alert for new jobs scoring at least this. 0 = off. */
  instantAlertScore: number;
}

export const DEFAULT_PROFILE: Profile = {
  name: "",
  email: "",
  phone: "",
  location: "",
  links: "",
  yearsExperience: 1,
  skills: { frontend: [], backend: [], devops: [], other: [] },
  masterResume: "",
  claudeNotes: "",
  claudeUrl: "https://claude.ai/new",
};

export const DEFAULT_PREFERENCES: Preferences = {
  salaryFloorLpa: 10,
  maxExperience: 2,
  showUnknownSalary: true,
  locations: [],
  searchQueries: [
    "software engineer",
    "full stack developer",
    "frontend developer",
    "backend developer",
    "devops engineer",
  ],
  // Companies whose public boards had India tech roles open to 0–2 yrs when this list was made.
  careerPages: [],
  skippedCompanies: [],
  fetchIntervalHours: 3,
  // 5 searches a day ≈ 150 requests a month, inside the JSearch free plan (200).
  jsearchQueriesPerDay: 5,
  morningDigest: true,
  instantAlertScore: 80,
};
