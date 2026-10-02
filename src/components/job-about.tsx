"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckOnGoogle } from "./check-on-google";
import { FullDescriptionForm } from "./full-description-form";
import { JobDescription } from "./job-description";
import { Button, buttonClass, Card, CardTitle, Icon } from "./ui";

/** "About the job": the description, plus a way to paste the complete text when the source only gave a preview. */
export function JobAbout({
  jobId,
  description,
  isPreview,
  postingUrl,
  via,
  googleQuota,
}: {
  jobId: string;
  description: string;
  isPreview: boolean;
  postingUrl: string | null;
  via: string;
  /** Google Jobs searches left; undefined when Google Jobs isn't set up. */
  googleQuota?: number | null;
}) {
  const [pasting, setPasting] = useState(false);

  return (
    <Card className="p-5 sm:p-7">
      <CardTitle
        icon="jobs"
        action={
          !isPreview && (
            <button type="button" className="text-xs font-medium text-muted hover:text-accent" onClick={() => setPasting((p) => !p)}>
              {pasting ? "Cancel" : "Replace description"}
            </button>
          )
        }
      >
        About the job
      </CardTitle>

      {!isPreview && pasting && (
        <div className="mb-6">
          <FullDescriptionForm jobId={jobId} onDone={() => setPasting(false)} cta="Replace description" />
        </div>
      )}

      <JobDescription text={description} className="max-w-3xl" />

      {isPreview && (
        <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-2/60 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-56 flex-1 text-sm text-muted">
              <p>
                <span className="font-medium text-ink">That&apos;s all {via} shares</span> — a short preview. Add the full description
                for an accurate match and a properly tailored resume.
              </p>
              {googleQuota !== undefined && <CheckOnGoogle jobId={jobId} quotaLeft={googleQuota} className="mt-3" />}
              <p className="mt-2 hidden text-xs md:block">
                Or open the posting and click your <b className="text-ink">Clip to Job Hunt</b> bookmark.{" "}
                <Link href="/settings#clip" className="font-medium text-accent hover:underline">
                  Set it up
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {postingUrl && (
                <a href={postingUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                  Open full posting <Icon name="external" className="size-3.5" />
                </a>
              )}
              {!pasting && (
                <Button size="sm" variant="primary" onClick={() => setPasting(true)}>
                  <Icon name="plus" className="size-3.5" /> Paste full description
                </Button>
              )}
            </div>
          </div>
          {pasting && (
            <div className="mt-4">
              <FullDescriptionForm jobId={jobId} onDone={() => setPasting(false)} />
              <button type="button" className="mt-2 text-xs text-muted hover:text-ink" onClick={() => setPasting(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
