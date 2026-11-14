import { requireHelper } from "@/server/auth/helper";
import { helperAccount, nextTask, takeCancelled } from "@/server/services/autofill";

export const dynamic = "force-dynamic";

/**
 * The helper asks this every few seconds: "is there a form for me?". 204 = nothing to do.
 * `cancel` lists autofills you cancelled on the site, so the helper closes their tabs.
 * ?first=1 (when the helper starts): look in the database whatever the memory says, and say whose account this is.
 */
export async function GET(request: Request) {
  const uid = await requireHelper(request);
  if (uid instanceof Response) return uid;
  const first = new URL(request.url).searchParams.has("first");
  const task = await nextTask(uid, first);
  const cancel = takeCancelled(uid);
  if (first) return Response.json({ account: await helperAccount(uid), task, cancel });
  return task || cancel.length ? Response.json({ task, cancel }) : new Response(null, { status: 204 });
}
