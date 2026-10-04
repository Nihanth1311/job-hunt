"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deleteResumeVersion, saveResumeVersion } from "@/server/actions/resumes";
import { analyzeJob } from "@/shared/core/analyze";
import { extractLatex, isLatex } from "@/shared/core/latex";
import { buildJobPrompt, type JobInput } from "@/shared/core/prompts";
import { formatDateTime } from "@/shared/format";
import { TRACK_LABEL, TRACK_TITLE, TRACKS, type Preferences, type Profile, type Track } from "@/shared/types";
import { useSendToClaude } from "./claude";
import { Badge, Button, buttonClass, Callout, Card, cx, Icon } from "../ui";

export interface ResumeVersionItem {
  id: string;
  label: string;
  track: string;
  createdAt: Date;
}

/**
 * The job page's resume flow, as three plain steps:
 * 1. pick the resume to start from, 2. Claude tailors it, 3. paste back and save as PDF.
 */
export function TailorResume({
  job,
  jobId,
  applicationId,
  profile,
  prefs,
  baseResumes,
  suggestedTrack,
  versions,
  isPreview,
}: {
  job: JobInput;
  jobId: string;
  applicationId: string | null;
  profile: Profile;
  prefs: Preferences;
  baseResumes: Partial<Record<Track, string>>;
  suggestedTrack: Track;
  versions: ResumeVersionItem[];
  isPreview: boolean;
}) {
  const [track, setTrack] = useState<Track>(suggestedTrack);
  const [showMessage, setShowMessage] = useState(false);
  const [result, setResult] = useState("");
  const [name, setName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const claude = useSendToClaude(profile.claudeUrl);

  const hasMaster = profile.masterResume.trim().length > 0;
  const base = baseResumes[track] ?? "";
  const canStart = Boolean(base || hasMaster);
  const analysis = useMemo(() => analyzeJob({ title: job.title, description: job.description }, profile, prefs), [job, profile, prefs]);
  const message = useMemo(
    () => buildJobPrompt("tailor", { job, analysis, track, baseResume: base, profile }),
    [job, analysis, track, base, profile],
  );
  const defaultName = `${TRACK_LABEL[track]} · ${job.company}`;

  const save = () =>
    start(async () => {
      // Keep only the LaTeX if the whole Claude reply was pasted.
      const content = isLatex(result) ? extractLatex(result) : result.trim();
      const id = await saveResumeVersion({ track, content, label: name.trim() || defaultName, jobId, applicationId });
      if (id) {
        setSavedId(id);
        setResult("");
        setName("");
      }
    });

  return (
    <Card id="tailor" className="scroll-mt-6 p-5 sm:p-7">
      <div className="mb-6">
        <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon name="sparkles" className="size-4" />
          </span>
          Tailor your resume for this job
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          One message gives Claude everything: this job, your full master resume, your skills, LinkedIn and GitHub. Claude screens
          you as {job.company || "the company"}&apos;s recruiter, rewrites your experience, and ends with a finished LaTeX resume. No
          questions, a minute or two.
        </p>
      </div>

      {isPreview && (
        <Callout tone="warn" className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span>
            This job only has a short preview, so Claude tailors to that plus what this role usually needs. For the best match, add the
            full description first.
          </span>
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              Open the posting <Icon name="external" className="size-3.5" />
            </a>
          )}
        </Callout>
      )}

      <ol className="space-y-8">
        {/* Step 1 */}
        <Step n={1} title="Choose the role to apply as" done={canStart}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TRACKS.map((t) => {
              const on = t === track;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrack(t)}
                  aria-pressed={on}
                  className={cx(
                    "flex items-start gap-3 rounded-xl border p-3.5 text-left transition",
                    on ? "border-accent bg-accent-soft ring-2 ring-accent/15" : "border-line bg-surface-solid/50 hover:border-line-strong",
                  )}
                >
                  <span className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", on ? "border-accent" : "border-line-strong")}>
                    {on && <span className="size-2 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {TRACK_TITLE[t]}
                      {t === suggestedTrack && <Badge tone="accent">Recommended</Badge>}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">Headline and skill order for {TRACK_LABEL[t]} roles</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!canStart && (
            <Callout tone="bad" className="mt-3">
              Add your resume first: paste it in{" "}
              <Link href="/profile" className="font-medium underline">
                Profile → Master resume
              </Link>
              .
            </Callout>
          )}
          {canStart && (
            <p className="mt-3 text-xs text-muted">
              Claude always works from your full{" "}
              <Link href="/profile" className="font-medium text-accent hover:underline">
                master resume
              </Link>
              , the most up-to-date version. Keep it current there.
            </p>
          )}
        </Step>

        {/* Step 2 */}
        <Step n={2} title="Let Claude tailor it" done={claude.state === "copied"}>
          <div className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm">
            <p className="mb-2 font-medium">What Claude does, in one reply</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                <b className="text-ink">Recruiter screen:</b> a match score out of 100, the top 5 missing keywords, and the 3 red flags a
                hiring manager spots in 10 seconds.
              </li>
              <li>
                <b className="text-ink">Rewrites your experience</b> with Google&apos;s XYZ formula, working those keywords in and removing
                the red flags.
              </li>
              <li>
                <b className="text-ink">The 10-second scan:</b> reads it as an ATS and a hiring manager with 200 resumes, and rewrites
                whatever would get skipped.
              </li>
              <li>
                <b className="text-ink">Build before you apply:</b> job skills you haven&apos;t used yet (say, Azure) go into your personal
                projects, with a short list of exactly what to build first (usually a few hours each) so every line is true.
              </li>
              <li>
                <b className="text-ink">Final resume</b> in LaTeX, with the score before and after.
              </li>
            </ol>
          </div>
          <ol className="mb-4 space-y-1.5 text-sm text-muted">
            <Instruction n="a">
              Click the button. We copy one complete message (this job + your master resume, skills and links) and open Claude.
            </Instruction>
            <Instruction n="b">
              In Claude, press <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd> and then <Kbd>Enter</Kbd>.
            </Instruction>
            <Instruction n="c">
              Read the screen and red flags, then copy Claude&apos;s reply (the whole reply is fine; we keep just the LaTeX) and paste it
              below.
            </Instruction>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!canStart} onClick={() => claude.send(message)}>
              <Icon name="chat" /> {claude.state === "copied" ? "Copy & open Claude again" : "Copy & open Claude"}
            </Button>
            {claude.state === "copied" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-good">
                <Icon name="check" className="size-4" strokeWidth={2.5} /> Copied. Paste it in Claude.
              </span>
            )}
            {claude.state === "failed" && (
              <span className="text-sm text-bad">Couldn&apos;t copy automatically. Open “See the message” and copy it by hand.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowMessage((s) => !s)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            {showMessage ? "Hide the message" : "See the message we send"}
            <Icon name="chevronDown" className={cx("size-3.5 transition", showMessage && "rotate-180")} />
          </button>
          {showMessage && (
            <textarea
              readOnly
              value={message}
              className="field mt-2 min-h-64 font-mono sm:text-[11px] leading-relaxed"
              onFocus={(e) => e.target.select()}
            />
          )}
        </Step>

        {/* Step 3 */}
        <Step n={3} title="Save the final resume" done={versions.length > 0} last>
          <label className="label" htmlFor="tailored">
            Paste Claude&apos;s reply (the LaTeX code)
          </label>
          <textarea
            id="tailored"
            className="field min-h-44 font-mono sm:text-xs leading-relaxed"
            value={result}
            onChange={(e) => {
              setResult(e.target.value);
              setSavedId(null);
            }}
            placeholder={"% Target: " + TRACK_TITLE[track] + "\n\\documentclass[letterpaper,10.5pt]{article}\n…\n\\end{document}"}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="field max-w-64 flex-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Name: ${defaultName}`}
              aria-label="Name for this resume"
            />
            <Button variant="primary" onClick={save} disabled={pending || !result.trim()}>
              {pending ? "Saving…" : "Save resume"}
            </Button>
          </div>
          {savedId && (
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-good">
              <Icon name="check" className="size-4" strokeWidth={2.5} /> Saved.
              <Link href={`/print/resume/${savedId}`} target="_blank" className="font-medium text-accent hover:underline">
                Open it (PDF / Overleaf)
              </Link>
            </p>
          )}

          {versions.length > 0 && (
            <div className="mt-5">
              <p className="label">Saved for this job</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.label}</p>
                      <p className="text-xs text-muted">
                        {TRACK_LABEL[v.track as Track] ?? v.track} · {formatDateTime(v.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/print/resume/${v.id}`} target="_blank" className={buttonClass("secondary", "sm")}>
                        <Icon name="printer" className="size-3.5" /> PDF
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete “${v.label}”?`)) start(() => deleteResumeVersion(v.id));
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Step>
      </ol>
    </Card>
  );
}

function Step({
  n,
  title,
  done,
  last,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-11">
      {!last && <span className="absolute left-[15px] top-9 bottom-[-28px] w-px bg-line" aria-hidden />}
      <span
        className={cx(
          "absolute left-0 top-0 grid size-8 place-items-center rounded-full text-sm font-semibold",
          done ? "bg-good/12 text-good" : "bg-accent-soft text-accent",
        )}
      >
        {done ? <Icon name="check" className="size-4" strokeWidth={2.5} /> : n}
      </span>
      <h3 className="mb-3 pt-1 text-[15px] font-semibold tracking-tight">{title}</h3>
      {children}
    </li>
  );
}

function Instruction({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="font-medium text-ink">{n}.</span>
      <span>{children}</span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">{children}</kbd>;
}
