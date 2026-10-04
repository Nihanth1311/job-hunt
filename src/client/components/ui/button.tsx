import type { ComponentProps } from "react";
import { cx } from "./cx";

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
