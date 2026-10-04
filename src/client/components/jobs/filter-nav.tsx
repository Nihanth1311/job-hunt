"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useOptimistic, useTransition, type MouseEvent, type ReactNode } from "react";
import { cx } from "../ui";

/**
 * Filter clicks re-query the server, which can take a second. This makes them feel instant:
 * the clicked option is selected right away and the results fade until the new list arrives.
 */
interface Target {
  href: string;
  group?: string;
}

const Ctx = createContext<{ target: Target | null; pending: boolean; go: (t: Target) => void }>({
  target: null,
  pending: false,
  go: () => {},
});

export function FilterNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useOptimistic<Target | null>(null);

  const go = (t: Target) =>
    start(() => {
      setTarget(t);
      router.push(t.href, { scroll: false });
    });

  return <Ctx value={{ target, pending, go }}>{children}</Ctx>;
}

/** A Link whose navigation runs inside the shared transition. Modified clicks (new tab etc.) behave normally. */
export function NavLink({
  href,
  group,
  className,
  children,
  ...rest
}: { href: string; group?: string; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const { go } = use(Ctx);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go({ href, group });
  };
  return (
    <Link href={href} scroll={false} onClick={onClick} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** One radio-style option in the filter panel. */
export function FilterOption({
  to,
  group,
  active,
  label,
  count,
  dim,
  title,
}: {
  to: string;
  group: string;
  active: boolean;
  label: string;
  count?: number;
  /** Shown greyed out, e.g. a company whose jobs your other filters hide. */
  dim?: boolean;
  title?: string;
}) {
  const { target, pending } = use(Ctx);
  // While a click in this group is loading, show the clicked option as the selected one.
  const on = target?.group === group ? target.href === to : active;
  const loading = pending && target?.href === to;

  return (
    <NavLink
      href={to}
      group={group}
      aria-current={on ? "true" : undefined}
      title={title}
      className={cx(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[15px] transition lg:py-1.5 lg:text-sm",
        on ? "bg-accent-soft font-medium text-accent" : dim ? "text-muted hover:bg-surface-2 hover:text-ink" : "text-ink/80 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className={cx("grid size-3.5 shrink-0 place-items-center rounded-full border", on ? "border-accent" : "border-line-strong")}>
        {on && <span className="size-1.5 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {loading ? (
        <span aria-label="Loading" className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      ) : (
        count !== undefined && <span className={cx("text-xs tabular-nums", on ? "text-accent" : "text-muted")}>{count}</span>
      )}
    </NavLink>
  );
}

/** Fades its contents while a filter change is loading. */
export function PendingArea({ className, children }: { className?: string; children: ReactNode }) {
  const { pending } = use(Ctx);
  return (
    <div aria-busy={pending} className={cx("transition-opacity duration-200", pending && "pointer-events-none opacity-50", className)}>
      {children}
    </div>
  );
}
