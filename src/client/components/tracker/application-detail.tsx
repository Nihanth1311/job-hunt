"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addApplicationNote,
  deleteApplication,
  moveApplication,
  updateApplicationDetails,
} from "@/server/actions/applications";
import type { Application, ApplicationEvent, ResumeVersion } from "@/shared/types";
import { formatDateTime, toDateInput } from "@/shared/format";
import { APP_STATUSES, STATUS_LABEL, TRACK_LABEL, TRACKS, type AppStatus } from "@/shared/types";
import { isLatex } from "@/shared/core/latex";
import { ResumeButtons } from "../resumes/tailor-resume";
import { Button, buttonClass, Card, CardTitle, cx, Icon, TrackBadge } from "../ui";

export function ApplicationDetail({
  app,
  events,
  resumes,
  jobId,
  description,
}: {
  app: Application;
  events: ApplicationEvent[];
  resumes: ResumeVersion[];
  jobId: string | null;
  description: string;
}) {
  const [pending, start] = useTransition();
  const [details, setDetails] = useState({
    followUpAt: toDateInput(app.followUpAt),
    notes: app.notes,
    track: app.track,
    url: app.url,
  });
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [showJd, setShowJd] = useState(false);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <p className="label">Status</p>
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1 sm:inline-flex">
          {APP_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => start(() => moveApplication(app.id, s))}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm transition",
                app.status === s
                  ? "bg-accent font-medium text-accent-ink shadow-[var(--shadow-sm)]"
                  : "text-muted hover:bg-surface-solid hover:text-ink",
              )}
            >
              {STATUS_LABEL[s as AppStatus]}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle icon="info">Details</CardTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="follow">Follow up on</label>
                <input
                  id="follow"
                  type="date"
                  className="field"
                  value={details.followUpAt}
                  onChange={(e) => setDetails((d) => ({ ...d, followUpAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="track">Resume used</label>
                <select
                  id="track"
                  className="field"
                  value={details.track}
                  onChange={(e) => setDetails((d) => ({ ...d, track: e.target.value }))}
                >
                  {TRACKS.map((t) => (
                    <option key={t} value={t}>
                      {TRACK_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="url">Link</label>
                <input id="url" className="field" value={details.url} onChange={(e) => setDetails((d) => ({ ...d, url: e.target.value }))} />
              </div>
            </div>
            <label className="label mt-3" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="field min-h-28"
              value={details.notes}
              onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Recruiter name, salary discussed, referral, interview rounds…"
            />
            <div className="mt-3 flex items-center gap-3">
              <Button
                variant="primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await updateApplicationDetails(app.id, { ...details, followUpAt: details.followUpAt || null });
                    setSaved(true);
                  })
                }
              >
                Save
              </Button>
              {saved && (
                <span className="inline-flex items-center gap-1 text-xs text-good">
                  <Icon name="check" className="size-3.5" /> Saved
                </span>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <CardTitle icon="calendar">Timeline</CardTitle>
            <div className="mb-4 flex gap-2">
              <input
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an update, e.g. “HR call scheduled Friday”"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && note.trim()) {
                    start(() => addApplicationNote(app.id, note));
                    setNote("");
                  }
                }}
              />
              <Button
                disabled={!note.trim() || pending}
                onClick={() => {
                  start(() => addApplicationNote(app.id, note));
                  setNote("");
                }}
              >
                Add
              </Button>
            </div>
            <ol className="relative ml-1 space-y-4 border-l border-line-strong pl-5">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span
                    className={cx(
                      "absolute -left-[6px] mt-1 size-3 rounded-full ring-4 ring-surface-solid",
                      e.type === "note" ? "bg-accent" : "bg-muted/60",
                    )}
                  />
                  <p>{e.message}</p>
                  <p className="mt-0.5 text-xs text-muted">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle icon="sparkles">Resumes for this job</CardTitle>
            {resumes.length === 0 ? (
              <p className="text-sm text-muted">No saved version yet.</p>
            ) : (
              <ul className="space-y-2">
                {resumes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-2.5">
                    <div className="min-w-0">
                      <p className="mb-1 truncate text-sm font-medium">{r.label}</p>
                      <TrackBadge track={r.track} />
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <ResumeButtons id={r.id} title={r.label} pdf={isLatex(r.content)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {jobId && (
              <Link href={`/jobs/${jobId}#tailor`} className={cx(buttonClass("primary", "sm"), "mt-4 w-full")}>
                <Icon name="sparkles" className="size-3.5" />
                Tailor / ask Claude about this job
              </Link>
            )}
          </Card>

          {description && (
            <Card className="p-5">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-[15px] font-semibold tracking-tight transition hover:text-accent"
                onClick={() => setShowJd((s) => !s)}
              >
                Job description
                <Icon name="chevronDown" className={cx("transition", showJd && "rotate-180")} />
              </button>
              {showJd && (
                <div className="mt-4 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-4 text-sm leading-relaxed">
                  {description}
                </div>
              )}
            </Card>
          )}

          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm("Delete this application and its timeline?")) start(() => deleteApplication(app.id));
            }}
          >
            <Icon name="trash" className="size-3.5" /> Delete application
          </Button>
        </div>
      </div>
    </div>
  );
}
