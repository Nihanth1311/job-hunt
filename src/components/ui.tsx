import type { ComponentProps, ReactNode } from "react";
import { salaryLabel } from "@/lib/core/classify";
import { CATEGORY_LABEL, TRACK_LABEL, type Category, type Track } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------- Icons (24px grid, stroked) ---------- */

const ICONS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  jobs: "M5 7.5h14a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1zM9 7.5V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5M4 12.5h16",
  tracker: "M5 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM11 4h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM17 4h2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
  sparkles: "M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8zM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 19.5a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14a6.5 6.5 0 0 1 3 5.5",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  sun: "M12 3v1.5M12 19.5V21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M3 12h1.5M19.5 12H21M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  monitor: "M5 4.5h14a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1zM8.5 20h7M12 16v4",
  refresh: "M19.5 11A7.5 7.5 0 0 0 6 6.5L4.5 8M4.5 4v4h4M4.5 13A7.5 7.5 0 0 0 18 17.5l1.5-1.5M19.5 20v-4h-4",
  x: "M17 7 7 17M7 7l10 10",
  external: "M14 4.5h5.5V10M19.5 4.5 11 13M17.5 14v4.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H10",
  arrowRight: "M5 12h14M13.5 6.5 19 12l-5.5 5.5",
  arrowLeft: "M19 12H5M10.5 6.5 5 12l5.5 5.5",
  plus: "M12 5v14M5 12h14",
  chevronRight: "m9.5 6 6 6-6 6",
  chevronDown: "m6 9.5 6 6 6-6",
  check: "M5 12.5 9.5 17 19 7.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  chat: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-5 4V6a1 1 0 0 1 1-1z",
  copy: "M9 9h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3",
  logout: "M14.5 4.5H18a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-3.5M10 16l-4-4 4-4M6 12h9",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14",
  printer: "M7 9V4.5h10V9M7 17H5.5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1H17M7 14h10v6H7z",
  trash: "M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 11.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2",
  bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z",
  calendar: "M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1zM4 10h16M8 3.5v4M16 3.5v4",
  lock: "M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3",
  pipeline: "M4 6h16M4 12h10M4 18h5",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  database: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  building: "M4 20h16M6 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M15 9h3a1 1 0 0 1 1 1v10M9 8h2M9 12h2M9 16h2",
  document: "M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5zM14 3.5V8h4M9 12h6M9 15.5h6",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className, strokeWidth = 1.75 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ---------- Buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 font-medium transition duration-150 whitespace-nowrap select-none active:translate-y-px disabled:opacity-50 disabled:pointer-events-none",
    // A little taller on phones, where they are tapped with a thumb.
    size === "sm" ? "h-9 rounded-md px-3 text-[13px] sm:h-8" : "h-11 rounded-lg px-4 text-sm sm:h-10",
    variant === "primary" && "bg-accent text-accent-ink shadow-[var(--shadow-sm)] hover:bg-accent-hover",
    variant === "secondary" && "border border-line bg-surface-solid text-ink shadow-[var(--shadow-sm)] hover:border-line-strong hover:shadow-[var(--shadow)]",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
    variant === "danger" && "border border-bad/25 text-bad hover:bg-bad/8",
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button type="button" className={cx(buttonClass(variant, size), className)} {...props} />;
}

/* ---------- Surfaces ---------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("panel rounded-xl", className)} {...props} />;
}

export function CardTitle({ children, icon, action }: { children: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
        {icon && <Icon name={icon} className="size-4 text-muted" />}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] leading-[1.1] sm:text-[36px]">{title}</h1>
        {subtitle && <div className="mt-2 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="px-6 py-14 text-center">
      <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full border border-line text-muted">
        <Icon name="search" className="size-5" />
      </span>
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</div>}
    </Card>
  );
}

/* ---------- Tones, badges, callouts ---------- */

export const TONE = {
  neutral: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent ring-accent/20",
  good: "bg-good/10 text-good ring-good/20",
  warn: "bg-warn/10 text-warn ring-warn/25",
  bad: "bg-bad/10 text-bad ring-bad/20",
} as const;
export type Tone = keyof typeof TONE;

const CATEGORY_STYLE: Record<Category, string> = {
  fullstack: "bg-cat-fullstack/10 text-cat-fullstack ring-cat-fullstack/20",
  frontend: "bg-cat-frontend/10 text-cat-frontend ring-cat-frontend/20",
  backend: "bg-cat-backend/10 text-cat-backend ring-cat-backend/20",
  devops: "bg-cat-devops/10 text-cat-devops ring-cat-devops/20",
  sde: "bg-cat-sde/10 text-cat-sde ring-cat-sde/20",
  other: TONE.neutral,
};

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

export function CategoryBadge({ category }: { category: string }) {
  const c = (category in CATEGORY_STYLE ? category : "other") as Category;
  return <Badge className={CATEGORY_STYLE[c]}>{CATEGORY_LABEL[c]}</Badge>;
}

export function TrackBadge({ track }: { track: string }) {
  return <Badge tone="accent">{TRACK_LABEL[track as Track] ?? track} resume</Badge>;
}

export function SalaryBadge({
  min,
  max,
  bucket,
  estimated,
  ctc,
}: {
  min: number | null;
  max: number | null;
  bucket: string;
  estimated?: boolean;
  ctc?: boolean;
}) {
  const label = salaryLabel(min, max);
  if (!label) return <Badge tone="neutral">Salary not shown</Badge>;
  return (
    <Badge tone={bucket === "meets" ? "good" : bucket === "possible" ? "warn" : "bad"}>
      {estimated ? "~" : ""}
      {label}
      {estimated ? " est." : ""}
      {ctc ? " · CTC" : ""}
    </Badge>
  );
}

/** Match score as a small ring gauge. */
export function ScorePill({ score }: { score: number }) {
  const color = score >= 75 ? "var(--good)" : score >= 55 ? "var(--warn)" : "var(--muted)";
  const pct = Math.max(0, Math.min(100, score));
  return (
    <span
      title="Match score: skills you have, experience fit, salary and role type"
      className="relative grid size-11 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--line) 0)` }}
    >
      <span className="grid size-[39px] place-items-center rounded-full bg-surface-solid text-[12px] font-semibold tabular-nums" style={{ color }}>
        {score}
      </span>
    </span>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: IconName }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <Icon name={icon} className="size-4 text-muted/80" />}
      </div>
      <p className="mt-3 font-display text-[36px] leading-none tabular-nums">{value}</p>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

/** Small "View →" style link used inside cards. */
export function ArrowLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-accent transition group-hover:gap-1.5">
      {children}
      <Icon name="arrowRight" className="size-3.5" />
    </span>
  );
}

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
