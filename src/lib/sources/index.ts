import "server-only";
import type { RawJob } from "../core/analyze";
import type { Secrets } from "../settings";
import type { Preferences } from "../types";
import { ashby, greenhouse, lever } from "./careers";
import { companies } from "./companies";
import { jsearch } from "./jsearch";

export interface SourceContext {
  /** Whose fetch this is ("" for the shared company-careers pool). */
  userId: string;
  /** Their own API keys (empty for the shared pool). */
  secrets: Secrets;
  prefs: Preferences;
  /** When this source last ran successfully, if ever. */
  lastRun: Date | null;
}

/**
 * A job source. To add a new one (free or paid), implement this and add it to SOURCES.
 * `due` lets rate-limited sources (like the JSearch free plan) run less often.
 */
export interface JobSource {
  id: string;
  label: string;
  /** "shared": fetched once for everyone into the job pool. "user": runs per person with their own keys. */
  scope: "shared" | "user";
  configured(prefs: Preferences, secrets: Secrets): boolean;
  due?(ctx: SourceContext): boolean;
  /** Has a hard request quota: "Fetch now" doesn't override `due`, so it can't burn the monthly allowance. */
  budgeted?: boolean;
  fetch(ctx: SourceContext): Promise<RawJob[]>;
}

export const SOURCES: JobSource[] = [companies, jsearch, greenhouse, lever, ashby];

/**
 * Sources we no longer use. Their jobs stay in the database (and in Saved / the tracker if you
 * acted on them) but leave the New feed. Adzuna: its dates are when it re-listed an ad, not when
 * the company posted it, so month-old jobs looked new.
 */
export const RETIRED_SOURCES = ["adzuna"];

