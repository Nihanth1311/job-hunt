"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fetchJobsNow } from "@/actions/jobs";
import type { FetchSummary } from "@/lib/fetcher";
import { Button, Callout, cx, Icon } from "./ui";

export function FetchButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FetchSummary | null>(null);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);

  // A plain request, not a server action: actions queue behind the running fetch.
  const cancel = () => {
    setStopping(true);
    fetch("/api/fetch/cancel", { method: "POST" }).catch(() => setStopping(false));
  };

  const run = () =>
    start(async () => {
      setResult(null);
      setError("");
      setStopping(false);
      try {
        setResult(await fetchJobsNow());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fetch failed");
      }
    });

  const ran = result?.sources.filter((s) => s.status === "ok") ?? [];
  const checked = ran.reduce((n, s) => n + s.fetched, 0);
  const failed = result?.sources.filter((s) => s.status === "error" && s.message !== "Cancelled") ?? [];
  const notSetUp = result?.sources.filter((s) => s.status === "skipped" && s.message === "Not set up") ?? [];
  const noSearchSources = notSetUp.some((s) => s.id === "jsearch");

  return (
    <>
      <Button variant={variant} disabled={pending} onClick={run}>
        {pending ? (
          <>
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Fetching…
          </>
        ) : (
          <>
            <Icon name="refresh" /> Fetch now
          </>
        )}
      </Button>

      {/* Fixed toast: never pushes the layout around or gets clipped on small screens. */}
      {(pending || result || error) && (
        <div
          role="status"
          className="panel-raised fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 md:bottom-4 rounded-xl p-4 text-sm sm:left-auto sm:right-6 sm:w-[26rem]"
        >
          {pending ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="flex-1">
                {stopping
                  ? "Stopping… finishing the step it's on."
                  : "Checking ~90 company careers sites and your other sources… this can take a few minutes."}
              </p>
              <Button size="sm" variant="ghost" className="-my-1 shrink-0" disabled={stopping} onClick={cancel}>
                {stopping ? "Stopping…" : "Cancel"}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className={cx("font-semibold", error || failed.length ? "text-bad" : result!.inserted ? "text-good" : "")}>
                  {error
                    ? "Fetch failed"
                    : result!.cancelled
                      ? `Fetch cancelled${result!.inserted ? ` · ${result!.inserted} new job${result!.inserted === 1 ? "" : "s"} added before stopping` : ""}`
                      : result!.inserted
                      ? `${result!.inserted} new job${result!.inserted === 1 ? "" : "s"} added`
                      : "No new jobs this time"}
                </p>
                <button
                  type="button"
                  aria-label="Close"
                  className="-m-1 grid size-7 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                  onClick={() => {
                    setResult(null);
                    setError("");
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>

              {error && <p className="mt-1 text-bad">{error}</p>}
              {result && (
                <p className="mt-1 text-muted">
                  Checked {checked} posting{checked === 1 ? "" : "s"} from {ran.length} source{ran.length === 1 ? "" : "s"}.
                  {result.inserted === 0 && checked > 0 && " Everything found is already in your feed."}{" "}
                  Jobs that don&apos;t match your filters stay hidden; the line above the list shows how many and why.
                </p>
              )}

              {result && (
                <ul className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs">
                  {result.sources.map((s) => (
                    <li key={s.id} className="flex justify-between gap-3">
                      <span className="text-muted">{s.label}</span>
                      <span
                        className={cx("shrink-0", s.status === "error" ? "text-bad" : s.status === "skipped" ? "text-muted" : "text-good")}
                        title={s.message}
                      >
                        {s.status === "ok"
                          ? `${s.fetched} checked, +${s.inserted}`
                          : s.status === "skipped"
                            ? s.message === "Not set up"
                              ? "not set up"
                              : "skipped"
                            : "error"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {failed.map((s) => (
                <p key={s.id} className="mt-2 text-xs text-bad">
                  {s.label}: {s.message}
                </p>
              ))}

              {noSearchSources && (
                <Callout className="mt-3">
                  Most 0–2 yr roles come from Google Jobs. Add a free key to get them —{" "}
                  <Link href="/settings#keys" className="font-medium text-accent underline">
                    add it in Settings
                  </Link>
                  .
                </Callout>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
