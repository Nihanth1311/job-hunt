import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { getDb, schema } from "@/server/db";
import { looksLikePdf, MAX_PDF_BYTES, pdfText, saveResumeFile } from "@/server/services/resume-files";
import { resumeName, TRACKS, type Track } from "@/shared/types";

export const dynamic = "force-dynamic";

/**
 * Upload a resume PDF (a form with `file`, `track` and an optional `label`). It becomes your
 * base resume for that role type; its text is kept too, so Claude can read it when tailoring.
 */
export async function POST(req: Request) {
  const { id: uid } = await requireUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a PDF file." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: "That PDF is over 5 MB. A resume is usually well under 1 MB." }, { status: 400 });
  const pdf = Buffer.from(await file.arrayBuffer());
  if (!looksLikePdf(pdf)) return Response.json({ error: "That file isn't a PDF." }, { status: 400 });

  const track = String(form?.get("track") ?? "");
  if (!TRACKS.includes(track as Track)) return Response.json({ error: "Pick a role type." }, { status: 400 });
  const label = resumeName(track, null, String(form?.get("label") ?? "").trim() || "Base");

  let text = "";
  try {
    text = await pdfText(pdf);
  } catch {
    return Response.json({ error: "That PDF couldn't be opened. Is it password-protected?" }, { status: 400 });
  }

  const db = await getDb();
  const id = randomUUID();
  await db.insert(schema.resumeVersions).values({ id, userId: uid, track, label, content: text, isBase: true });
  await saveResumeFile(uid, id, { source: "upload", fileName: file.name || `${label}.pdf`, pdf });
  revalidatePath("/", "layout");
  // A scanned PDF has no text to read: it still previews and downloads, but Claude can't use it.
  return Response.json({ id, noText: text.length < 50 });
}
