"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveBaseResume } from "@/server/actions/resumes";
import { extractLatex, isLatex } from "@/shared/core/latex";
import { stripFences } from "@/shared/core/markdown";
import { formatDate } from "@/shared/format";
import { TRACK_TITLE, type ResumeKind, type Track } from "@/shared/types";
import { DownloadButton } from "./download-button";
import { PdfThumb } from "./pdf-view";
import { PreviewButton } from "./resume-preview";
import { Badge, Button, buttonClass, Callout, Card, Icon } from "../ui";

const KIND_LABEL: Record<ResumeKind, string> = { upload: "Uploaded PDF", latex: "LaTeX", text: "Text" };

/** One role type's base resume: its first page, preview, download, edit, or replace. */
export function BaseResumeCard({
  track,
  base,
  onReplace,
}: {
  track: Track;
  base: { id: string; kind: ResumeKind; content: string; createdAt: Date };
  onReplace: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasPdf = base.kind !== "text";
  const title = TRACK_TITLE[track];

  const save = (anyway = false) =>
    start(async () => {
      setError(null);
      const out = await saveBaseResume(track, isLatex(draft) ? extractLatex(draft) : stripFences(draft), { anyway });
      if (out && "error" in out) return setError(out.error);
      setEditing(false);
    });

  if (editing) {
    return (
      <Card className="p-5 md:col-span-2">
        <h3 className="mb-3 text-[15px] font-semibold tracking-tight">Edit {title} resume</h3>
        <textarea
          className="field min-h-80 font-mono leading-relaxed sm:text-xs"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <Callout tone="bad" className="mt-3">
            {error}{" "}
            <button type="button" className="font-medium underline" disabled={pending} onClick={() => save(true)}>
              Save anyway
            </button>
          </Callout>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" disabled={pending || !draft.trim() || draft === base.content} onClick={() => save()}>
            {pending ? (isLatex(draft) ? "Making the PDF…" : "Saving…") : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex gap-4 p-4">
      {hasPdf ? (
        <PdfThumb id={base.id} className="aspect-[8.5/11] w-24 shrink-0 sm:w-28" />
      ) : (
        <TextThumb content={base.content} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone="neutral">{KIND_LABEL[base.kind]}</Badge>
          {formatDate(base.createdAt)}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {hasPdf ? (
            <>
              <PreviewButton id={base.id} title={`${title} resume`} />
              <DownloadButton id={base.id} variant="ghost" iconOnly />
            </>
          ) : (
            <Link href={`/print/resume/${base.id}`} target="_blank" className={buttonClass("secondary", "sm")}>
              <Icon name="printer" className="size-3.5" /> PDF
            </Link>
          )}
          {base.kind !== "upload" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(base.content);
                setError(null);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onReplace}>
            Replace
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** A resume written as plain text has no PDF: show its first lines instead. */
function TextThumb({ content }: { content: string }) {
  const lines = content
    .split("\n")
    .map((l) => l.replace(/^[#*\-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 9);
  return (
    <div className="aspect-[8.5/11] w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 p-2 text-[7px] leading-snug text-muted sm:w-28">
      {lines.map((l, i) => (
        <p key={i} className={i === 0 ? "font-semibold text-ink" : "truncate"}>
          {l}
        </p>
      ))}
    </div>
  );
}
