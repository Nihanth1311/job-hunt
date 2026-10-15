"use client";

import { useState } from "react";
import { copyText } from "./claude";
import { DownloadButton } from "./download-button";
import { PreviewButton } from "./resume-preview";
import { Button, buttonClass, Icon } from "../ui";

/** A saved LaTeX resume: preview or download it as a PDF, open it in Overleaf, or copy the code. */
export function LatexResume({ id, code, name }: { id: string; code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DownloadButton id={id} variant="primary" size="md" />
        <PreviewButton id={id} title={name.replace(/\.tex$/, "")} size="md" />
        {/* Overleaf's "open a snippet" endpoint: a plain form post, nothing stored by this app. */}
        <form action="https://www.overleaf.com/docs" method="post" target="_blank">
          <input type="hidden" name="encoded_snip" value={encodeURIComponent(code)} />
          <input type="hidden" name="snip_name" value={name} />
          <input type="hidden" name="engine" value="pdflatex" />
          <button type="submit" className={buttonClass("secondary")}>
            Edit in Overleaf <Icon name="external" className="size-3.5" />
          </button>
        </form>
        <Button onClick={() => copyText(code).then(setCopied)}>
          <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <pre className="panel max-h-[75vh] overflow-auto rounded-xl p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap">{code}</pre>
    </>
  );
}
