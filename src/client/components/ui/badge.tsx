import type { ReactNode } from "react";
import { cx } from "./cx";

export const TONE = {
  neutral: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent ring-accent/20",
  good: "bg-good/10 text-good ring-good/20",
  warn: "bg-warn/10 text-warn ring-warn/25",
  bad: "bg-bad/10 text-bad ring-bad/20",
} as const;
export type Tone = keyof typeof TONE;

export function Badge({ className, tone, children }: { className?: string; tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4 ring-1 ring-inset",
        tone && TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Callout({ tone = "accent", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <div className={cx("rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ring-1 ring-inset", TONE[tone], className)}>{children}</div>;
}
