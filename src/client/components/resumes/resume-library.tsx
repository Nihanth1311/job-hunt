"use client";

import { useState } from "react";
import { TRACK_LABEL, TRACKS, type Profile, type ResumeKind, type Track } from "@/shared/types";
import { AddResume } from "./add-resume";
import { BaseResumeCard } from "./base-resume-card";
import { Button, Icon } from "../ui";

export interface BaseResume {
  id: string;
  kind: ResumeKind;
  content: string;
  createdAt: Date;
}

/** Your base resumes, one per role type, and the panel to add or replace one. */
export function ResumeLibrary({ bases, profile }: { bases: Partial<Record<Track, BaseResume>>; profile: Profile }) {
  const has = TRACKS.filter((t) => bases[t]);
  const missing = TRACKS.filter((t) => !bases[t]);
  // With no resume yet, the panel starts open: it's the only thing to do here.
  const [adding, setAdding] = useState<Track | null>(has.length ? null : "fullstack");

  const add = (t: Track) => {
    setAdding(t);
    requestAnimationFrame(() => document.getElementById("add-resume")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your resumes</h2>
          <p className="mt-0.5 text-sm text-muted">One per role type. Tailoring a job starts from the matching one.</p>
        </div>
        {!adding && (
          <Button variant="primary" size="sm" onClick={() => add(missing[0] ?? "fullstack")}>
            <Icon name="plus" className="size-3.5" /> Add resume
          </Button>
        )}
      </div>

      <div id="add-resume" className="scroll-mt-4">
        {adding && <AddResume key={adding} track={adding} has={has} profile={profile} onDone={() => setAdding(null)} />}
      </div>

      {has.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {has.map((t) => (
            <BaseResumeCard key={bases[t]!.id} track={t} base={bases[t]!} onReplace={() => add(t)} />
          ))}
        </div>
      )}

      {missing.length > 0 && has.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>No resume yet for</span>
          {missing.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] text-ink transition hover:border-accent hover:text-accent"
            >
              <Icon name="plus" className="size-3" /> {TRACK_LABEL[t]}
            </button>
          ))}
          <span className="basis-full text-xs sm:basis-auto">Those jobs use your master resume until then.</span>
        </div>
      )}
    </section>
  );
}
