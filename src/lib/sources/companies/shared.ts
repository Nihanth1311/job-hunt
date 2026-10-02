import "server-only";
import type { RawJob } from "../../core/analyze";
import type { Company } from "./registry";

/** What every platform reader gets: the company, and whether we already have a job (to skip re-fetching its details). */
export interface ReadContext {
  company: Company;
  known(source: string, externalId: string): boolean;
}

export type Reader = (ctx: ReadContext) => Promise<RawJob[]>;

/** Jobs older than this (by the company's own date) are left out. */
export const MAX_AGE_DAYS = 30;
/** Full job pages fetched per company per run; the rest come on the next run. */
export const DETAIL_LIMIT = 25;

// Ask like a browser: some careers sites turn away anything that doesn't.
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-IN,en;q=0.9",
};

async function request(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...HEADERS, ...init.headers },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  // "Slow down": wait and try again a couple of times before giving up on this company.
  if ((res.status === 429 || res.status === 503) && attempt < 2) {
    await pause(3000 * (attempt + 1));
    return request(url, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status === 429 ? "rate-limited (429)" : res.status} from ${new URL(url).host}`);
  return res;
}

export async function getJson<T>(url: string): Promise<T> {
  const body = await (await request(url)).text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`unexpected reply from ${new URL(url).host}: "${body.slice(0, 40).replace(/\s+/g, " ")}"`);
  }
}
export const getText = async (url: string): Promise<string> => (await request(url)).text();
export const postJson = async <T>(url: string, body: unknown): Promise<T> =>
  (await request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })).json() as Promise<T>;

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` over items, a few at a time, with a short gap between requests to the same site. */
export async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.allSettled(items.slice(i, i + size).map(fn))));
    if (i + size < items.length) await pause(250);
  }
  return out;
}

/**
 * Titles worth opening: software, data, cloud and test engineering. Deliberately broad;
 * the fit check decides later whether the role suits you.
 */
export const TECH_TITLE =
  /\b(engineer(ing)?|developer|sde|swe|software|devops|dev ops|sre|site reliability|full[\s-]?stack|front[\s-]?end|back[\s-]?end|programmer|cloud|platform|infrastructure|automation|qa|sdet|test(ing)?|data|machine learning|ml|ai|security|architect|technolog(y|ist)|it analyst|systems? analyst|application|technical)\b/i;

export function isRecent(date: Date | null): date is Date {
  return Boolean(date && !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= MAX_AGE_DAYS * 86_400_000);
}

/** "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago". Null for 30+ (too old). */
export function fromRelative(text: string | undefined): Date | null {
  const t = (text ?? "").toLowerCase();
  if (/30\+/.test(t)) return null;
  if (/today|just/.test(t)) return new Date();
  if (/yesterday/.test(t)) return new Date(Date.now() - 86_400_000);
  const n = t.match(/(\d+)\s*day/)?.[1];
  return n ? new Date(Date.now() - Number(n) * 86_400_000) : null;
}
