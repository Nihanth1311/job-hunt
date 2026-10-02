"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, cx, Icon } from "./ui";

/** Upload a file from "Export my data" (e.g. from your laptop) to bring it into this account. */
export function RestoreBackup() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const restore = (file: File) =>
    start(async () => {
      setMsg("Restoring…");
      try {
        const res = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
        const body = await res.json();
        if (!res.ok) return setMsg(body.error ?? `Couldn't restore (${res.status}).`);
        const a = body.added;
        setMsg(
          [
            a.profile && "profile and master resume",
            a.jobs && `${a.jobs} jobs`,
            a.applications && `${a.applications} tracker entries`,
            a.resumeVersions && `${a.resumeVersions} resumes`,
          ]
            .filter(Boolean)
            .join(", ")
            .replace(/^(.)/, (c) => c.toUpperCase())
            .concat(" restored.") || "Nothing new to restore.",
        );
        router.refresh();
      } catch {
        setMsg("That file couldn't be read. Use the file from “Export my data”.");
      }
    });

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) restore(file);
          e.target.value = "";
        }}
      />
      <button type="button" disabled={pending} onClick={() => input.current?.click()} className={cx(buttonClass("secondary", "sm"))}>
        <Icon name="refresh" className="size-3.5" /> Restore from a backup
      </button>
      {msg && <p className="w-full text-xs text-muted">{msg}</p>}
    </>
  );
}
