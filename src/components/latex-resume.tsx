"use client";

import { useState } from "react";
import { copyText } from "./claude";
import { Button, buttonClass, Icon } from "./ui";

/** A saved LaTeX resume: open it in Overleaf (compiles to PDF), or copy the code. */
export function LatexResume({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Overleaf's "open a snippet" endpoint: a plain form post, nothing stored by this app. */}
        <form action="https://www.overleaf.com/docs" method="post" target="_blank">
          <input type="hidden" name="encoded_snip" value={encodeURIComponent(code)} />
          <input type="hidden" name="snip_name" value={name} />
          <input type="hidden" name="engine" value="pdflatex" />
          <button type="submit" className={buttonClass("primary")}>
            Open in Overleaf (PDF) <Icon name="external" className="size-3.5" />
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
