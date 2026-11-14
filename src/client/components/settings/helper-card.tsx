"use client";

import { useState, useTransition } from "react";
import { connectLaptop, disconnectLaptop } from "@/server/actions/autofill";
import { Badge, Button, Card, CardTitle, Icon } from "../ui";

type Device = { id: string; name: string; added: string; seen: string | null };

/**
 * Link your laptop to your account so its autofill helper can fetch the forms you queue.
 * The token is shown once: the site keeps only a fingerprint of it.
 */
export function HelperCard({ devices, online, siteUrl }: { devices: Device[]; online: boolean; siteUrl: string }) {
  const [name, setName] = useState("My laptop");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const command = token ? `npm run helper -- connect ${siteUrl} ${token}` : "";

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card id="helper" className="scroll-mt-6 p-5">
      <CardTitle
        icon="monitor"
        action={
          <Badge tone={online ? "good" : "neutral"}>
            <span className={online ? "size-1.5 rounded-full bg-good" : "size-1.5 rounded-full bg-muted/60"} />
            {online ? "Running now" : "Not running"}
          </Badge>
        }
      >
        Laptop helper (autofill)
      </CardTitle>
      <p className="-mt-2 max-w-2xl text-sm text-muted">
        A small program on your laptop that fills application forms in Chrome for the jobs you press <b>Autofill</b> on. It never presses
        Submit: you check the form and submit it yourself.
      </p>

      {token ? (
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-medium">In Terminal, inside your job-hunt folder, run this once:</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-solid p-3 font-mono text-xs ring-1 ring-line">{command}</pre>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary" onClick={copy}>
              <Icon name={copied ? "check" : "copy"} className="size-3.5" /> {copied ? "Copied" : "Copy command"}
            </Button>
            <span className="text-xs text-muted">Shown only now. After that, start the helper any time with <code>npm run helper</code>.</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 sm:max-w-xs">
            <label className="label" htmlFor="helper-name">
              Name for this laptop
            </label>
            <input id="helper-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button variant="primary" disabled={pending} onClick={() => start(async () => setToken(await connectLaptop(name)))}>
            <Icon name="plus" className="size-3.5" /> {pending ? "Linking…" : "Link a laptop"}
          </Button>
        </div>
      )}

      {devices.length > 0 && (
        <ul className="mt-5 divide-y divide-line border-t border-line text-sm">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <b>{d.name}</b>
                <span className="text-xs text-muted">
                  {" "}
                  · linked {d.added}
                  {d.seen && ` · last used ${d.seen}`}
                </span>
              </span>
              <button
                type="button"
                className="text-xs text-muted hover:text-bad"
                disabled={pending}
                onClick={() => start(() => disconnectLaptop(d.id))}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
