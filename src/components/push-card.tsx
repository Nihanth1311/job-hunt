"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushMode, subscribePush, testPush, unsubscribePush } from "@/actions/push";
import type { PushMode } from "@/lib/notify/push";
import { Button, Callout, Card, CardTitle, cx } from "./ui";

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
export function PushCard({ publicKey, mode, devices }: { publicKey: string; mode: PushMode; devices: string[] }) {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
        Jobs are fetched for everyone automatically every 3 hours; you get a notification when yours finds new jobs (nothing between
        11 pm and 7 am: overnight finds arrive with the first one in the morning). Press <b>Fetch now</b> and you can close the app:
        you&apos;ll get a notification when it&apos;s done.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state === "checking" && <span className="text-sm text-muted">Checking this device…</span>}
        {state === "on" && (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
              <span className="size-1.5 rounded-full bg-good" /> On for this device
            </span>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setMsg(await testPush()))}>
              Send a test
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={disable}>
              Turn off
            </Button>
          </>
        )}
        {state === "off" && (
          <Button size="sm" disabled={pending} onClick={enable}>
            Turn on for this device
          </Button>
        )}
      </div>

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

      {devices.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          On for: {devices.join(", ")}
        </p>
      )}
    </Card>
  );
}
