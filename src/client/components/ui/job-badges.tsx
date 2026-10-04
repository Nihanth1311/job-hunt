// Badges that show a job's facts: role type, resume, salary, match score.
import { salaryLabel } from "@/shared/core/classify";
import { CATEGORY_LABEL, TRACK_LABEL, type Category, type Track } from "@/shared/types";
import { Badge, TONE } from "./badge";

const CATEGORY_STYLE: Record<Category, string> = {
  fullstack: "bg-cat-fullstack/10 text-cat-fullstack ring-cat-fullstack/20",
  frontend: "bg-cat-frontend/10 text-cat-frontend ring-cat-frontend/20",
  backend: "bg-cat-backend/10 text-cat-backend ring-cat-backend/20",
  devops: "bg-cat-devops/10 text-cat-devops ring-cat-devops/20",
  data: "bg-cat-data/10 text-cat-data ring-cat-data/20",
  security: "bg-cat-security/10 text-cat-security ring-cat-security/20",
  sde: "bg-cat-sde/10 text-cat-sde ring-cat-sde/20",
  internship: "bg-cat-intern/10 text-cat-intern ring-cat-intern/20",
  other: TONE.neutral,
};

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
