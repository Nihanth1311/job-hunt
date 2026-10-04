import type { ReactNode } from "react";
import { Card } from "./card";
import { Icon, type IconName } from "./icon";

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
