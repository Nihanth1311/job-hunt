"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveBaseResume } from "@/server/actions/resumes";
import { extractLatex, isLatex } from "@/shared/core/latex";
import { buildBaseResumePrompt } from "@/shared/core/prompts";
import { TRACK_TITLE, TRACKS, type Profile, type Track } from "@/shared/types";
import { uploadResume } from "../../api/requests";
import { useSendToClaude } from "./claude";
import { Button, Callout, Card, cx, Icon, Segmented, segmentClass } from "../ui";

type Way = "upload" | "latex" | "claude";

/** Add (or replace) the resume for one role type: upload a PDF, paste LaTeX, or have Claude write it. */
export function AddResume({
  track: initialTrack,
  has,
  profile,
  onDone,
}: {
  track: Track;
  /** Role types that already have a resume (saving replaces it). */
  has: Track[];
  profile: Profile;
  onDone: () => void;
}) {
  const [track, setTrack] = useState<Track>(initialTrack);
  const [way, setWay] = useState<Way>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [latex, setLatex] = useState("");
  const [error, setError] = useState<{ text: string; canForce: boolean } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const claude = useSendToClaude(profile.claudeUrl);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError({ text: "Choose a PDF file.", canForce: false });
    setFile(f);
  };

  const save = (anyway = false) =>
    start(async () => {
      setError(null);
      if (way === "upload") {
        if (!file) return;
        const out = await uploadResume(file, track);
        if ("error" in out) return setError({ text: out.error, canForce: false });
        router.refresh();
      } else {
        const out = await saveBaseResume(track, extractLatex(latex), { anyway });
        if (out && "error" in out) return setError({ text: out.error, canForce: true });
      }
      onDone();
    });

  const latexReady = isLatex(latex);
  const canSave = way === "upload" ? !!file : latexReady;

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-[15px] font-semibold tracking-tight">Add a resume for</h3>
        <select className="field h-9 w-auto py-0 text-sm" value={track} onChange={(e) => setTrack(e.target.value as Track)}>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {TRACK_TITLE[t]}
              {has.includes(t) ? " (replaces current)" : ""}
            </option>
          ))}
        </select>
      </div>

      <Segmented className="mb-4 max-w-full overflow-x-auto">
        {(
          [
            ["upload", "Upload PDF"],
            ["latex", "Paste LaTeX"],
            ["claude", "Write with Claude"],
          ] as const
        ).map(([w, label]) => (
          <button
            key={w}
            type="button"
            className={segmentClass(way === w)}
            onClick={() => {
              setWay(w);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </Segmented>

      {way === "upload" && (
        <>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cx(
              "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition",
              drag ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent hover:bg-surface-2",
            )}
          >
            <Icon name={file ? "document" : "download"} className={cx("size-5", file ? "text-accent" : "rotate-180 text-muted")} />
            {file ? (
              <>
                <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted">{Math.max(1, Math.round(file.size / 1024))} KB · click to choose another</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Drop your resume PDF here, or click to choose it</span>
                <span className="text-xs text-muted">Up to 5 MB. Its text is kept too, so Claude can read it when tailoring.</span>
              </>
            )}
          </button>
        </>
      )}

      {way === "latex" && (
        <>
          <textarea
            className="field min-h-56 font-mono leading-relaxed sm:text-xs"
            value={latex}
            onChange={(e) => {
              setLatex(e.target.value);
              setError(null);
            }}
            placeholder={"\\documentclass[letterpaper,10.5pt]{article}\n…\n\\begin{document}\n…\n\\end{document}"}
          />
          <p className="mt-1.5 text-xs text-muted">
            The whole document, from <code>\documentclass</code> to <code>\end{"{document}"}</code>. It&apos;s turned into a PDF when you save.
          </p>
        </>
      )}

      {way === "claude" &&
        (!profile.masterResume.trim() ? (
          <Callout tone="bad">
            Claude builds this from your master resume. Add it first in{" "}
            <Link href="/profile" className="font-medium underline">
              Profile
            </Link>
            .
          </Callout>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm">
                <b>1.</b> Claude gets your master resume, skills and links, and replies with a finished {TRACK_TITLE[track]} resume in LaTeX.
                Paste with Ctrl+V, then Enter.
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
                <b>2.</b> Paste Claude&apos;s reply here:
              </p>
              <textarea
                className="field min-h-44 font-mono leading-relaxed sm:text-xs"
                value={latex}
                onChange={(e) => {
                  setLatex(e.target.value);
                  setError(null);
                }}
                placeholder={"% Target: " + TRACK_TITLE[track] + " (base resume)\n\\documentclass[letterpaper,10.5pt]{article}\n…"}
              />
            </div>
          </div>
        ))}

      {error && (
        <Callout tone="bad" className="mt-4">
          {error.text}
          {error.canForce && (
            <>
              {" "}
              <button type="button" className="font-medium underline" disabled={pending} onClick={() => save(true)}>
                Save anyway
              </button>{" "}
              (no PDF until it&apos;s fixed).
            </>
          )}
        </Callout>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={pending || !canSave} onClick={() => save()}>
          {pending ? (way === "upload" ? "Uploading…" : "Making the PDF…") : "Save resume"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        {way !== "upload" && latex.trim() && !latexReady && (
          <span className="text-xs text-warn">That doesn&apos;t look like a LaTeX document yet (no \documentclass).</span>
        )}
      </div>
    </Card>
  );
}
