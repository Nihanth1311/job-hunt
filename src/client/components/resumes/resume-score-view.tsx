"use client";

import { useState } from "react";
import { scoreTone, WEIGHTS, type ResumeScore, type SkillCheck } from "@/shared/core/resume-score";
import { cx, Icon } from "../ui";

const RING = { good: "text-good ring-good/30 bg-good/10", warn: "text-warn ring-warn/30 bg-warn/10", bad: "text-bad ring-bad/30 bg-bad/10" };
const BAR = { good: "bg-good", warn: "bg-warn", bad: "bg-bad" };

const PART_LABEL: Record<keyof typeof WEIGHTS, string> = {
  skills: "Skills, and proof you used them",
  experience: "Experience",
  role: "Same kind of role",
  impact: "Results in your bullets",
  format: "ATS can read it",
  education: "Education",
};

/** The score as a small round badge. */
export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return null;
  return (
    <span
      title="Resume score: how an ATS and a recruiter would rate this resume for this job"
      className={cx("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums ring-1 ring-inset", RING[scoreTone(score)], className)}
    >
      {score}
    </span>
  );
}

/** Under a saved resume: the top tip, and the full breakdown on demand. */
export function ScoreHint({ result }: { result: ResumeScore }) {
  const [open, setOpen] = useState(false);
  if (result.score === null) return null;
  return (
    <>
      <p className="mt-0.5 text-xs text-muted">
        <span className="line-clamp-1">{result.cappedBy ?? result.notes[0] ?? "Strong match for this job"}</span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium text-accent hover:underline">
          {open ? "Hide details" : "Why this score?"}
        </button>
      </p>
      {open && <ResumeScoreCard result={result} isPreview={false} />}
    </>
  );
}

/** The full breakdown: shown live while you paste, and under a saved resume on request. */
export function ResumeScoreCard({ result, isPreview }: { result: ResumeScore; isPreview: boolean }) {
  if (result.score === null) {
    return (
      <div className="mt-3 rounded-xl border border-line p-4 text-xs text-muted">
        <b className="text-ink">Resume score:</b> this posting doesn&apos;t name skills we can check for.
      </div>
    );
  }
  const { experience: e } = result;
  return (
    <div className="mt-3 rounded-xl border border-line p-4">
      <div className="flex items-center gap-3">
        <ScoreBadge score={result.score} className="size-12 text-base" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Resume score</p>
          <p className="text-xs text-muted">
            How an ATS and a recruiter would rate this resume for this job. Salary isn&apos;t counted.
            {isPreview && " Based on a short preview of the job."}
          </p>
        </div>
      </div>

      {result.cappedBy && (
        <p className="mt-3 rounded-lg bg-bad/8 px-3 py-2 text-xs text-bad ring-1 ring-inset ring-bad/20">
          <b>Capped:</b> {result.cappedBy}. Screening filters usually stop here.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => {
          const got = result.parts[k];
          const share = got / WEIGHTS[k];
          return (
            <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted">{PART_LABEL[k]}</span>
              <span className="tabular-nums text-muted">
                <b className="text-ink">{Math.round(got)}</b>/{WEIGHTS[k]}
              </span>
              <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={cx("block h-full rounded-full transition-[width] duration-500", BAR[share >= 0.75 ? "good" : share >= 0.5 ? "warn" : "bad"])}
                  style={{ width: `${Math.max(3, share * 100)}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>

      {result.skills.required.length > 0 && <SkillRow title="Must-haves" items={result.skills.required} />}
      {result.skills.other.length > 0 && <SkillRow title="Also mentioned" items={result.skills.other} />}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        <Legend className="bg-good" label="used in a job or project" />
        <Legend className="bg-warn" label="only listed" />
        <Legend className="bg-bad" label="missing" />
      </p>

      <p className="mt-4 flex gap-2 text-xs leading-relaxed">
        <Icon name="calendar" className="mt-0.5 size-3.5 shrink-0 text-muted" />
        <span>
          {e.asked ? `Asks for ${e.asked}. ` : "The posting doesn't say how much experience. "}
          {e.fromProfile
            ? `No dates found in the resume, so your Profile's ${e.years} yrs was used.`
            : `Your resume shows ${e.years} yrs, ${e.relevantYears} in relevant roles.`}
        </span>
      </p>

      {result.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
          {result.notes.map((n) => (
            <li key={n} className="flex gap-2 leading-relaxed">
              <Icon name="arrowRight" className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHIP: Record<SkillCheck["shown"], string> = {
  recent: "bg-good/10 text-good ring-good/25",
  work: "bg-good/10 text-good ring-good/25",
  project: "bg-good/10 text-good ring-good/25",
  listed: "bg-warn/10 text-warn ring-warn/25",
  no: "bg-bad/8 text-bad ring-bad/20",
};
const SHOWN_TITLE: Record<SkillCheck["shown"], string> = {
  recent: "Used in your most recent job",
  work: "Used in an earlier job",
  project: "Shown in a project",
  listed: "Only in your Skills list",
  no: "Not in the resume",
};

function SkillRow({ title, items }: { title: string; items: SkillCheck[] }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-medium">{title}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((s) => (
          <span
            key={s.name}
            title={`${SHOWN_TITLE[s.shown]}${s.via ? ` (as ${s.via})` : ""}${s.shown === "no" ? (s.known ? " (it's in your Profile skills)" : " (not in your Profile skills)") : ""}`}
            className={cx("rounded-md px-1.5 py-0.5 text-[11.5px] ring-1 ring-inset", CHIP[s.shown])}
          >
            {s.name}
            {s.shown === "no" && s.known && " +"}
          </span>
        ))}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cx("size-2 rounded-full", className)} /> {label}
    </span>
  );
}
