"use client";

import { useEffect, useRef, useState } from "react";
import { API } from "../../api/endpoints";
import { Button, cx, Icon, Spinner } from "../ui";

type State = { step: "idle" } | { step: "busy" } | { step: "done"; fileName: string } | { step: "failed"; error: string };

/**
 * Download a resume PDF, and show it happening: the button spins while the file comes in, a
 * check pops in when it's saved, and a notice with the file name slides up from the bottom.
 * (A plain download link gives no sign at all on most phones.)
 */
export function DownloadButton({
  id,
  variant = "secondary",
  size = "sm",
  iconOnly = false,
}: {
  id: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const [state, setState] = useState<State>({ step: "idle" });
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const download = async () => {
    timers.current.forEach(clearTimeout);
    setLeaving(false);
    setState({ step: "busy" });
    try {
      // Always fresh: an older download may sit in the browser cache under an older file name.
      const res = await fetch(API.resumePdf(id, true), { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `The server answered ${res.status}.`);
      }
      const fileName = nameFrom(res.headers.get("content-disposition")) ?? "Resume.pdf";
      saveBlob(await res.blob(), fileName);
      setState({ step: "done", fileName });
    } catch (e) {
      setState({ step: "failed", error: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't reach the server." });
    }
    // The notice stays long enough to read, then slides away.
    later(3200, () => setLeaving(true));
    later(3450, () => setState({ step: "idle" }));
  };

  const { step } = state;
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={download}
        disabled={step === "busy"}
        aria-label={iconOnly ? "Download PDF" : undefined}
        className={cx("transition-colors duration-300", step === "done" && "text-good")}
      >
        {step === "busy" ? (
          <Spinner />
        ) : step === "done" ? (
          <Icon name="check" className="pop-in size-3.5" strokeWidth={2.5} />
        ) : (
          <Icon name="download" className="size-3.5" />
        )}
        {!iconOnly && (step === "busy" ? "Downloading…" : step === "done" ? "Downloaded" : "Download")}
      </Button>

      {(step === "done" || step === "failed") && (
        <div
          role="status"
          className={cx(
            "panel-raised fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex items-start gap-3 rounded-xl p-4 text-sm md:bottom-4 sm:left-auto sm:right-6 sm:w-[24rem]",
            leaving ? "toast-out" : "toast-in",
          )}
        >
          <span
            className={cx(
              "pop-in grid size-7 shrink-0 place-items-center rounded-full",
              step === "done" ? "bg-good/12 text-good" : "bg-bad/10 text-bad",
            )}
          >
            <Icon name={step === "done" ? "check" : "x"} className="size-4" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{step === "done" ? "Downloaded" : "Download failed"}</p>
            <p className="mt-0.5 break-all text-xs text-muted">
              {state.step === "done" ? (
                <>
                  <span className="font-medium text-ink">{state.fileName}</span> is in your Downloads folder.
                </>
              ) : (
                state.step === "failed" && state.error
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** The file name the server chose, from `attachment; filename*=UTF-8''Name.pdf`. */
function nameFrom(header: string | null): string | null {
  const m = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Hand the file to the browser's own download, under our file name. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
