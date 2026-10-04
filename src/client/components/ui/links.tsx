import type { ReactNode } from "react";
import { Icon } from "./icon";

/** Small "View →" style link used inside cards. */
export function ArrowLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-accent transition group-hover:gap-1.5">
      {children}
      <Icon name="arrowRight" className="size-3.5" />
    </span>
  );
}
