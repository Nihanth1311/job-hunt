"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./avatar";
import { useJobsHref } from "./jobs-memory";
import { ThemeToggle } from "./theme-toggle";
import { cx, Icon, type IconName } from "../ui";
import { API } from "../../api/endpoints";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/jobs", label: "Jobs", icon: "jobs" },
  { href: "/tracker", label: "Tracker", icon: "tracker" },
  { href: "/resumes", label: "Resumes", icon: "document" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export interface NavUser {
  name: string;
  email: string;
  image: string | null;
  admin: boolean;
}

export function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const links = user.admin ? [...LINKS, { href: "/admin", label: "Admin", icon: "lock" as IconName }] : LINKS;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // "Jobs" returns to the list with the filters you last used.
  const jobsHref = useJobsHref();
  const target = (href: string) => (href === "/jobs" ? jobsHref : href);

  return (
    <>
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line md:block">
        <aside className="flex h-full flex-col px-4 py-6">
          <Link href="/profile" className="mb-8 flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
            <Avatar name={user.name} image={user.image} size={36} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-semibold tracking-tight">{user.name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted">{user.email}</span>
            </span>
          </Link>
          <nav className="flex flex-col gap-0.5">
            {links.map((l) => {
              const on = active(l.href);
              return (
                <Link
                  key={l.href}
                  href={target(l.href)}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition duration-150",
                    on ? "bg-surface-solid font-medium text-ink shadow-[var(--shadow)] ring-1 ring-line" : "text-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon name={l.icon} className={cx("size-[18px] transition", on ? "text-accent" : "group-hover:translate-x-px")} />
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 border-t border-line px-1 pt-4">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs text-muted">Appearance</span>
              <ThemeToggle />
            </div>
            <form action={API.signOut} method="post">
              <button className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-muted transition hover:text-ink">
                <Icon name="logout" className="size-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* Phones: a slim top bar, and the sections as a tab bar along the bottom (thumb reach). */}
      <header className="sticky top-0 z-20 flex h-13 items-center gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur-md md:hidden">
        <Link href="/profile" className="flex min-w-0 items-center gap-2.5">
          <Avatar name={user.name} image={user.image} size={30} />
          <span className="truncate text-[15px] font-semibold tracking-tight">{user.name}</span>
        </Link>
        <ThemeToggle className="ml-auto" />
      </header>
      <nav
        aria-label="Sections"
        className={cx(
          "fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden",
          // Admins get a 7th tab (Admin); labels shrink a little to fit.
          links.length > 6 ? "grid-cols-7 [&_a]:text-[9.5px]" : "grid-cols-6",
        )}
      >
        {links.map((l) => {
          const on = active(l.href);
          return (
            <Link
              key={l.href}
              href={target(l.href)}
              aria-current={on ? "page" : undefined}
              className={cx(
                "relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] transition active:scale-95",
                on ? "font-medium text-ink" : "text-muted",
              )}
            >
              {on && <span className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-accent" />}
              <Icon name={l.icon} className={cx("size-5", on && "text-accent")} />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
