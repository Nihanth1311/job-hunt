"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, Spinner } from "../ui";
import { DownloadButton } from "./download-button";
import { PdfPage, usePdf } from "./pdf-view";

/** "Preview" for one resume: opens every page of its PDF in a window over the page. */
export function PreviewButton({ id, title, size = "sm" }: { id: string; title: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Icon name="search" className="size-3.5" /> Preview
      </Button>
      {open && <ResumePreview id={id} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function ResumePreview({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pdf = usePdf(id);

  // A real <dialog>: Esc closes it, and the rest of the page can't be clicked or tabbed into meanwhile.
  // No close() on cleanup: its "close" event would arrive late and shut the next one (React runs
  // effects twice in development). Removing the element from the page is enough.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const pages = pdf && "doc" in pdf ? pdf.doc.numPages : 0;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={`${title} preview`}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-3xl overflow-hidden rounded-xl border border-line bg-surface-solid p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-black/55"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
          <DownloadButton id={id} />
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close preview">
            <Icon name="x" className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto bg-surface-2 p-3 sm:p-6">
          {!pdf && (
            <p className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
              <Spinner /> Loading the PDF…
            </p>
          )}
          {pdf && "error" in pdf && <p className="mx-auto max-w-md py-16 text-center text-sm text-bad">{pdf.error}</p>}
          {pdf && "doc" in pdf && (
            <div className="mx-auto max-w-[680px] space-y-4">
              {Array.from({ length: pages }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-sm shadow-[var(--shadow-lg)]">
                  <PdfPage doc={pdf.doc} page={i + 1} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
