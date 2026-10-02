import "server-only";

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
