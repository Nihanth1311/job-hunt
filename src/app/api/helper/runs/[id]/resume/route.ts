import { requireHelper } from "@/server/auth/helper";
import { runResume } from "@/server/services/autofill";

export const dynamic = "force-dynamic";

/** The resume PDF chosen for this autofill, for the helper to put on the form. */
export async function GET(request: Request, ctx: RouteContext<"/api/helper/runs/[id]/resume">) {
  const uid = await requireHelper(request);
  if (uid instanceof Response) return uid;
  const { id } = await ctx.params;
  const out = await runResume(uid, id);
  if (!out) return Response.json({ error: "No resume for this autofill." }, { status: 404 });
  if ("error" in out) return Response.json({ error: out.error }, { status: 422 });
  return new Response(new Uint8Array(out.pdf), {
    headers: { "content-type": "application/pdf", "cache-control": "private, no-store" },
  });
}
