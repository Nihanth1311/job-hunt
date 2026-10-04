"use client";

import { useState, useTransition, type ReactNode } from "react";
import { markApplied, restoreJob, saveJob, skipJob, unsaveJob } from "@/server/actions/jobs";
import { researchUrl, siteLabel } from "@/shared/core/links";
import type { Job } from "@/shared/types";
import { Button, buttonClass, Callout, cx, Icon } from "../ui";

/** Short name for the board a job came through, for "Apply via …". */
const VIA_LABEL: Record<string, string> = { adzuna: "Adzuna", jsearch: "Google Jobs", manual: "saved link" };

type ActionJob = Pick<Job, "id" | "url" | "companyUrl" | "publisher" | "source" | "status" | "company" | "title">;

/**
 * Apply links plus Save / Skip / Mark applied. Clicking an apply link asks
 * "Did you apply?" so the tracker stays up to date.
 */
export function JobActions({
  job,
  leading,
  trailing,
  className,
}: {
  job: ActionJob;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const [askApplied, setAskApplied] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));

  const companyUrl = job.companyUrl;
  // The board's copy, shown as a secondary option when it isn't the same page.
  const boardUrl = job.url && job.url !== companyUrl ? job.url : null;
  const via = job.publisher ?? VIA_LABEL[job.source] ?? "job board";
  const onApply = () => job.status !== "applied" && setAskApplied(true);

  return (
    <>
      <div className={cx("flex flex-wrap items-center gap-2", pending && "opacity-60", className)}>
        {leading}
        {companyUrl && (
          <a
            href={companyUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onApply}
            title={`The job on ${siteLabel(companyUrl)}`}
            className={buttonClass("secondary", "sm")}
          >
            <Icon name="building" className="size-3.5" />
            Apply on company site <Icon name="external" className="size-3.5" />
          </a>
        )}
        {boardUrl && (
          <a
            href={boardUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onApply}
            className={buttonClass(companyUrl ? "ghost" : "secondary", "sm")}
          >
            Apply via {via} <Icon name="external" className="size-3.5" />
          </a>
        )}
        <a
          href={researchUrl(job)}
          target="_blank"
          rel="noreferrer"
          title={`Search Google for ${job.company} · ${job.title} · salary`}
          className={buttonClass("secondary", "sm")}
        >
          <Icon name="search" className="size-3.5" />
          Research
        </a>
        {job.status === "new" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => saveJob(job.id))}>
              <Icon name="bookmark" className="size-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipJob(job.id))}>
              Skip
            </Button>
          </>
        )}
        {job.status === "skipped" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => restoreJob(job.id))}>
            Restore
          </Button>
        )}
        {job.status === "saved" && !askApplied && (
          <Button size="sm" disabled={pending} onClick={() => run(() => markApplied(job.id))}>
            Mark applied
          </Button>
        )}
        {job.status === "saved" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            title="Move it back to New and take it off the tracker"
            onClick={() => run(() => unsaveJob(job.id))}
          >
            <Icon name="x" className="size-3.5" />
            Remove from saved
          </Button>
        )}
        {trailing}
      </div>

      {askApplied && (
        <Callout className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Did you apply?</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setAskApplied(false);
              run(() => markApplied(job.id));
            }}
          >
            Yes, track it
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAskApplied(false)}>
            Not yet
          </Button>
        </Callout>
      )}
    </>
  );
}
