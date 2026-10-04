"use client";

import { useState, useTransition } from "react";
import { saveFullDescription } from "@/server/actions/jobs";
import { Button } from "../ui";

/** Paste the complete description (e.g. when the source only gave a preview). Re-matches the job on save. */
export function FullDescriptionForm({ jobId, onDone, cta = "Save full description" }: { jobId: string; onDone?: () => void; cta?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <div>
      <textarea
        className="field min-h-48 sm:text-sm leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Open the posting, select the whole job description, copy it, and paste it here…"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const err = await saveFullDescription(jobId, text);
              if (err) setError(err);
              else {
                setText("");
                setError("");
                onDone?.();
              }
            })
          }
        >
          {pending ? "Saving…" : cta}
        </Button>
        <span className="text-xs text-muted">Skills, experience and salary are re-checked against the full text.</span>
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}
