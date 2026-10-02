import { Badge, cx, Icon, type IconName, type Tone } from "./ui";

const VERDICT: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  fit: { label: "Ready to apply", tone: "good", icon: "check" },
  check: { label: "Needs a look", tone: "warn", icon: "info" },
  no: { label: "Not a fit", tone: "bad", icon: "x" },
};

/** The answer to "can I apply to this?", with the reasons behind it. */
export function FitLine({ fit, reasons, className }: { fit: string; reasons: string[]; className?: string }) {
  const v = VERDICT[fit] ?? VERDICT.check;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)}>
      <Badge tone={v.tone} className="text-[12px]">
        <Icon name={v.icon} className="size-3" strokeWidth={2.5} />
        {v.label}
      </Badge>
      {reasons.length > 0 && <span className="text-muted">{reasons.join(" · ")}</span>}
    </div>
  );
}
