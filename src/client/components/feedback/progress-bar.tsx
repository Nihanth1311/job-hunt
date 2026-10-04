"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// A thin bar across the top of the screen while something is being saved, so it's clear the app
// is working. Used by the switches (useBusyWhile); the provider sits in the app layout.

interface Progress {
  begin: () => void;
  end: () => void;
}
/** Outside the provider (e.g. the login page) nothing breaks; there's just no bar. */
const ProgressContext = createContext<Progress>({ begin() {}, end() {} });

/** Show the bar only for work that takes longer than this, so quick saves don't flicker. */
const SHOW_AFTER_MS = 150;

export function ProgressBarProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(0);
  const [shown, setShown] = useState(false);
  const active = busy > 0;
  const value = useMemo<Progress>(() => ({ begin: () => setBusy((n) => n + 1), end: () => setBusy((n) => Math.max(0, n - 1)) }), []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(t);
      setShown(false);
    };
  }, [active]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <div className="progress-bar" data-on={active && shown} aria-hidden />
    </ProgressContext.Provider>
  );
}

/** Show the bar while `busy` is true, e.g. useBusyWhile(pending) with a useTransition's pending flag. */
export function useBusyWhile(busy: boolean) {
  const progress = useContext(ProgressContext);
  useEffect(() => {
    if (!busy) return;
    progress.begin();
    return () => progress.end();
  }, [busy, progress]);
}
