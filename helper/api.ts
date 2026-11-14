// Talking to your Job Hunt site. Every request carries this laptop's token; the site answers
// only the /api/helper/ addresses with it.

import type { AutofillReport, HelperTask, RunStatus } from "../src/shared/autofill";
import type { Config } from "./config";

export class LinkError extends Error {}

export class Site {
  constructor(private readonly config: Config) {}

  private async call(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
    const res = await fetch(new URL(path, this.config.site), {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${this.config.token}`, "user-agent": "jobhunt-helper" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) throw new LinkError("This laptop isn't linked to your account any more. Link it again in Settings → Laptop helper.");
    return res;
  }

  /**
   * First contact. A free Render server may be asleep and take a minute to wake, so this waits
   * longer and tries a few times.
   */
  async hello(): Promise<{ account: string; task: HelperTask | null; cancel: string[] }> {
    let last: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        const res = await this.call("/api/helper/next?first=1", {}, 90_000);
        if (!res.ok) throw new Error(`the site answered ${res.status}`);
        return (await res.json()) as { account: string; task: HelperTask | null; cancel: string[] };
      } catch (e) {
        if (e instanceof LinkError) throw e;
        last = e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    throw new Error(`Can't reach ${this.config.site} (${last instanceof Error ? last.message : String(last)}).`);
  }

  /** Anything to do? Cheap for the site: it answers from memory when nothing changed. */
  async next(): Promise<{ task: HelperTask | null; cancel: string[] }> {
    const res = await this.call("/api/helper/next");
    if (res.status === 204) return { task: null, cancel: [] };
    if (!res.ok) throw new Error(`the site answered ${res.status}`);
    const body = (await res.json()) as { task: HelperTask | null; cancel?: string[] };
    return { task: body.task, cancel: body.cancel ?? [] };
  }

  /** Tell the site how a form went. Returns the run's status afterwards ("cancelled": close the tab). */
  async report(runId: string, status: RunStatus, message: string, report: AutofillReport = {}): Promise<RunStatus | null> {
    const res = await this.call(`/api/helper/runs/${encodeURIComponent(runId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, message, report }),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`the site answered ${res.status}`);
    return ((await res.json()) as { status: RunStatus }).status;
  }

  async resume(runId: string): Promise<Buffer> {
    const res = await this.call(`/api/helper/runs/${encodeURIComponent(runId)}/resume`, {}, 120_000);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Couldn't download the resume (${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
