"use client";

import { useState, useTransition } from "react";
import { saveApplicationAnswers } from "@/server/actions/autofill";
import { ANSWER_FIELDS, ANSWER_GROUPS, type AnswerBank, type AnswerFields } from "@/shared/autofill";
import { Button, Card, Icon } from "../ui";

/**
 * The answers autofill puts on application forms. Contact details come from About you; these are
 * the other questions every form asks. Answers you give while autofilling are remembered below.
 */
export function ApplicationAnswers({ bank, suggestions }: { bank: AnswerBank; suggestions: Partial<AnswerFields> }) {
  // The usual answers show pre-selected; saving keeps them (change any that differ for you).
  const [fields, setFields] = useState<AnswerFields>(() => ({
    ...Object.fromEntries(ANSWER_FIELDS.filter((f) => f.default).map((f) => [f.key, f.default!])),
    ...bank.fields,
  }));
  const fromResume = Object.entries(suggestions).filter((e): e is [string, string] => !!e[1] && !fields[e[0]]?.trim());
  const useResume = () => setFields((x) => ({ ...x, ...Object.fromEntries(fromResume) }));
  const [learned, setLearned] = useState(bank.learned);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const remembered = Object.entries(learned);

  const save = () =>
    start(async () => {
      setMsg(await saveApplicationAnswers(fields, learned));
    });

  return (
    <Card id="answers" className="scroll-mt-6 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon name="document" className="size-3.5" />
        </span>
        Application answers
      </h2>
      <p className="mb-4 mt-1 max-w-2xl text-xs text-muted">
        Autofill types these into application forms, along with your name, email, phone, city and links from About you. The usual
        yes/no answers are already set; change any that are different for you. Leave a box empty and that question comes to you instead.
      </p>

      {fromResume.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          <span>
            Your resume has answers for {fromResume.length} empty box{fromResume.length === 1 ? "" : "es"} (
            {fromResume.map(([k]) => ANSWER_FIELDS.find((f) => f.key === k)?.label.toLowerCase()).join(", ")}).
          </span>
          <Button size="sm" variant="primary" onClick={useResume}>
            <Icon name="sparkles" className="size-3.5" /> Fill from my resume
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {ANSWER_GROUPS.map((group) => (
          <section key={group}>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{group}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ANSWER_FIELDS.filter((f) => f.group === group).map((f) => (
                <div key={f.key}>
                  <label className="label" htmlFor={`ans-${f.key}`}>
                    {f.label}
                  </label>
                  {f.options ? (
                    <select
                      id={`ans-${f.key}`}
                      className="field"
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))}
                    >
                      {!f.default && <option value="">Ask me each time</option>}
                      {f.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`ans-${f.key}`}
                      type={f.type === "date" ? "date" : "text"}
                      className="field"
                      value={fields[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))}
                    />
                  )}
                  {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Remembered answers · {remembered.length}</h3>
        <p className="mt-1 text-xs text-muted">Questions you answered while autofilling. They&apos;re reused whenever a form asks the same thing.</p>
        {remembered.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {remembered.map(([q, a]) => (
              <li key={q} className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                <span className="text-sm first-letter:uppercase">{bank.labels?.[q] ?? q.replace(/\{company\}/g, "[company]")}</span>
                <input className="field" value={a} aria-label={`Answer to ${q}`} onChange={(e) => setLearned((x) => ({ ...x, [q]: e.target.value }))} />
                <button
                  type="button"
                  className="justify-self-start text-xs text-muted hover:text-bad"
                  onClick={() =>
                    setLearned((x) => {
                      const next = { ...x };
                      delete next[q];
                      return next;
                    })
                  }
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save answers"}
        </Button>
        {msg && (
          <span className="inline-flex items-center gap-1 text-xs text-good">
            <Icon name="check" className="size-3.5" /> {msg}
          </span>
        )}
      </div>
    </Card>
  );
}
