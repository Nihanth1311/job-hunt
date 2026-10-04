"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushMode, subscribePush, testPush, unsubscribePush } from "@/server/actions/push";
import type { PushLogEntry, PushMode } from "@/shared/types";
import { Button, Callout, Card, CardTitle, cx } from "../ui";

/** "Recently sent" shows this many until you tap See more. */
const SENT_SHOWN = 5;

type State = "checking" | "unsupported" | "install" | "denied" | "off" | "on";

function keyBytes(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "This device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return /iPhone|iPad/.test(ua) || !browser ? os : `${os} · ${browser}`;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Phone notifications after each automatic fetch. On iPhone they need the Home Screen app. */
export function PushCard({
  publicKey,
  mode,
  devices,
  intervalHours,
  log,
}: {
  publicKey: string;
  mode: PushMode;
  devices: string[];
  intervalHours: number;
  /** Recent notifications the server sent, newest first. */
  log: (PushLogEntry & { when: string })[];
}) {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showAllSent, setShowAllSent] = useState(false);
  const sent = showAllSent ? log : log.slice(0, SENT_SHOWN);

  useEffect(() => {
    let alive = true;
    (async () => {
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = isIos() && !isInstalled() ? "install" : "unsupported";
      } else {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Make sure the server still has this device (e.g. after a restore).
          await subscribePush(sub.toJSON(), deviceName());
          next = "on";
        } else next = Notification.permission === "denied" ? "denied" : "off";
      }
      if (alive) setState(next);
    })().catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  const enable = () =>
    start(async () => {
      setMsg(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        const res = await subscribePush(sub.toJSON(), deviceName());
        if (!res.ok) throw new Error("not saved");
        setState("on");
        setMsg("Notifications are on for this device.");
      } catch {
        setMsg("Couldn't turn notifications on here. Try again, or check this browser's notification settings.");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Notifications are off for this device.");
    });

  return (
    <Card id="notifications" className="scroll-mt-6 p-5">
      <CardTitle icon="bell">Phone notifications</CardTitle>
      <p className="-mt-2 max-w-2xl text-sm text-muted">
        Your jobs are fetched automatically every {intervalHours} hour{intervalHours > 1 ? "s" : ""} (change it under{" "}
        <b>Check for new jobs every</b>); you get a notification when a fetch finds new jobs. Nothing between 11 pm and 7 am:
        overnight finds arrive with the first one in the morning. Press <b>Fetch now</b> and you can close the app: you&apos;ll get a
        notification when it&apos;s done.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-3.5 py-3 ring-1 ring-inset ring-line">
        <label htmlFor="push-toggle" className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium">Notifications on this device</span>
          <span className="block text-xs text-muted">
            {state === "checking" ? "Checking…" : state === "on" ? "On" : state === "off" ? "Off" : "Not available here (see below)"}
          </span>
        </label>
        <button
          id="push-toggle"
          aria-label="Notifications on this device"
          type="button"
          role="switch"
          aria-checked={state === "on"}
          disabled={pending || (state !== "on" && state !== "off")}
          onClick={state === "on" ? disable : enable}
          className={cx(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            state === "on" ? "bg-accent" : "bg-line-strong",
          )}
        >
          <span
            className={cx(
              "inline-block size-5 rounded-full bg-surface-solid shadow transition-transform",
              state === "on" ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
      {state === "on" && (
        <Button size="sm" variant="secondary" className="mt-3" disabled={pending} onClick={() => start(async () => setMsg(await testPush()))}>
          Send a test
        </Button>
      )}

      {state === "install" && (
        <Callout tone="warn" className="mt-4 text-sm">
          On iPhone, notifications only work from the Home Screen app. In Safari tap <b>Share</b> → <b>Add to Home Screen</b>, open Job
          Hunt from the new icon, sign in, and come back here. (If you added it before, remove the old icon and add it again.)
        </Callout>
      )}
      {state === "denied" && (
        <Callout tone="warn" className="mt-4 text-sm">
          Notifications are blocked for this site. On iPhone: <b>Settings → Notifications → Job Hunt</b>. In a browser: the site settings
          next to the address bar. Then reload this page.
        </Callout>
      )}
      {state === "unsupported" && (
        <p className="mt-1 text-sm text-muted">This browser can&apos;t show notifications. Try Chrome, Edge, Firefox or Safari.</p>
      )}
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}

      <fieldset className="mt-5">
        <legend className="label">Notify me about</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(
            [
              ["worth", "New jobs worth a look", "Ready to apply, plus ones to check"],
              ["ready", "Only jobs ready to apply", "Fewer, stronger matches"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              disabled={pending}
              onClick={() => start(() => savePushMode(value))}
              aria-pressed={mode === value}
              className={cx(
                "rounded-lg px-3 py-2 text-left ring-1 ring-inset transition",
                mode === value ? "bg-accent-soft ring-accent/40" : "ring-line hover:bg-surface-2",
              )}
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {log.length > 0 && (
        <div className="mt-5">
          <p className="label">Recently sent</p>
          <ul className="mt-1 divide-y divide-line rounded-lg text-xs ring-1 ring-inset ring-line">
            {sent.map((e) => (
              <li key={e.at} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="text-muted">{e.when}</span> · {e.title}
                </span>
                <span className={cx("shrink-0", e.sent === e.of ? "text-good" : "text-bad")}>
                  {e.sent === e.of ? `handed to Apple/Google (${e.sent})` : `${e.sent} of ${e.of} delivered`}
                </span>
                {e.problems.map((p) => (
                  <span key={p} className="w-full text-bad">
                    {p}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {log.length > SENT_SHOWN && (
            <button
              type="button"
              className="mt-1.5 text-xs font-medium text-accent hover:underline"
              onClick={() => setShowAllSent((v) => !v)}
            >
              {showAllSent ? "Show less" : `See more (${log.length - SENT_SHOWN} older)`}
            </button>
          )}
          <p className="mt-1 text-xs text-muted">If something is listed here but didn&apos;t appear on your phone, check its notification settings for Job Hunt.</p>
        </div>
      )}

      {devices.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          On for: {devices.join(", ")}
        </p>
      )}
    </Card>
  );
}
