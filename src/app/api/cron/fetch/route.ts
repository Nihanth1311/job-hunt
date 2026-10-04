import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { tick } from "@/server/fetching/scheduler";

// For hosts without a long-running server (e.g. Vercel): call this from any cron
// (GitHub Actions, cron-job.org) with header  Authorization: Bearer <CRON_SECRET>.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  after(() => tick(from));
  return Response.json({ ok: true, started: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
