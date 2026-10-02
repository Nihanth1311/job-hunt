"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addManualJob } from "@/actions/resumes";
import { analyzeJob } from "@/lib/core/analyze";
import { experienceLabel, salaryLabel } from "@/lib/core/classify";
import { TRACK_TITLE, type Preferences, type Profile } from "@/lib/types";
import { Badge, Button, Card, CardTitle, CategoryBadge, Icon } from "./ui";

/** Add a job found anywhere else. Saving it opens its job page, ready to tailor. */
export interface AddJobInitial {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
}

export function AddJobForm({ profile, prefs, initial }: { profile: Profile; prefs: Preferences; initial?: AddJobInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [f, setF] = useState({
    title: initial?.title ?? "",
    company: initial?.company ?? "",
    location: initial?.location ?? "",
    url: initial?.url ?? "",
    description: initial?.description ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const analysis = useMemo(() => analyzeJob({ title: f.title, description: f.description }, profile, prefs), [f.title, f.description, profile, prefs]);
  const hasText = f.description.trim().length > 40;
  const ready = f.title.trim() && f.company.trim();

  const save = () =>
    start(async () => {
      const r = await addManualJob(f);
      if ("error" in r) setError(r.error);
      else router.push(`/jobs/${r.jobId}#tailor`);
    });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">
              Job title <span className="text-bad">*</span>
            </label>
            <input id="title" className="field" value={f.title} onChange={set("title")} placeholder="e.g. Frontend Developer" />
          </div>
          <div>
            <label className="label" htmlFor="company">
              Company <span className="text-bad">*</span>
            </label>
            <input id="company" className="field" value={f.company} onChange={set("company")} placeholder="e.g. Razorpay" />
          </div>
          <div>
            <label className="label" htmlFor="location">Location</label>
            <input id="location" className="field" value={f.location} onChange={set("location")} placeholder="Bengaluru / Remote" />
          </div>
          <div>
            <label className="label" htmlFor="url">Link to the posting</label>
            <input id="url" className="field" value={f.url} onChange={set("url")} placeholder="https://…" />
          </div>
        </div>
        <label className="label mt-5" htmlFor="jd">
          Full job description
        </label>
        <textarea
          id="jd"
          className="field min-h-80 sm:text-sm leading-relaxed"
          value={f.description}
          onChange={set("description")}
          placeholder="Copy the whole description from the posting and paste it here. The more complete it is, the better your tailored resume."
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} disabled={pending || !ready}>
            {pending ? "Saving…" : "Save job & tailor my resume"}
            <Icon name="arrowRight" className="size-4" />
          </Button>
          <span className="text-xs text-muted">It&apos;s added to your Saved jobs and tracker, then its page opens.</span>
        </div>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </Card>

      <Card className="p-5 lg:sticky lg:top-6">
        <CardTitle icon="check">What we found</CardTitle>
        {!hasText ? (
          <p className="text-sm text-muted">Paste the description to see the role type, experience, salary and which of your skills it asks for.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <CategoryBadge category={analysis.category} />
              {experienceLabel(analysis.experience) && (
                <Badge tone={analysis.expFit ? "neutral" : "bad"}>{experienceLabel(analysis.experience)}</Badge>
              )}
              {analysis.salary && (
                <Badge tone="neutral">
                  {salaryLabel(analysis.salary.min, analysis.salary.max)}
                  {analysis.mentionsCtc ? " · CTC" : ""}
                </Badge>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-good">Skills you have · {analysis.matchedSkills.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.matchedSkills.length ? (
                  analysis.matchedSkills.map((s) => (
                    <Badge key={s} tone="good">
                      {s}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted">None found</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Not on your profile · {analysis.missingSkills.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.missingSkills.length ? (
                  analysis.missingSkills.map((s) => (
                    <Badge key={s} tone="neutral">
                      {s}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted">Nothing missing</span>
                )}
              </div>
            </div>
            <p className="rounded-xl bg-surface-2 px-3.5 py-2.5">
              Best resume: <b>{TRACK_TITLE[analysis.track]}</b>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
