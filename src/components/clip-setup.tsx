"use client";

import { useEffect, useRef, useState } from "react";
import { buildBookmarklet } from "@/lib/core/capture";
import { copyText } from "./claude";
import { Button, Card, CardTitle, Icon } from "./ui";

/** The draggable "Clip to Job Hunt" bookmark and how to use it. */
export function ClipSetup() {
  const link = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // React refuses javascript: links in JSX, so set it directly. It only ever runs when you click the bookmark.
    link.current?.setAttribute("href", buildBookmarklet(window.location.origin));
  }, []);

  return (
    <Card id="clip" className="scroll-mt-6 p-5">
      <CardTitle icon="download">Clip jobs from any website</CardTitle>
      <p className="-mt-2 text-sm text-muted">
        Get the <b className="text-ink">full description</b> of a job, or add jobs from LinkedIn,
        Naukri, Indeed and company sites, in one click.
      </p>

      {/* Bookmarklets need a desktop browser's bookmarks bar; say what works on a phone instead. */}
      <p className="mt-4 rounded-lg bg-surface-2 px-3.5 py-3 text-sm md:hidden">
        Set this up on your <b>computer</b>&apos;s browser: it needs a bookmarks bar. On your phone, open a job&apos;s page here and use{" "}
        <b>Paste full description</b> instead.
      </p>

      <ol className="mt-4 hidden space-y-3 text-sm md:block">
        <li className="flex gap-3">
          <Num n={1} />
          <div className="min-w-0">
            <p>Show your bookmarks bar (Ctrl+Shift+B), then drag this button onto it:</p>
            <a
              ref={link}
              href="#clip"
              onClick={(e) => e.preventDefault()}
              draggable
              title="Drag me to your bookmarks bar"
              className="mt-2 inline-flex cursor-grab items-center gap-2 rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent active:cursor-grabbing"
            >
              <Icon name="download" className="size-4" /> Clip to Job Hunt
            </a>
            <p className="mt-2 text-xs text-muted">
              Can&apos;t drag it?{" "}
              <Button
                size="sm"
                variant="ghost"
                className="-ml-1 h-auto px-1 py-0 text-xs"
                onClick={() => copyText(buildBookmarklet(window.location.origin)).then((ok) => setCopied(ok))}
              >
                {copied ? "Copied" : "Copy the code"}
              </Button>{" "}
              and make a new bookmark with it as the URL.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <Num n={2} />
          <p>
            Open a job posting: LinkedIn, Naukri, Indeed or a company careers page.
          </p>
        </li>
        <li className="flex gap-3">
          <Num n={3} />
          <p>
            Click <b>Clip to Job Hunt</b>. Job Hunt opens with the full job. If it&apos;s already in your feed, press <b>Save</b>. If
            it&apos;s new, it opens <b>Add a job</b> already filled in.
          </p>
        </li>
      </ol>
      <p className="mt-4 hidden rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted md:block">
        Tip: if a page captures too much, select just the job description first, then click Clip. It only reads the page you have open, so
        it works on any site without breaking its terms.
      </p>
    </Card>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{n}</span>
  );
}
