"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_KEY, type ThemePref } from "@/shared/theme";
import { cx, Icon } from "../ui";

const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  const root = document.documentElement;
  // Switch instantly instead of fading every surface.
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", dark ? "dark" : "light");
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = media();
  const onOs = () => readPref() === "system" && apply("system");
  mq.addEventListener("change", onOs);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onOs);
    window.removeEventListener("storage", cb);
  };
}

function setPref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  apply(pref);
  listeners.forEach((l) => l());
}

const OPTIONS: { value: ThemePref; label: string; icon: "sun" | "monitor" | "moon" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "system", label: "System", icon: "monitor" },
  { value: "dark", label: "Dark", icon: "moon" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const pref = useSyncExternalStore(subscribe, readPref, () => null);

  // React's dev remount resets <html> attributes; put the theme back before paint.
  useLayoutEffect(() => apply(readPref()), []);

  return (
    <div role="radiogroup" aria-label="Theme" className={cx("inline-flex rounded-full border border-line bg-surface-2 p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          title={o.label}
          onClick={() => setPref(o.value)}
          className={cx(
            "grid size-7 place-items-center rounded-full transition",
            pref === o.value ? "bg-surface-solid text-ink shadow-[var(--shadow)] ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          <Icon name={o.icon} className="size-3.5" />
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
