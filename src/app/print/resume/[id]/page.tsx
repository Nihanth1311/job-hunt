import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LatexResume } from "@/components/latex-resume";
import { PrintButton } from "@/components/print-button";
import { isLatex } from "@/lib/core/latex";
import { markdownToHtml } from "@/lib/core/markdown";
import { requireUser } from "@/lib/auth";
import { getResume } from "@/lib/queries";
import { TRACK_LABEL, type Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resume" };

export default async function PrintResumePage({ params }: PageProps<"/print/resume/[id]">) {
  const { id } = await params;
  const { id: uid } = await requireUser();
  const resume = await getResume(uid, id);
  if (!resume) notFound();
  const label = `${resume.label} · ${TRACK_LABEL[resume.track as Track] ?? resume.track}`;

  if (isLatex(resume.content)) {
    return (
      <div className="mx-auto min-h-screen max-w-4xl px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight">{resume.label}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">
          LaTeX resume. Open it in Overleaf to get the PDF (free account), or copy the code into any LaTeX editor.
        </p>
        <LatexResume code={resume.content} name={`${resume.label}.tex`} />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <p className="text-sm text-muted">{label}</p>
        <PrintButton />
      </div>
      <article
        className="print-sheet resume mx-auto min-h-[297mm] w-full max-w-[210mm] rounded-sm bg-white px-[14mm] py-[12mm] shadow-[var(--shadow-lg)]"
        // Safe: markdownToHtml escapes everything before adding formatting tags.
        dangerouslySetInnerHTML={{ __html: markdownToHtml(resume.content) }}
      />
    </div>
  );
}
