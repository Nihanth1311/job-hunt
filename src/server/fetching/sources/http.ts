import "server-only";

/**
 * GET a URL and parse the JSON, for the public board APIs in careers.ts. Gives up after
 * `timeoutMs` (20 s) and never caches. On an error status it throws a short message with the
 * status, the API's own "message" if it sent one, and the host.
 * (Company careers sites use their own version in companies/shared.ts, which asks like a browser and retries.)
 */
export async function getJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { accept: "application/json", ...rest.headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const detail = body.match(/"message"\s*:\s*"([^"]{1,120})"/)?.[1];
    throw new Error(`${res.status} ${detail ?? res.statusText} from ${new URL(url).host}`);
  }
  return (await res.json()) as T;
}
