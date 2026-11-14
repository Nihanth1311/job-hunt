// Not marked "server-only": drizzle-kit (the migration tool) reads this file outside Next.js.
// The screens only ever see its types, through src/shared/types.ts.
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AutofillReport } from "../../shared/autofill";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** Raw file bytes. PGlite hands back a Uint8Array and postgres-js a Buffer; both become a Buffer. */
const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => Buffer.from(v),
});

// ---------- Accounts ----------

/** People who can sign in (with Google). The first admin keeps the id "owner": the data from before accounts existed. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    image: text("image"),
    role: text("role").notNull().default("user"), // admin | user
    createdAt: ts("created_at").notNull().defaultNow(),
    lastLoginAt: ts("last_login_at"),
    /** Last time they used the app (updated at most every few minutes). */
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Gmail addresses the admin has allowed to sign in. */
export const invites = pgTable("invites", {
  email: text("email").primaryKey(),
  invitedBy: text("invited_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Signed-in browsers. The cookie holds a random token; only its SHA-256 is stored here. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Each person's own API keys (Google Jobs, Telegram), encrypted with AES-256-GCM. */
export const userSecrets = pgTable(
  "user_secrets",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: text("value").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.name] })],
);

/**
 * Jobs read from company careers sites, shared by everyone: each site is fetched once,
 * then copied into every person's feed and scored against their own profile.
 */
export const rawJobs = pgTable(
  "raw_jobs",
  {
    sourceKey: text("source_key").primaryKey(), // "<source>:<externalId>"
    companyId: text("company_id"),
    data: jsonb("data").notNull(),
    postedAt: ts("posted_at"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [index("raw_jobs_posted_idx").on(t.postedAt)],
);

// ---------- Each person's data (every row has a user_id) ----------

/** Every job we have ever seen, from any source. */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    source: text("source").notNull(), // adzuna | jsearch | greenhouse | lever | ashby | manual
    publisher: text("publisher"), // e.g. "LinkedIn" when it came via Google Jobs
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location").notNull().default(""),
    isRemote: boolean("is_remote").notNull().default(false),
    url: text("url").notNull().default(""),
    /** The job on the employer's own careers site, when we know it (null = only the board's copy). */
    companyUrl: text("company_url"),
    description: text("description").notNull().default(""),
    /** True when the source only gave us the start of the description (Adzuna: 500 characters). */
    descriptionIsPreview: boolean("description_is_preview").notNull().default(false),
    postedAt: ts("posted_at"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),

    salaryMinLpa: real("salary_min_lpa"),
    salaryMaxLpa: real("salary_max_lpa"),
    salaryEstimated: boolean("salary_estimated").notNull().default(false),
    salaryBucket: text("salary_bucket").notNull().default("unknown"), // meets | possible | below | unknown
    mentionsCtc: boolean("mentions_ctc").notNull().default(false),

    category: text("category").notNull().default("other"), // fullstack | frontend | backend | devops | sde | other
    track: text("track").notNull().default("fullstack"), // resume track to use
    expMin: integer("exp_min"),
    expMax: integer("exp_max"),
    expFit: boolean("exp_fit").notNull().default(true),
    /** Experience the source itself reported (Google Jobs does), used when the text doesn't say. */
    requiredExpMonths: integer("required_exp_months"),

    /** The verdict: fit = ready to apply, check = can't confirm yet, no = not a fit. */
    fit: text("fit").notNull().default("check"),
    /** Why, in short phrases; the first one is the headline. */
    fitReasons: jsonb("fit_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    score: integer("score").notNull().default(0),
    skills: jsonb("skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    matchedSkills: jsonb("matched_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    missingSkills: jsonb("missing_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    status: text("status").notNull().default("new"), // new | saved | skipped | applied
  },
  (t) => [
    uniqueIndex("jobs_user_dedupe_idx").on(t.userId, t.dedupeKey),
    index("jobs_user_idx").on(t.userId),
    index("jobs_posted_idx").on(t.postedAt),
    index("jobs_seen_idx").on(t.firstSeenAt),
    index("jobs_category_idx").on(t.category),
    index("jobs_status_idx").on(t.status),
    index("jobs_fit_idx").on(t.fit),
  ],
);

/** One row per job you are tracking (saved, applied, interviewing...). */
export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    company: text("company").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    track: text("track").notNull().default("fullstack"),
    status: text("status").notNull().default("saved"), // saved | applied | assessment | interview | offer | rejected
    appliedAt: ts("applied_at"),
    followUpAt: ts("follow_up_at"),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("applications_status_idx").on(t.status), index("applications_user_idx").on(t.userId)],
);

/** Timeline entries for an application. */
export const applicationEvents = pgTable("application_events", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // created | status | note
  message: text("message").notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Base resumes (one per track) and every tailored version you saved. */
export const resumeVersions = pgTable("resume_versions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  track: text("track").notNull(),
  label: text("label").notNull().default(""),
  content: text("content").notNull(),
  isBase: boolean("is_base").notNull().default(false),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  applicationId: text("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * The PDF of a resume: the file you uploaded, or your LaTeX compiled once and kept.
 * Its own table so lists of resumes never pull the file bytes over the network.
 */
export const resumeFiles = pgTable("resume_files", {
  resumeId: text("resume_id")
    .primaryKey()
    .references(() => resumeVersions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  source: text("source").notNull(), // upload | latex
  fileName: text("file_name").notNull().default(""),
  pdf: bytea("pdf").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Key/value store for each person's profile, preferences and state. user_id "" holds app-wide state. */
export const settings = pgTable(
  "settings",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Log of every fetch from every source. */
export const fetchRuns = pgTable("fetch_runs", {
  id: text("id").primaryKey(),
  /** "" for the shared company-careers fetch. */
  userId: text("user_id").notNull().default(""),
  source: text("source").notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  fetched: integer("fetched").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  error: text("error"),
});

// ---------- Autofill (the laptop helper) ----------

/**
 * Laptops linked to an account, for the autofill helper. The helper sends a random token;
 * only its SHA-256 is kept, like a session, so a leaked database can't be used to act as you.
 */
export const helperDevices = pgTable(
  "helper_devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    name: text("name").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [uniqueIndex("helper_devices_token_idx").on(t.tokenHash), index("helper_devices_user_idx").on(t.userId)],
);

/** One "Autofill this job" request: queued on the site, filled in Chrome by the helper, submitted by you. */
export const autofillRuns = pgTable(
  "autofill_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    resumeId: text("resume_id").references(() => resumeVersions.id, { onDelete: "set null" }),
    /** queued | filling | needs_you | answered | review | submitted | error | cancelled */
    status: text("status").notNull().default("queued"),
    applyUrl: text("apply_url").notNull(),
    /** What the helper last reported: fields it filled, questions it couldn't answer. */
    report: jsonb("report").$type<AutofillReport>().notNull().default(sql`'{}'::jsonb`),
    /** Answers you gave on the site for this form only (question → answer). */
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    message: text("message").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("autofill_runs_user_idx").on(t.userId, t.status), index("autofill_runs_job_idx").on(t.jobId)],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type ApplicationEvent = typeof applicationEvents.$inferSelect;
export type ResumeVersion = typeof resumeVersions.$inferSelect;
export type ResumeFile = typeof resumeFiles.$inferSelect;
export type FetchRun = typeof fetchRuns.$inferSelect;
export type User = typeof users.$inferSelect;
export type HelperDevice = typeof helperDevices.$inferSelect;
export type AutofillRun = typeof autofillRuns.$inferSelect;
