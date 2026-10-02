"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { findCapturedJob, saveFullDescription, type CapturedJobMatch } from "@/actions/jobs";
import { isClipPayload, type ClipPayload } from "@/lib/core/capture";
import { htmlToText, tidy } from "@/lib/core/text";
import type { Preferences, Profile } from "@/lib/types";
import { AddJobForm } from "./add-job-form";
import { JobDescription } from "./job-description";
import { Badge, Button, Callout, Card, CardTitle, Icon } from "./ui";

type Clip = { url: string; title: string; company: string; location: string; description: string; site: string };

function normalize(p: ClipPayload): Clip {
  // Page titles look like "React Developer - Acme - Bengaluru | Adzuna": the job title comes first.
  const fromPageTitle = p.pageTitle.split(/\s[|\-–]\s/)[0]?.trim() ?? "";
  let site = "";
  try {
    site = new URL(p.url).hostname.replace(/^www\./, "");
  } catch {}
  return {
    url: p.url,
    title: p.title.trim() || fromPageTitle,
    company: p.company.trim(),
    location: p.location.trim(),
    // Some sites put literal "\n" sequences in their job data.
    description: (p.html ? htmlToText(p.description.replace(/\\n/g, "\n")) : tidy(p.description)).trim(),
    site,
  };
}

/** Receives a job from the Clip bookmarklet and saves it: onto the matching job, or as a new one. */
export function CaptureClient({ profile, prefs }: { profile: Profile; prefs: Preferences }) {
  const router = useRouter();
  const [clip, setClip] = useState<Clip | null>(null);
  const [match, setMatch] = useState<CapturedJobMatch | null | undefined>(undefined);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const receive = (p: ClipPayload) => {
    const c = normalize(p);
    setClip(c);
    setText(c.description);
    findCapturedJob({ url: c.url, title: c.title, company: c.company }).then(setMatch);
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (isClipPayload(e.data)) receive(e.data);
    };
    window.addEventListener("message", onMessage);
    // Tell the job page we're ready (a few times, in case it was slow to listen).
    const ping = () => window.opener?.postMessage({ type: "jh-ready" }, "*");
    ping();
    const pings = [300, 800, 1500].map((ms) => setTimeout(ping, ms));
    const giveUp = setTimeout(() => setWaitedTooLong(true), 3500);
    return () => {
      window.removeEventListener("message", onMessage);
      pings.forEach(clearTimeout);
      clearTimeout(giveUp);
    };
  }, []);

  // Fallback: the Clip button also copies the job, so Ctrl+V works when the tab handoff is blocked.
  const onPaste = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (isClipPayload(parsed)) return receive(parsed);
    } catch {}
    if (raw.trim().length > 50) {
      receive({ type: "jh-capture", url: "", pageTitle: "", title: "", company: "", location: "", description: raw, html: false });
    }
  };

  if (!clip) {
    return waitedTooLong ? (
      <Card className="mx-auto max-w-2xl p-6 sm:p-8">
        <CardTitle icon="info">Waiting for a job</CardTitle>
        <p className="text-sm text-muted">
          Open a job posting and click your <b className="text-ink">Clip to Job Hunt</b> bookmark. If this tab opened but nothing
          arrived, the site blocked the handoff. The job was copied to your clipboard too, so click below and press{" "}
          <b className="text-ink">Ctrl+V</b>.
        </p>
        <textarea
          className="field mt-4 min-h-32 sm:text-sm"
          placeholder="Click here and press Ctrl+V…"
          onPaste={(e) => {
            e.preventDefault();
            onPaste(e.clipboardData.getData("text"));
          }}
        />
        <p className="mt-4 text-xs text-muted">
          Don&apos;t have the bookmark yet?{" "}
          <Link href="/settings#clip" className="font-medium text-accent hover:underline">
            Set up Clip
          </Link>
        </p>
      </Card>
    ) : (
      <Card className="mx-auto max-w-2xl p-8 text-center text-sm text-muted">
        <span className="mx-auto mb-3 block size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Receiving the job…
      </Card>
    );
  }

  if (match === undefined) {
    return <Card className="mx-auto max-w-2xl p-8 text-center text-sm text-muted">Looking for this job in your feed…</Card>;
  }

  // New job: hand it to the normal Add-a-job form, pre-filled.
  if (!match) {
    return (
      <div className="space-y-4">
        <Callout tone="accent" className="text-sm">
          New job{clip.site && <> from <b>{clip.site}</b></>}. Check the details below and save it. Its page opens next, ready to tailor
          your resume.
        </Callout>
        <AddJobForm profile={profile} prefs={prefs} initial={clip} />
      </div>
    );
  }

  const save = () =>
    start(async () => {
      const err = await saveFullDescription(match.id, text);
      if (err) setError(err);
      else router.push(`/jobs/${match.id}`);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Found in your jobs</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{match.title}</h2>
            <p className="text-sm text-muted">{match.company}</p>
          </div>
          <Badge tone="good">
            <Icon name="check" className="size-3" /> {text.length.toLocaleString("en-IN")} characters captured
          </Badge>
        </div>
        <p className="mt-4 text-sm text-muted">
          {match.descriptionIsPreview
            ? "Your feed only had a 500-character preview of this job. Save to replace it with the full description and re-check your match."
            : "This job already has a full description. Saving replaces it with the version you clipped."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} disabled={pending || text.trim().length < 50}>
            {pending ? "Saving…" : match.descriptionIsPreview ? "Save full description" : "Replace description"}
          </Button>
          <Button variant="ghost" onClick={() => setEditing((e) => !e)}>
            {editing ? "Done editing" : "Edit before saving"}
          </Button>
          <Link href={`/jobs/${match.id}`} className="ml-auto text-sm text-muted hover:text-ink">
            Cancel
          </Link>
        </div>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </Card>

      <Card className="p-6 sm:p-7">
        <CardTitle icon="jobs">What was captured</CardTitle>
        {editing ? (
          <textarea className="field min-h-96 sm:text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <JobDescription text={text} />
        )}
      </Card>
    </div>
  );
}
