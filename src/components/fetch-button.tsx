"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchStatus, FetchSummary } from "@/lib/fetcher";
import { Button, Callout, cx, Icon } from "./ui";

const POLL_MS = 3000;
/** A finished fetch you haven't seen yet is shown when you come back within this long. */
const SHOW_UNSEEN_MS = 15 * 60_000;
const SEEN_KEY = "jh:fetchSeen";
// Per device: which fetch result was already shown here. Storage can be unavailable; then it's just shown again.
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const markSeen = (startedAt: string) => {
  try {
    localStorage.setItem(SEEN_KEY, startedAt);
  } catch {}
};

/**
 * "Fetch now". The fetch runs on the server; this only starts it and then asks how it's going
 * every few seconds. Nothing waits on a long request, so leaving the app (which cuts requests
 * off on phones) can't make a good fetch look failed: on coming back it just asks again.
 */
export function FetchButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  /** When the fetch we're showing started; null when none is running. */
  const [running, setRunning] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState<FetchSummary | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const since = useRef<string | null>(null);
  const pending = starting || running !== null;

  const check = useCallback(async () => {
    let s: FetchStatus;
    try {
      const res = await fetch("/api/fetch", { cache: "no-store" });
      if (!res.ok) return;
      s = await res.json();
    } catch {
      return; // offline or the app was in the background: ask again on the next tick
    }
    if (s.running) {
      since.current ??= s.running;
      setRunning(s.running);
      return;
    }
    // Nothing of ours running here. But a phone often reloads an app that was in the background:
    // if your last fetch ended in the last few minutes and you haven't seen how, show it now.
    if (!since.current) {
      const l = s.last;
      if (!l || Date.now() - new Date(l.finishedAt).getTime() > SHOW_UNSEEN_MS || readSeen() === l.startedAt) return;
      since.current = l.startedAt;
    }
    const last = s.last && s.last.startedAt >= since.current ? s.last : null;
    if (last) markSeen(last.startedAt);
    since.current = null;
    setRunning(null);
    setStopping(false);
    setResult(last?.summary ?? null);
    setError(last?.error ?? "");
    setDone(true);
    router.refresh();
  }, [router]);

  // Opening the page (or coming back to the app) while a fetch is running shows it again.
  useEffect(() => {
    const first = setTimeout(() => void check(), 0);
    const onShow = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [check]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(t);
  }, [running, check]);

  // A plain request, like the others here: nothing queues behind the running fetch.
  const cancel = () => {
    setStopping(true);
    fetch("/api/fetch/cancel", { method: "POST" }).catch(() => setStopping(false));
  };

  const run = async () => {
    setResult(null);
    setError("");
    setDone(false);
    setStopping(false);
    setStarting(true);
    try {
      const res = await fetch("/api/fetch", { method: "POST" });
      if (!res.ok) throw new Error();
      const { startedAt } = (await res.json()) as { startedAt: string };
      since.current = startedAt;
      setRunning(startedAt);
    } catch {
      setError("Couldn't start the fetch. Check your connection and try again.");
      setDone(true);
    } finally {
      setStarting(false);
    }
  };

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
      {(pending || done) && (
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
                <p className={cx("font-semibold", error || failed.length ? "text-bad" : result?.inserted ? "text-good" : "")}>
                  {error
                    ? "Fetch failed"
                    : !result
                      ? "Fetch finished"
                      : result.cancelled
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
                    setDone(false);
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
