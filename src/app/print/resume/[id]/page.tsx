import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LatexResume } from "@/client/components/resumes/latex-resume";
import { PrintButton } from "@/client/components/resumes/print-button";
import { isLatex } from "@/shared/core/latex";
import { markdownToHtml } from "@/shared/core/markdown";
import { requireUser } from "@/server/auth";
import { getResume } from "@/server/services/queries";
import { TRACK_LABEL, type Track } from "@/shared/types";

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
          LaTeX resume. Download it as a PDF, or open it in Overleaf to change it.
        </p>
        <LatexResume id={resume.id} code={resume.content} name={`${resume.label}.tex`} />
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
