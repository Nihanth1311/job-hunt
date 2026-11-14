"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { answerAutofill, autofillUpdate, cancelAutofill, confirmSubmitted, startAutofill } from "@/server/actions/autofill";
import { ACTIVE_RUN, isCompanySpecific, PLATFORM_LABEL, type AutofillPlatform, type AutofillQuestion, type AutofillRunView } from "@/shared/autofill";
import { Button, Callout, Card, CardTitle, Icon, Spinner, buttonClass } from "../ui";

type ResumeOption = { id: string; label: string; group: string };

/** How often the page asks for news while an autofill is going: quickly at first, then less. */
const FAST_MS = 3000;
const SLOW_MS = 10_000;
const SLOW_AFTER_MS = 10 * 60_000;

/**
 * Autofill for one job: pick a resume, and the helper on your laptop opens the form in Chrome and
 * fills it. Questions it can't answer come here; you check the form and submit it in Chrome.
 */
export function AutofillCard({
  jobId,
  company,
  platform,
  resumes,
  suggested,
  initialRun,
  initialOnline,
}: {
  jobId: string;
  company: string;
  /** Which kind of form, or null when this job only has a job-board link (LinkedIn, Naukri…). */
  platform: AutofillPlatform | null;
  resumes: ResumeOption[];
  suggested: string | null;
  initialRun: AutofillRunView | null;
  initialOnline: boolean;
}) {
  const [run, setRun] = useState(initialRun);
  const [online, setOnline] = useState(initialOnline);
  const [resumeId, setResumeId] = useState(resumes.find((r) => r.id === suggested)?.id ?? resumes[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const active = run ? ACTIVE_RUN.includes(run.status) : false;

  // While an autofill is going, ask for news every few seconds (cheap: the server answers from
  // memory when nothing changed). Paused while the tab is hidden.
  const versionRef = useRef(run?.version ?? 0);
  useEffect(() => {
    versionRef.current = run?.version ?? 0;
  }, [run?.version]);
  const runId = active ? run?.id : undefined;
  useEffect(() => {
    if (!runId) return;
    const began = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const out = await autofillUpdate(runId, versionRef.current);
          setOnline(out.online);
          if (out.run === "gone") setRun(null);
          else if (out.run) setRun(out.run);
        } catch {
          // offline for a moment: try again next time
        }
      }
      if (!stopped) timer = setTimeout(tick, Date.now() - began > SLOW_AFTER_MS ? SLOW_MS : FAST_MS);
    };
    timer = setTimeout(tick, FAST_MS);
    const onShow = () => document.visibilityState === "visible" && (clearTimeout(timer), tick());
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [runId]);

  const begin = () =>
    start(async () => {
      setError("");
      const out = await startAutofill(jobId, resumeId);
      if ("error" in out) setError(out.error);
      else {
        setRun(out.run);
        setOnline(out.online);
      }
    });

  if (!platform) {
    return (
      <Card className="p-5">
        <CardTitle icon="sparkles">Autofill</CardTitle>
        <p className="text-sm text-muted">
          This job only has a job-board link (LinkedIn, Naukri, Indeed…). Their rules don&apos;t allow filling applications automatically, so
          use Apply and fill it there yourself.
        </p>
      </Card>
    );
  }

  return (
    <Card id="autofill" className="scroll-mt-6 p-5">
      <CardTitle icon="sparkles">Autofill in Chrome</CardTitle>

      {!active && (
        <>
          {run?.status === "submitted" && (
            <Callout tone="good" className="mb-3">
              <Icon name="check" className="mr-1 inline size-3.5" /> Submitted with autofill. It&apos;s in your tracker as Applied.
            </Callout>
          )}
          {run && (run.status === "error" || run.status === "cancelled") && (
            <Callout tone={run.status === "error" ? "bad" : "neutral"} className="mb-3">
              {run.message || (run.status === "error" ? "The last autofill stopped." : "Cancelled.")}
            </Callout>
          )}
          <p className="mb-3 text-sm text-muted">{HOW[platform]}</p>
          {resumes.length === 0 ? (
            <p className="text-sm text-muted">
              Autofill uploads a resume PDF.{" "}
              <Link href="/resumes" className="font-medium text-accent hover:underline">
                Add one on Resumes
              </Link>{" "}
              first (upload a PDF or save it as LaTeX).
            </p>
          ) : (
            <>
              <label className="label" htmlFor="af-resume">
                Resume to upload
              </label>
              <select id="af-resume" className="field" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                {[...new Set(resumes.map((r) => r.group))].map((g) => (
                  <optgroup key={g} label={g}>
                    {resumes
                      .filter((r) => r.group === g)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted">
                {resumes.length} resume{resumes.length === 1 ? "" : "s"} with a PDF.{" "}
                <Link href="/resumes" className="text-accent hover:underline">
                  Add or manage resumes
                </Link>
              </p>
              <Button variant="primary" className="mt-3 w-full" disabled={pending || !resumeId} onClick={begin}>
                {pending ? <Spinner /> : <Icon name="sparkles" className="size-3.5" />}
                {run ? "Autofill again" : "Autofill"}
              </Button>
              {error && <p className="mt-2 text-sm text-bad">{error}</p>}
              <p className="mt-3 text-xs text-muted">
                Needs the helper running on your laptop (<code>npm run helper</code>). Your answers live in{" "}
                <Link href="/profile#answers" className="text-accent hover:underline">
                  Profile → Application answers
                </Link>
                .
              </p>
            </>
          )}
        </>
      )}

      {run && active && (
        <ActiveRun run={run} online={online} company={company} jobId={jobId} onRun={setRun} />
      )}
    </Card>
  );
}

function ActiveRun({
  run,
  online,
  company,
  jobId,
  onRun,
}: {
  run: AutofillRunView;
  online: boolean;
  company: string;
  jobId: string;
  onRun: (r: AutofillRunView | null) => void;
}) {
  const [pending, start] = useTransition();
  const questions = run.report.questions ?? [];
  const filled = run.report.filled ?? [];
  const working = run.status === "queued" || run.status === "filling" || run.status === "answered";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 text-sm">
        {working ? <Spinner className="mt-0.5" /> : <Icon name={run.status === "review" ? "check" : "info"} className="mt-0.5 size-4 shrink-0 text-accent" />}
        <p>{statusLine(run)}</p>
      </div>

      {run.report.pages && run.report.pages.length > 0 && (
        <p className="text-xs text-muted">
          Pages: {run.report.pages.join(" → ")}
        </p>
      )}

      {run.status === "queued" && !online && (
        <Callout tone="warn">
          The helper isn&apos;t running on your laptop. In Terminal, inside your job-hunt folder, run <code>npm run helper</code>. It picks this
          up straight away. (First time? Link your laptop in{" "}
          <Link href="/settings#helper" className="font-medium underline">
            Settings
          </Link>
          .)
        </Callout>
      )}

      {(run.status === "needs_you" || run.status === "review") && questions.length > 0 && (
        <Questions key={run.version} questions={questions} company={company} disabled={pending} onSend={(answers) => start(async () => onRun(await answerAutofill(run.id, answers)))} />
      )}

      {run.report.notes && run.report.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {run.report.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}

      {filled.length > 0 && (
        <details className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none font-medium">
            Filled {filled.length} field{filled.length === 1 ? "" : "s"}
            {run.report.resume && " · resume attached"}
          </summary>
          <ul className="mt-2 space-y-1 text-muted">
            {filled.map((x, i) => (
              <li key={i}>
                <span className="text-ink">{x.label}</span>: {x.value}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {(run.status === "needs_you" || run.status === "waiting") && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            title="You did something in Chrome yourself: the helper looks at the form again and carries on"
            onClick={() => start(async () => onRun(await answerAutofill(run.id, [])))}
          >
            <Icon name="refresh" className="size-3.5" /> Carry on
          </Button>
        )}
        {(run.status === "review" || run.status === "needs_you" || run.status === "waiting") && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => onRun(await confirmSubmitted(run.id, jobId)))}>
            <Icon name="check" className="size-3.5" /> I submitted it
          </Button>
        )}
        <button
          type="button"
          className={buttonClass("ghost", "sm")}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await cancelAutofill(run.id);
              onRun({ ...run, status: "cancelled", message: "Cancelled." });
            })
          }
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** What pressing Autofill will do, by kind of form. */
const HOW: Record<AutofillPlatform, string> = {
  greenhouse: "Opens the Greenhouse form on your laptop and fills it with your profile and application answers. You check it and press Submit.",
  lever: "Opens the Lever form on your laptop and fills it with your profile and application answers. You check it and press Submit.",
  ashby: "Opens the Ashby form on your laptop and fills it with your profile and application answers. You check it and press Submit.",
  workday:
    "Opens the job on Workday and presses Apply. Workday needs an account for each company: you sign in (or create one) in the Chrome window, then it fills every page and stops at Review for you to submit.",
  site: `Opens the job on the ${PLATFORM_LABEL.site}. You press Apply and move through it; every form page is filled as soon as it appears. You submit at the end.`,
};

function statusLine(run: AutofillRunView): string {
  switch (run.status) {
    case "queued":
      return "Waiting for the helper on your laptop…";
    case "waiting":
      return run.message || "Waiting for you in the Chrome window…";
    case "filling":
    case "answered":
      return run.message || "Filling the form in Chrome…";
    case "needs_you":
      return run.report.step ? `${run.message} Answer here, or in Chrome:` : "Almost there. The form asks a few things only you can answer:";
    case "review":
      return "All filled. Check the form in Chrome, then press Submit there yourself.";
    default:
      return run.message;
  }
}

/** Questions the helper couldn't answer. Answers go straight to the form; ticked ones are remembered. */
function Questions({
  questions,
  company,
  disabled,
  onSend,
}: {
  questions: AutofillQuestion[];
  company: string;
  disabled: boolean;
  onSend: (answers: { label: string; value: string; remember: boolean }[]) => void;
}) {
  const answerable = questions.filter((q) => !q.agreement && !q.manual && q.kind !== "file");
  const yours = questions.filter((q) => q.agreement || q.manual || q.kind === "file");
  const [values, setValues] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(answerable.map((q) => [q.label, !isCompanySpecific(q.label, company)])),
  );
  const ready = answerable.some((q) => values[q.label]?.trim());

  return (
    <div className="space-y-3">
      {answerable.map((q, i) => (
        <div key={q.label + i} className="rounded-lg bg-surface-2 p-3">
          <label className="label" htmlFor={`afq-${i}`}>
            {q.label}
            {q.required && <span className="text-bad"> *</span>}
          </label>
          {q.options && q.options.length > 0 ? (
            <select id={`afq-${i}`} className="field" value={values[q.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.label]: e.target.value }))}>
              <option value="">Choose…</option>
              {q.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : q.kind === "date" ? (
            <input id={`afq-${i}`} type="date" className="field" value={values[q.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.label]: e.target.value }))} />
          ) : q.kind === "textarea" ? (
            <textarea id={`afq-${i}`} className="field min-h-24" value={values[q.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.label]: e.target.value }))} />
          ) : (
            <input id={`afq-${i}`} className="field" value={values[q.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.label]: e.target.value }))} />
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={remember[q.label] ?? true} onChange={(e) => setRemember((r) => ({ ...r, [q.label]: e.target.checked }))} />
            Remember for future forms
          </label>
        </div>
      ))}
      {yours.length > 0 && (
        <Callout tone="neutral">
          <p className="mb-1 font-medium">Do these yourself in Chrome:</p>
          <ul className="space-y-0.5">
            {yours.map((q, i) => (
              <li key={i}>
                · {q.label}
                {q.required && " (required)"}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {answerable.length > 0 && (
        <Button
          variant="primary"
          className="w-full"
          disabled={disabled || !ready}
          onClick={() =>
            onSend(answerable.filter((q) => values[q.label]?.trim()).map((q) => ({ label: q.label, value: values[q.label], remember: remember[q.label] ?? true })))
          }
        >
          Fill these in
        </Button>
      )}
    </div>
  );
}
