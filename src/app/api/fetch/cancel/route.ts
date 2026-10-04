import { getSessionUser } from "@/server/auth";
import { cancelFetch } from "@/server/fetching/fetcher";

export const dynamic = "force-dynamic";

/**
 * Stop your running "Fetch now". A plain route on purpose: Next.js runs a page's server actions
 * one at a time, so a cancel sent as an action would wait behind the very fetch it should stop.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json({ cancelled: cancelFetch(user.id) });
}
