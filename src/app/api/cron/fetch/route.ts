import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/scheduler";

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
  await tick();
  return Response.json({ ok: true });
}

export const GET = handle;
export const POST = handle;
