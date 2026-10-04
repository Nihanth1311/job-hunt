import { cx } from "./cx";

/** A small spinning ring, in the current text colour. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}
