"use client";

import { useState, useTransition } from "react";
import { setTelegramForEveryone } from "@/server/actions/settings";
import { Card, CardTitle, cx } from "../ui";

/** App-wide switches only the admin can flip. */
export function AdminFeatures({ telegram }: { telegram: boolean }) {
  const [on, setOn] = useState(telegram);
  const [pending, start] = useTransition();

  const flip = () => {
    const next = !on;
    setOn(next); // show it straight away; the server confirms below
    start(async () => setOn(await setTelegramForEveryone(next)));
  };

  return (
    <Card className="p-5">
      <CardTitle icon="settings">Features for everyone</CardTitle>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3.5 py-3 ring-1 ring-inset ring-line">
        <label htmlFor="telegram-toggle" className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium">Telegram alerts</span>
          <span className="block text-xs text-muted">
            {on
              ? "On: everyone sees Telegram in Settings and can connect their own bot for instant alerts and a morning digest."
              : "Off: the Telegram section is hidden in everyone's Settings, and no Telegram messages are sent."}
          </span>
        </label>
        <button
          id="telegram-toggle"
          aria-label="Telegram alerts for everyone"
          type="button"
          role="switch"
          aria-checked={on}
          disabled={pending}
          onClick={flip}
          className={cx(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            on ? "bg-accent" : "bg-line-strong",
          )}
        >
          <span
            className={cx("inline-block size-5 rounded-full bg-surface-solid shadow transition-transform", on ? "translate-x-6" : "translate-x-1")}
          />
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Turning it off keeps everyone&apos;s saved Telegram keys, so turning it back on needs no setup. Phone notifications aren&apos;t
        affected.
      </p>
    </Card>
  );
}
