"use client";

import { useMemo, useState } from "react";
import { analyzeJob } from "@/shared/core/analyze";
import { buildJobPrompt, type JobInput, type PromptMode } from "@/shared/core/prompts";
import type { Preferences, Profile, Track } from "@/shared/types";
import { copyText, safeClaudeUrl } from "./claude";
import { Button, Card, CardTitle, Icon, type IconName } from "../ui";

const HELPERS: { mode: Exclude<PromptMode, "tailor">; icon: IconName; title: string; text: string }[] = [
  { mode: "fit", icon: "check", title: "Am I a good fit?", text: "An honest score, what to highlight, and the real gaps." },
  { mode: "interview", icon: "chat", title: "Prepare for the interview", text: "Likely questions for this role, then a mock interview." },
  { mode: "message", icon: "copy", title: "Cover letter & referral message", text: "A short cover letter and a LinkedIn note to ask for a referral." },
];

/** Quick, one-click questions for Claude about this job. Nothing to save afterwards. */
export function ClaudeHelp({
  job,
  profile,
  prefs,
  track,
  baseResume,
}: {
  job: JobInput;
  profile: Profile;
  prefs: Preferences;
  track: Track;
  baseResume: string;
}) {
  const [sent, setSent] = useState<PromptMode | null>(null);
  const analysis = useMemo(() => analyzeJob({ title: job.title, description: job.description }, profile, prefs), [job, profile, prefs]);
  const url = safeClaudeUrl(profile.claudeUrl);

  const ask = (mode: PromptMode) => {
    const copied = copyText(buildJobPrompt(mode, { job, analysis, track, baseResume, profile }));
    window.open(url, "_blank", "noopener,noreferrer");
    copied.then((ok) => setSent(ok ? mode : null));
  };

  return (
    <Card className="p-5">
      <CardTitle icon="chat">More help from Claude</CardTitle>
      <p className="-mt-2 mb-4 text-xs text-muted">One click each: we copy the question with this job and your resume, then open Claude.</p>
      <ul className="space-y-2">
        {HELPERS.map((h) => (
          <li key={h.mode} className="rounded-xl border border-line p-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                <Icon name={h.icon} className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{h.title}</p>
                <p className="text-xs text-muted">{h.text}</p>
                {sent === h.mode ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-good">
                    <Icon name="check" className="size-3.5" strokeWidth={2.5} /> Copied. In Claude press Ctrl+V, then Enter.
                  </p>
                ) : (
                  <Button size="sm" className="mt-2" onClick={() => ask(h.mode)}>
                    Ask Claude <Icon name="external" className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
