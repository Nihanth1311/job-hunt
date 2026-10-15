import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getProfile } from "./settings";
import { isLatex } from "@/shared/core/latex";
import { TRACK_TITLE, type Track } from "@/shared/types";

// A resume's PDF: kept in resume_files, next to (never inside) its resume_versions row.
// LaTeX is turned into a PDF by a free online LaTeX compiler, the same kind of service as
// Overleaf: nothing to install on your laptop or the server. The PDF is kept, so each
// resume is compiled only once.

/** PDFs bigger than this aren't resumes (a two-page resume is usually 50-300 KB). */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export type Compiled = { pdf: Buffer } | { error: string };

/** LaTeX → PDF. Tries a second compiler only when the first can't be reached (not when the LaTeX has a mistake). */
export async function compileLatex(code: string): Promise<Compiled> {
  try {
    return await ytotech(code);
  } catch {
    try {
      return await texliveNet(code);
    } catch {
      return { error: "The LaTeX compiler can't be reached right now. Try again in a minute." };
    }
  }
}

/** latex.ytotech.com: answers with the PDF, or a 400 with the log when the LaTeX has a mistake. */
async function ytotech(code: string): Promise<Compiled> {
  const res = await fetch("https://latex.ytotech.com/builds/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ compiler: "pdflatex", resources: [{ main: true, content: code }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (isPdf(res)) return { pdf: Buffer.from(await res.arrayBuffer()) };
  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { log_files?: Record<string, string> };
    return { error: latexError(Object.values(body.log_files ?? {}).join("\n")) };
  }
  throw new Error(`ytotech ${res.status}`);
}

/** texlive.net: redirects to the PDF, or to the log when the LaTeX has a mistake. */
async function texliveNet(code: string): Promise<Compiled> {
  const form = new FormData();
  form.append("filecontents[]", code);
  form.append("filename[]", "document.tex");
  form.append("engine", "pdflatex");
  form.append("return", "pdf");
  const res = await fetch("https://texlive.net/cgi-bin/latexcgi", { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  if (isPdf(res)) return { pdf: Buffer.from(await res.arrayBuffer()) };
  if (res.ok) return { error: latexError(await res.text()) };
  throw new Error(`texlive.net ${res.status}`);
}

const isPdf = (res: Response) => res.ok && (res.headers.get("content-type") ?? "").includes("application/pdf");

/** The useful part of a LaTeX log: the first "! ..." error and the line it happened on. */
export function latexError(log: string): string {
  const lines = log.split("\n");
  const at = lines.findIndex((l) => l.startsWith("! "));
  if (at < 0) return "The LaTeX didn't compile. Check it opens in Overleaf.";
  const where = lines.slice(at, at + 12).find((l) => /^l\.\d+/.test(l));
  const line = where?.match(/^l\.(\d+)/)?.[1];
  return `LaTeX error${line ? ` on line ${line}` : ""}: ${lines[at].slice(2).trim()}`;
}

/** Does this file start like a PDF? (The browser's file type can't be trusted.) */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** The text of a PDF, so Claude can read an uploaded resume. "" for a scanned (image-only) PDF. */
export async function pdfText(pdf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function saveResumeFile(uid: string, resumeId: string, file: { source: "upload" | "latex"; fileName: string; pdf: Buffer }) {
  const db = await getDb();
  await db
    .insert(schema.resumeFiles)
    .values({ resumeId, userId: uid, ...file })
    .onConflictDoUpdate({ target: schema.resumeFiles.resumeId, set: { ...file, createdAt: new Date() } });
}

/**
 * The PDF for one of your resumes: the stored one, or (for a LaTeX resume made before PDFs
 * were kept, or by Claude) compiled now and stored. null when it isn't yours or isn't LaTeX.
 */
export async function getResumePdf(uid: string, id: string): Promise<{ pdf: Buffer; fileName: string } | { error: string } | null> {
  const db = await getDb();
  const [resume] = await db
    .select({
      content: schema.resumeVersions.content,
      track: schema.resumeVersions.track,
      jobTitle: schema.jobs.title,
      company: schema.jobs.company,
    })
    .from(schema.resumeVersions)
    .leftJoin(schema.jobs, eq(schema.resumeVersions.jobId, schema.jobs.id))
    .where(and(eq(schema.resumeVersions.id, id), eq(schema.resumeVersions.userId, uid)));
  if (!resume) return null;

  // Named the way a recruiter expects: Your_Name_Data_Scientist_Microsoft.pdf (no company for a base resume).
  const role = resume.jobTitle ? shortRole(resume.jobTitle) : (TRACK_TITLE[resume.track as Track] ?? "Resume");
  const fileName = resumeFileName((await getProfile(uid)).name.trim() || "Resume", role, resume.company);

  const [file] = await db.select({ pdf: schema.resumeFiles.pdf }).from(schema.resumeFiles).where(eq(schema.resumeFiles.resumeId, id));
  if (file) return { pdf: file.pdf, fileName };
  if (!isLatex(resume.content)) return null;
  const out = await compileLatex(resume.content);
  if ("error" in out) return out;
  await saveResumeFile(uid, id, { source: "latex", fileName, pdf: out.pdf });
  return { pdf: out.pdf, fileName };
}

/** "Senior Software Engineer - Backend (Commerce Team), Hyderabad" → "Senior Software Engineer Backend": the role, at most 6 words. */
function shortRole(title: string): string {
  const words = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ") // (Remote), [Hybrid]
    .split(/,|\s\|\s/)[0] // what follows a comma is usually the place
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)); // drop "-", "&"
  return words.slice(0, 6).join(" ") || title;
}

/** "Nihanth Baratam", "Data Scientist", "Microsoft" → "Nihanth_Baratam_Data_Scientist_Microsoft.pdf". */
export function resumeFileName(...parts: (string | null | undefined)[]): string {
  const safe = parts
    .filter((p): p is string => !!p?.trim())
    .map((p) =>
      p
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "") // é → e
        .replace(/&/g, "and")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean);
  return `${safe.join("_") || "Resume"}.pdf`;
}

/** Which of these resumes already have a PDF (so the list can say "PDF" without loading any file). */
export async function resumeIdsWithPdf(uid: string): Promise<Map<string, "upload" | "latex">> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.resumeFiles.resumeId, source: schema.resumeFiles.source })
    .from(schema.resumeFiles)
    .where(eq(schema.resumeFiles.userId, uid));
  return new Map(rows.map((r) => [r.id, r.source as "upload" | "latex"]));
}
