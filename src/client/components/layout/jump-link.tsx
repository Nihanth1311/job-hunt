"use client";

import type { ReactNode } from "react";

/**
 * A link to a section on the same page that scrolls there on every click.
 * (A Next.js <Link href="#x"> does nothing once the URL already ends in #x.)
 */
export function JumpLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        const target = document.getElementById(to);
        if (!target) return;
        e.preventDefault();
        // Jump straight there: a smooth scroll down a long job page takes most of a second and feels like lag.
        target.scrollIntoView({ behavior: "instant", block: "start" });
        history.replaceState(history.state, "", `#${to}`);
      }}
    >
      {children}
    </a>
  );
}
