import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

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
