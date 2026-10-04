"use client";

import { useState, useTransition } from "react";
import { checkWithGoogleJobs, type CheckResult } from "@/server/actions/jobs";
import { Button, cx, Icon } from "../ui";

const VERDICT_TEXT: Record<string, string> = {
  fit: "Ready to apply ✓",
  check: "Still needs a look",
  no: "Not a fit",
};

/** "Check on Google Jobs": swaps a short preview for the full description and re-checks the fit. */
export function CheckOnGoogle({ jobId, quotaLeft, className }: { jobId: string; quotaLeft: number | null; className?: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CheckResult | null>(null);

  if (result?.ok) {
    return (
      <p className={cx("inline-flex flex-wrap items-center gap-1.5 text-xs", result.fit === "fit" ? "text-good" : "text-muted", className)}>
        <Icon name="check" className="size-3.5" strokeWidth={2.5} />
        Full description found. Now: <b>{VERDICT_TEXT[result.fit] ?? result.fit}</b>
        {result.reasons[0] && <span className="text-muted">· {result.reasons[0]}</span>}
      </p>
    );
  }

  return (
    <div className={cx("inline-flex flex-wrap items-center gap-2", className)}>
      <Button size="sm" disabled={pending} onClick={() => start(async () => setResult(await checkWithGoogleJobs(jobId)))}>
        {pending ? (
          <>
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Checking…
          </>
        ) : (
          <>
            <Icon name="search" className="size-3.5" /> Check on Google Jobs
          </>
        )}
      </Button>
      {result && !result.ok ? (
        <span className="text-xs text-bad">{result.message}</span>
      ) : (
        quotaLeft !== null && <span className="text-xs text-muted">Uses 1 of {quotaLeft} free searches left</span>
      )}
    </div>
  );
}
