import { getSessionUser } from "@/server/auth";
import { fetchStatus, startManualFetch } from "@/server/fetching/fetcher";

export const dynamic = "force-dynamic";

// "Fetch now" as two quick requests instead of one that stays open for minutes: a phone that
// leaves the app cuts long requests off (and the old button then showed "Fetch failed" for a
// fetch that went fine). POST starts it and answers at once; GET says whether it's still
// running and how the last one ended. Plain routes, not server actions, so they never queue.

/** Start your fetch (or join the one already running). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json({ startedAt: startManualFetch(user.id) });
}

/** Is your fetch still running, and how did your last one end? */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json(await fetchStatus(user.id), { headers: { "Cache-Control": "no-store" } });
}
