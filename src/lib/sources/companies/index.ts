import "server-only";
import type { RawJob } from "../../core/analyze";
import { getDb, schema } from "../../db";
import { getPreferences, getState, GLOBAL, setState } from "../../settings";
import type { Preferences } from "../../types";
import { ashbyBoard, greenhouseBoard, leverBoard } from "../careers";
import type { JobSource } from "../index";
import { readAmazon, readGoogle } from "./bigtech";
import { readEightfold, readOracle, readSmartRecruiters } from "./platforms";
import { COMPANIES, type Company, type Platform } from "./registry";
import { inBatches, isRecent, TECH_TITLE, type Reader } from "./shared";
import { readWorkday } from "./workday";

// Jobs straight from big companies' own careers sites. Rules that keep the feed honest:
//   - the date is the company's own posting date, never "when we first saw it";
//   - no date, or older than 30 days → left out;
//   - only roles in India with a software / data / cloud / test title.

/** Greenhouse, Lever and Ashby readers already exist for "Career pages"; reuse them with the registry's name. */
const board =
  (load: (slug: string) => Promise<RawJob[]>): Reader =>
  async ({ company }) =>
    (await load(company.key)).map((j) => ({ ...j, company: company.name }));

const READERS: Record<Platform, Reader> = {
  workday: readWorkday,
  amazon: readAmazon,
  google: readGoogle,
  oracle: readOracle,
  eightfold: readEightfold,
  smartrecruiters: readSmartRecruiters,
  greenhouse: board(greenhouseBoard),
  lever: board(leverBoard),
  ashby: board(ashbyBoard),
};

/** How each company's last check went, for the Companies list in Settings. */
export interface CompanyHealth {
  at: string;
  ok: boolean;
  /** Recent India tech jobs this check returned that weren't in your feed yet. */
  added: number;
  error?: string;
}
export type HealthMap = Record<string, CompanyHealth>;

export const followedCompanies = (prefs: Preferences): Company[] =>
  COMPANIES.filter((co) => !prefs.skippedCompanies.includes(co.id));

export const getCompanyHealth = async (): Promise<HealthMap> => (await getState<HealthMap>(GLOBAL, "companyHealth")) ?? {};

/** Companies at least one person follows: the shared fetch reads each of these once. */
async function followedByAnyone(): Promise<Company[]> {
  const db = await getDb();
  const users = await db.select({ id: schema.users.id }).from(schema.users);
  const ids = new Set<string>();
  for (const u of users) for (const co of followedCompanies(await getPreferences(u.id))) ids.add(co.id);
  return COMPANIES.filter((co) => ids.has(co.id));
}

export const companies: JobSource = {
  id: "companies",
  label: "Company careers sites",
  scope: "shared",
  configured: () => true,
  async fetch() {
    const list = await followedByAnyone();
    if (!list.length) return [];
    const db = await getDb();
    // Jobs already in the shared pool don't need their pages fetched again.
    const have = new Set((await db.select({ key: schema.rawJobs.sourceKey }).from(schema.rawJobs)).map((r) => r.key));
    const known = (source: string, externalId: string) => have.has(`${source}:${externalId}`);

    const health = await getCompanyHealth();
    const at = new Date().toISOString();
    const results = await inBatches(list, 6, async (company) => {
      const raw = await READERS[company.platform]({ company, known });
      return raw
        .filter((j) => isRecent(j.postedAt) && TECH_TITLE.test(j.title) && !known(j.source, j.externalId))
        .map((j) => ({ ...j, companyId: company.id }));
    });

    const jobs: RawJob[] = [];
    results.forEach((r, i) => {
      const co = list[i];
      if (r.status === "fulfilled") {
        jobs.push(...r.value);
        health[co.id] = { at, ok: true, added: r.value.length };
      } else {
        const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
        health[co.id] = { at, ok: false, added: 0, error: error.slice(0, 160) };
        console.warn(`[companies] ${co.name}: ${error}`);
      }
    });
    await setState(GLOBAL, "companyHealth", health);

    if (!jobs.length && results.every((r) => r.status === "rejected")) throw new Error("No company site answered");
    return jobs;
  },
};
