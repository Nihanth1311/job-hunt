import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { tick } from "@/server/fetching/scheduler";

// The address the alarm clocks call. A free server sleeps when nobody visits, and a sleeping
// server runs no timers, so something outside has to knock: GitHub Actions
// (.github/workflows/fetch.yml) and cron-job.org request this address with the header
//   Authorization: Bearer <CRON_SECRET>
// The request itself wakes the server; the route then asks the scheduler whether anything is due.
export const dynamic = "force-dynamic";
/** For hosts that limit how long a request may run: allow the background work up to 5 minutes. */
export const maxDuration = 300;

/** Is this the secret we expect? timingSafeEqual takes the same time whether the first or the last character is wrong, so the answer's speed leaks nothing. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

async function handle(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  // Who's calling (?from=github, ?from=cronjob), recorded so Settings shows which alarms arrive.
  const from = (new URL(request.url).searchParams.get("from") ?? "cron").replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "cron";
  // Answer at once and fetch in the background: the server stays awake while it works, and the
  // caller (GitHub Actions) isn't billed for minutes spent waiting.
  // after() is Next.js's "run this once the response has been sent".
  after(() => tick(from));
  return Response.json({ ok: true, started: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
