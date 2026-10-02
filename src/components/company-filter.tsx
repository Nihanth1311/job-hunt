"use client";

import { useState } from "react";
import { FilterOption } from "./filter-nav";
import { cx, Icon } from "./ui";

export interface CompanyChoice {
  name: string;
  /** Jobs matching your other filters. */
  n: number;
  total: number;
  href: string;
}

const TOP = 8;

/** Narrow the list to one company: busiest first, with a search box for long lists. */
export function CompanyFilter({ companies, selected, anyHref }: { companies: CompanyChoice[]; selected: string; anyHref: string }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies;
  const shown = q || showAll ? matches : matches.filter((c, i) => i < TOP || c.name === selected);
  const firstHidden = shown.findIndex((c) => c.n === 0);

  return (
    <>
      {companies.length > TOP && (
        <div className="relative mb-1.5">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a company…"
            aria-label="Find a company"
            className="field py-1.5 pl-8 sm:text-[13px]"
          />
        </div>
      )}

      {!q && <FilterOption group="company" to={anyHref} active={!selected} label="Any company" />}

      {shown.map((c, i) => (
        <div key={c.name}>
          {i === firstHidden && (
            <p className="px-2.5 pb-1 pt-2.5 text-[11px] text-muted">Hidden by your other filters</p>
          )}
          <FilterOption
            group="company"
            to={c.href}
            active={c.name === selected}
            label={c.name}
            count={c.n > 0 ? c.n : c.total}
            dim={c.n === 0}
            title={c.n === 0 ? `${c.total} ${c.total === 1 ? "job" : "jobs"}, hidden by your other filters` : undefined}
          />
        </div>
      ))}

      {q && matches.length === 0 && <p className="px-2.5 py-1.5 text-sm text-muted">No company matches “{query.trim()}”</p>}

      {!q && companies.length > TOP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-0.5 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-accent hover:bg-surface-2"
        >
          <Icon name="chevronDown" className={cx("size-3.5 transition", showAll && "rotate-180")} />
          {showAll ? "Show fewer" : `Show all ${companies.length} companies`}
        </button>
      )}
    </>
  );
}
