import type { ReactNode } from "react";
import { cx } from "./cx";

/** Segmented control shell; children are the segments. */
export function Segmented({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}>{children}</div>;
}

export function segmentClass(active: boolean) {
  return cx(
    "rounded-md px-3 py-1.5 text-sm transition whitespace-nowrap",
    active ? "bg-surface-solid font-medium text-ink shadow-[var(--shadow)] ring-1 ring-line" : "text-muted hover:text-ink",
  );
}
