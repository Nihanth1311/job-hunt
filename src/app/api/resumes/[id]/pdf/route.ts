import { requireUser } from "@/server/auth";
import { getResumePdf } from "@/server/services/resume-files";

export const dynamic = "force-dynamic";

/** One of your resumes as a PDF: shown in the browser, or downloaded with ?download=1. */
export async function GET(req: Request, ctx: RouteContext<"/api/resumes/[id]/pdf">) {
  const { id: uid } = await requireUser();
  const { id } = await ctx.params;
  const out = await getResumePdf(uid, id);
  if (!out) return Response.json({ error: "No PDF for this resume." }, { status: 404 });
  if ("error" in out) return Response.json({ error: out.error }, { status: 422 });

  const download = new URL(req.url).searchParams.has("download");
  // filename* carries names with spaces or non-English letters safely.
  const name = encodeURIComponent(out.fileName.replace(/[\r\n"]/g, ""));
  return new Response(new Uint8Array(out.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      // A resume never changes under its id (an edit saves a new one), so the browser can keep it.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
