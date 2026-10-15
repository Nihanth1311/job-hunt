"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "unpdf/pdfjs";
import { getResumePdf } from "../../api/requests";
import { cx, Spinner } from "../ui";

// Draws resume PDFs right in the page with PDF.js (via unpdf), instead of the browser's own
// PDF viewer: that one doesn't open inside a page on Android phones, and looks different
// in every browser. PDF.js is only downloaded the first time a resume is shown.

type Loaded = { doc: PDFDocumentProxy } | { error: string };

// One download per resume per visit, shared by its thumbnail and its preview.
const docs = new Map<string, Promise<Loaded>>();

function loadPdf(id: string): Promise<Loaded> {
  let p = docs.get(id);
  if (!p) {
    p = (async () => {
      const got = await getResumePdf(id);
      if ("error" in got) return got;
      const { getDocumentProxy } = await import("unpdf");
      return { doc: await getDocumentProxy(got.pdf) };
    })().catch(() => ({ error: "This PDF couldn't be opened." }));
    docs.set(id, p);
    // Don't keep a failure: the next look tries again (the compiler may be back).
    p.then((r) => "error" in r && docs.delete(id));
  }
  return p;
}

/** A resume's PDF, loaded once: the document, or why there isn't one. */
export function usePdf(id: string | null) {
  const [state, setState] = useState<{ id: string; loaded: Loaded } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadPdf(id).then((loaded) => live && setState({ id, loaded }));
    return () => {
      live = false;
    };
  }, [id]);
  return state && state.id === id ? state.loaded : null;
}

/** One page, drawn sharp at the width of its box. */
export function PdfPage({ doc, page, className }: { doc: PDFDocumentProxy; page: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    let live = true;
    doc.getPage(page).then((p) => {
      if (!live) return;
      const width = el.parentElement?.clientWidth || 600;
      const scale = (width / p.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale });
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      task = p.render({ canvas: el, viewport });
      task.promise.catch(() => undefined);
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [doc, page]);
  return <canvas ref={canvas} className={cx("block h-auto w-full bg-white", className)} />;
}

/** The first page, small: what each resume card shows. */
export function PdfThumb({ id, className }: { id: string; className?: string }) {
  const pdf = usePdf(id);
  return (
    <div className={cx("relative overflow-hidden rounded-lg border border-line bg-surface-2", className)}>
      {!pdf && (
        <div className="absolute inset-0 grid place-items-center text-muted">
          <Spinner />
        </div>
      )}
      {pdf && "error" in pdf && <p className="p-3 text-xs leading-relaxed text-bad">{pdf.error}</p>}
      {pdf && "doc" in pdf && <PdfPage doc={pdf.doc} page={1} />}
    </div>
  );
}
