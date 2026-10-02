"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setCompaniesFollowed } from "@/actions/settings";
import { timeAgo } from "@/lib/format";
import { Card, CardTitle, cx, Icon } from "./ui";

export interface CompanyRow {
  id: string;
  name: string;
  sector: string;
  /** Last check: ok, failed with a reason, or never run. */
  status: { ok: boolean; at: string; error?: string } | null;
  /** Its jobs in your New feed from the last 30 days. */
  inFeed: number;
}

/** The built-in company list: follow or skip each one, and see whether its careers site is answering. */
export function CompaniesCard({ companies, skipped, sectors }: { companies: CompanyRow[]; skipped: string[]; sectors: readonly string[] }) {
  const [, start] = useTransition();
  const [off, setOff] = useOptimistic(new Set(skipped), (cur, { ids, follow }: { ids: string[]; follow: boolean }) => {
    const next = new Set(cur);
    for (const id of ids) {
      if (follow) next.delete(id);
      else next.add(id);
    }
    return next;
  });
  const [query, setQuery] = useState("");

  const toggle = (ids: string[], follow: boolean) =>
    start(async () => {
      setOff({ ids, follow });
      await setCompaniesFollowed(ids, follow);
    });

  const q = query.trim().toLowerCase();
  const shown = q ? companies.filter((c) => c.name.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q)) : companies;
  const following = companies.filter((c) => !off.has(c.id)).length;
  const failing = companies.filter((c) => !off.has(c.id) && c.status && !c.status.ok);

  return (
    <Card id="companies" className="scroll-mt-6 p-5">
      <CardTitle icon="building">Companies</CardTitle>
      <p className="-mt-2 text-sm text-muted">
        Jobs straight from each company&apos;s own careers site, with <b className="text-ink">the date the company posted it</b>. Only roles in
        India from the last 30 days.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-sm">
          Following <b>{following}</b> of {companies.length}
          {failing.length > 0 && <span className="text-bad"> · {failing.length} not answering</span>}
        </p>
        <div className="relative ml-auto min-w-0 flex-1 basis-48 sm:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a company or sector…"
            aria-label="Find a company"
            className="field py-2 pl-8"
          />
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {sectors.map((sector) => {
          const list = shown.filter((c) => c.sector === sector);
          if (!list.length) return null;
          const ids = list.map((c) => c.id);
          const allOn = ids.every((id) => !off.has(id));
          return (
            <section key={sector}>
              <header className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{sector}</h3>
                <button type="button" onClick={() => toggle(ids, !allOn)} className="text-xs font-medium text-accent hover:underline">
                  {allOn ? "Unfollow all" : "Follow all"}
                </button>
              </header>
              <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((c) => {
                  const on = !off.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1.5 py-2 transition hover:bg-surface-2">
                        <input type="checkbox" checked={on} onChange={(e) => toggle([c.id], e.target.checked)} />
                        <span className={cx("min-w-0 flex-1 truncate text-sm", !on && "text-muted")}>{c.name}</span>
                        <Health row={c} on={on} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {shown.length === 0 && <p className="text-sm text-muted">No company matches “{query.trim()}”.</p>}
      </div>
    </Card>
  );
}

function Health({ row, on }: { row: CompanyRow; on: boolean }) {
  if (!on) return null;
  const s = row.status;
  if (!s) return <span className="shrink-0 text-xs text-muted">not checked yet</span>;
  if (!s.ok)
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-bad" title={`${s.error ?? "Failed"} · checked ${timeAgo(s.at)}`} suppressHydrationWarning>
        <Icon name="info" className="size-3.5" /> not answering
      </span>
    );
  return (
    <span className="shrink-0 text-xs tabular-nums text-muted" title={`Checked ${timeAgo(s.at)}`} suppressHydrationWarning>
      {row.inFeed > 0 ? `${row.inFeed} ${row.inFeed === 1 ? "job" : "jobs"}` : "none now"}
    </span>
  );
}
