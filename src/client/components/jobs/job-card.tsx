"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { getJobDescription } from "@/server/actions/jobs";
import { experienceLabel } from "@/shared/core/classify";
import { siteLabel, sourceLabel } from "@/shared/core/links";
import type { JobListItem } from "@/shared/types";
import { timeAgo } from "@/shared/format";
import { CheckOnGoogle } from "./check-on-google";
import { FitLine } from "./fit-line";
import { JobActions } from "./job-actions";
import { JobDescription } from "./job-description";
import { Badge, Button, buttonClass, Callout, Card, CategoryBadge, cx, Icon, SalaryBadge, ScorePill } from "../ui";

/** googleQuota: searches left on Google Jobs, null if unknown, undefined if Google Jobs isn't set up. */
export function JobCard({ job, googleQuota }: { job: JobListItem; googleQuota?: number | null }) {
  const [open, setOpen] = useState(false);
  // The list doesn't carry descriptions; load this one the first time "Details" is opened.
  const [description, setDescription] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const toggleDetails = () => {
    setOpen((o) => !o);
    if (description === null && !loading) startLoading(async () => setDescription(await getJobDescription(job.id)));
  };

  const exp = experienceLabel({ min: job.expMin, max: job.expMax });
  const source = sourceLabel(job);
  const when = job.postedAt ?? job.firstSeenAt;
  const page = `/jobs/${job.id}`;

  return (
    <Card className="lift p-4 sm:p-5">
      {/* Score beside the title; on phones the rest uses the card's full width, on wider screens it lines up under the title. */}
      <div className="flex items-start gap-3 sm:gap-4">
        <ScorePill score={job.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <Link href={page} className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em] decoration-accent/40 underline-offset-4 transition hover:text-accent hover:underline">
                {job.title}
              </Link>
              <p className="mt-0.5 text-sm text-muted">
                {job.company}
                {job.location && ` · ${job.location}`}
                {job.isRemote && " · Remote"}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted" suppressHydrationWarning title={job.postedAt ? "Posted" : "First seen"}>
              {job.postedAt ? "" : "seen "}
              {timeAgo(when)}
            </span>
          </div>
        </div>
      </div>

      <div className="min-w-0 sm:pl-[60px]">

          <FitLine fit={job.fit} reasons={job.fitReasons} className="mt-2.5" />
          {job.descriptionIsPreview && job.fit === "check" && googleQuota !== undefined && (
            <CheckOnGoogle jobId={job.id} quotaLeft={googleQuota} className="mt-2" />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={job.category} />
            <SalaryBadge
              min={job.salaryMinLpa}
              max={job.salaryMaxLpa}
              bucket={job.salaryBucket}
              estimated={job.salaryEstimated}
              ctc={job.mentionsCtc}
            />
            {exp && <Badge tone={job.expFit ? "neutral" : "bad"}>{exp}</Badge>}
            <Badge tone="neutral">{source}</Badge>
            {job.companyUrl && (
              <Badge tone="good">
                <Icon name="check" className="size-3" />
                Official link · {siteLabel(job.companyUrl)}
              </Badge>
            )}
          </div>

          {(job.matchedSkills.length > 0 || job.missingSkills.length > 0) && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {job.matchedSkills.length > 0 && (
                <>
                  <span className="font-medium text-good">You have:</span> {job.matchedSkills.join(", ")}
                </>
              )}
              {job.matchedSkills.length > 0 && job.missingSkills.length > 0 && <span className="mx-1.5">·</span>}
              {job.missingSkills.length > 0 && (
                <>
                  <span className="font-medium">Missing:</span> {job.missingSkills.join(", ")}
                </>
              )}
            </p>
          )}

          <JobActions
            job={job}
            className="mt-4 border-t border-line pt-4 max-sm:[&>*]:grow"
            leading={
              <Link href={`${page}#tailor`} className={buttonClass("primary", "sm")}>
                <Icon name="sparkles" className="size-3.5" />
                Tailor resume
              </Link>
            }
            trailing={
              job.hasDescription && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={toggleDetails}>
                  {open ? "Hide details" : "Details"}
                  <Icon name="chevronDown" className={cx("size-3.5 transition", open && "rotate-180")} />
                </Button>
              )
            }
          />

          {open && (
            <div className="mt-3 rounded-xl bg-surface-2 p-4">
              {job.descriptionIsPreview && (
                <Callout tone="warn" className="mb-3">
                  This source only shared the first part of the description. Open the job page to add the full text.
                </Callout>
              )}
              {description === null ? <p className="text-sm text-muted">Loading…</p> : <JobDescription text={description} />}
              <Link href={page} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                Open the full job page <Icon name="arrowRight" className="size-3.5" />
              </Link>
            </div>
          )}
      </div>
    </Card>
  );
}
