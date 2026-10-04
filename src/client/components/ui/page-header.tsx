import type { ReactNode } from "react";
import { Card } from "./card";
import { Icon } from "./icon";

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
