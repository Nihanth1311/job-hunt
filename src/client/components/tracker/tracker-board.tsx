"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveApplication } from "@/server/actions/applications";
import type { Application } from "@/shared/types";
import { formatDate, isOverdue, timeAgo } from "@/shared/format";
import { APP_STATUSES, STATUS_LABEL, type AppStatus } from "@/shared/types";
import { Badge, cx, TrackBadge } from "../ui";

const COLUMN_TONE: Record<AppStatus, string> = {
  saved: "bg-muted",
  applied: "bg-cat-frontend",
  assessment: "bg-cat-fullstack",
  interview: "bg-warn",
  offer: "bg-good",
  rejected: "bg-bad",
};

export function TrackerBoard({ applications }: { applications: Application[] }) {
  const [, start] = useTransition();
  const [apps, moveLocal] = useOptimistic(applications, (state, { id, status }: { id: string; status: AppStatus }) =>
    state.map((a) => (a.id === id ? { ...a, status } : a)),
  );
  const [dragOver, setDragOver] = useState<AppStatus | null>(null);
  // Phones: one stage at a time, starting with the first one that has something in it.
  const [stage, setStage] = useState<AppStatus>(() => APP_STATUSES.find((st) => applications.some((a) => a.status === st)) ?? "saved");

  const move = (id: string, status: AppStatus) =>
    start(async () => {
      moveLocal({ id, status });
      await moveApplication(id, status);
    });

  const inStage = apps.filter((a) => a.status === stage);

  return (
    <>
      {/* Phones: stage tabs, then that stage's cards at full width. Touch can't drag, so cards move with "Move to". */}
      <div className="md:hidden">
        <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {APP_STATUSES.map((st) => {
            const n = apps.filter((a) => a.status === st).length;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStage(st)}
                aria-pressed={stage === st}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                  stage === st ? "border-ink bg-ink text-bg" : "border-line text-muted",
                )}
              >
                <span className={cx("size-1.5 rounded-full", COLUMN_TONE[st])} />
                {STATUS_LABEL[st]}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {inStage.map((a) => (
            <article key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <AppCardBody app={a} onMove={(st) => move(a.id, st)} />
            </article>
          ))}
          {inStage.length === 0 && (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-sm text-muted">
              Nothing in {STATUS_LABEL[stage]} yet.
            </p>
          )}
        </div>
      </div>

      <div className="hidden pb-4 md:block md:overflow-x-auto">
      <div className="grid min-w-[960px] grid-cols-6 gap-3">
        {APP_STATUSES.map((status) => {
          const items = apps.filter((a) => a.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, status);
              }}
              className={cx(
                "flex min-h-80 flex-col rounded-xl border border-line bg-surface-2 p-2.5 transition",
                dragOver === status && "!border-accent/50 !bg-accent-soft",
              )}
            >
              <header className="mb-3 flex items-center gap-2 px-1.5 pt-1">
                <span className={cx("size-2 rounded-full ring-4 ring-surface-2", COLUMN_TONE[status])} />
                <h2 className="text-sm font-medium">{STATUS_LABEL[status]}</h2>
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">{items.length}</span>
              </header>
              <div className="flex flex-col gap-2">
                {items.map((a) => (
                  <article
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                    className="cursor-grab rounded-lg border border-line bg-surface-solid p-3 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow)] active:cursor-grabbing"
                  >
                    <AppCardBody app={a} onMove={(st) => move(a.id, st)} />
                  </article>
                ))}
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line-strong px-2 py-8 text-center text-xs text-muted">Drop here</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      </div>
    </>
  );
}

/** Company, role, resume, follow-up and a "Move to" menu: the same on the board and the phone list. */
function AppCardBody({ app: a, onMove }: { app: Application; onMove: (status: AppStatus) => void }) {
  return (
    <>
      <Link href={`/tracker/${a.id}`} className="block">
        <p className="text-sm font-semibold leading-snug tracking-tight transition hover:text-accent">{a.company}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.title}</p>
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <TrackBadge track={a.track} />
        {a.followUpAt && !["offer", "rejected", "saved"].includes(a.status) && (
          <Badge
            tone={isOverdue(a.followUpAt) ? "bad" : "neutral"}
          >
            <span suppressHydrationWarning>
              {isOverdue(a.followUpAt) ? "Follow up now" : `Follow up ${formatDate(a.followUpAt)}`}
            </span>
          </Badge>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2.5">
        <span className="whitespace-nowrap text-[11px] text-muted" suppressHydrationWarning>
          {a.appliedAt ? `Applied ${timeAgo(a.appliedAt)}` : `Saved ${timeAgo(a.createdAt)}`}
        </span>
        <select
          aria-label="Move to"
          value={a.status}
          onChange={(e) => onMove(e.target.value as AppStatus)}
          className="cursor-pointer rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-base text-ink outline-none transition hover:text-ink focus:ring-2 focus:ring-accent/20 md:px-1.5 md:py-0.5 md:text-[11px] md:text-muted"
        >
          {APP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
