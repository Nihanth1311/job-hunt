"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveBaseResume } from "@/actions/resumes";
import { extractLatex, isLatex } from "@/lib/core/latex";
import { stripFences } from "@/lib/core/markdown";
import { buildBaseResumePrompt } from "@/lib/core/prompts";
import { formatDate } from "@/lib/format";
import { TRACK_TITLE, type Profile, type Track } from "@/lib/types";
import { useSendToClaude } from "./claude";
import { Badge, Button, buttonClass, Callout, Card, Icon } from "./ui";

type Mode = "view" | "claude" | "edit";

/** One role type's base resume: see it, make it with Claude, or edit it by hand. */
export function BaseResumeCard({
  track,
  base,
  profile,
}: {
  track: Track;
  base: { id: string; content: string; createdAt: Date } | null;
  profile: Profile;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const claude = useSendToClaude(profile.claudeUrl);
  const hasMaster = profile.masterResume.trim().length > 0;

  const open = (m: Mode) => {
    setDraft(m === "edit" ? (base?.content ?? "") : "");
    claude.reset();
    setMode(m);
  };
  const save = () =>
    start(async () => {
      await saveBaseResume(track, isLatex(draft) ? extractLatex(draft) : stripFences(draft));
      setMode("view");
    });

  const preview = (base?.content ?? "")
    .split("\n")
    .map((l) => l.replace(/^[#*\-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">{TRACK_TITLE[track]}</h3>
          <p className="mt-0.5 text-xs text-muted">{base ? `Updated ${formatDate(base.createdAt)}` : "Not created yet"}</p>
        </div>
        {base ? (
          <Badge tone="good">
            <Icon name="check" className="size-3" /> Ready
          </Badge>
        ) : (
          <Badge tone="neutral">Missing</Badge>
        )}
      </div>

      {mode === "view" && (
        <>
          {base ? (
            <div className="mt-4 flex-1 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              {preview.map((l, i) => (
                <p key={i} className={i === 0 ? "font-medium text-ink" : "truncate"}>
                  {l}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-4 flex-1 text-sm text-muted">
              Jobs that need a {TRACK_TITLE[track]} will use your master resume until you create this one.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {base ? (
              <>
                <Link href={`/print/resume/${base.id}`} target="_blank" className={buttonClass("secondary", "sm")}>
                  <Icon name="printer" className="size-3.5" /> PDF
                </Link>
                <Button size="sm" onClick={() => open("edit")}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => open("claude")}>
                  <Icon name="sparkles" className="size-3.5" /> Redo with Claude
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="primary" onClick={() => open("claude")}>
                  <Icon name="sparkles" className="size-3.5" /> Create with Claude
                </Button>
                <Button size="sm" variant="ghost" onClick={() => open("edit")}>
                  Write it myself
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {mode === "claude" && (
        <div className="mt-4 space-y-4">
          {!hasMaster ? (
            <Callout tone="bad">
              Claude builds this from your master resume. Add it first in{" "}
              <Link href="/profile" className="font-medium underline">
                Profile
              </Link>
              .
            </Callout>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm">
                  <b>1.</b> Claude gets your master resume, skills and links, and replies with a finished {TRACK_TITLE[track]} resume in
                  LaTeX. No questions. Paste with Ctrl+V, then Enter.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="primary" onClick={() => claude.send(buildBaseResumePrompt(track, profile))}>
                    <Icon name="chat" className="size-3.5" /> Copy &amp; open Claude
                  </Button>
                  {claude.state === "copied" && (
                    <span className="inline-flex items-center gap-1 text-xs text-good">
                      <Icon name="check" className="size-3.5" strokeWidth={2.5} /> Copied
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm">
                  <b>2.</b> Paste Claude&apos;s reply (the LaTeX code) here:
                </p>
                <textarea
                  className="field min-h-44 font-mono sm:text-xs leading-relaxed"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={"% Target: " + TRACK_TITLE[track] + " (base resume)\n\\documentclass[letterpaper,10.5pt]{article}\n…"}
                />
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={pending || !draft.trim()} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <div className="mt-4 space-y-3">
          <textarea
            className="field min-h-72 font-mono sm:text-xs leading-relaxed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`# Your Name\n${TRACK_TITLE[track]}\n\n## Skills\n…`}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={pending || !draft.trim() || draft === base?.content} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
