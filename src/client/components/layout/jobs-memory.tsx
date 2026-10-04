"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";

// Filters live in the URL, so remember the last Jobs URL and send "Jobs" links back to it.
const KEY = "jobsFilters";
const EVENT = "jobs-filters-change";

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.startsWith("/jobs") ? v : "/jobs";
  } catch {
    return "/jobs";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The Jobs list with your last filters ("/jobs" until you've used it). */
export function useJobsHref(): string {
  return useSyncExternalStore(subscribe, read, () => "/jobs");
}

/** Rendered on the Jobs page: saves the current filters whenever they change. */
export function RememberJobsFilters() {
  const params = useSearchParams();
  const qs = params.toString();
  useEffect(() => {
    try {
      localStorage.setItem(KEY, qs ? `/jobs?${qs}` : "/jobs");
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, [qs]);
  return null;
}

/** A link back to the Jobs list that keeps your filters. */
export function JobsLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  return <Link href={useJobsHref()} {...props} />;
}
