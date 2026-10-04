"use client";

import { useState, useTransition } from "react";
import { rescoreJobs } from "@/actions/jobs";
import { savePreferencesAction, sendDigestNow, sendTestNotification } from "@/actions/settings";
import type { Preferences } from "@/lib/types";
import { Button, Card, CardTitle, Icon } from "./ui";

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const commas = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function SettingsForm({ prefs, telegramOn, telegram }: { prefs: Preferences; telegramOn: boolean; telegram: boolean }) {
  const [p, setP] = useState(prefs);
  const [text, setText] = useState({
    locations: prefs.locations.join(", "),
    searchQueries: prefs.searchQueries.join("\n"),
    careerPages: prefs.careerPages.join("\n"),
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const num = (k: keyof Preferences) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setP((x) => ({ ...x, [k]: Number(e.target.value) }));

  const save = () =>
    start(async () => {
      await savePreferencesAction({
        ...p,
        locations: commas(text.locations),
        searchQueries: lines(text.searchQueries),
        careerPages: lines(text.careerPages),
      });
      setMsg("Saved — jobs re-scored.");
    });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardTitle icon="search">What you&apos;re looking for</CardTitle>
        {/* Columns follow the card's own width (it shares the row with the sidebar column), and
            items-end keeps the inputs in line if a label ever wraps. */}
        <div className="@container">
          <div className="grid items-end gap-3 @sm:grid-cols-2 @2xl:grid-cols-4">
            <div>
              <label className="label" htmlFor="floor">Minimum salary (LPA)</label>
              <input id="floor" type="number" min={0} step={0.5} className="field" value={p.salaryFloorLpa} onChange={num("salaryFloorLpa")} />
            </div>
            <div>
              <label className="label" htmlFor="exp" title="Hide roles that ask for more years than this">
                Max experience asked (yrs)
              </label>
              <input id="exp" type="number" min={0} max={15} className="field" value={p.maxExperience} onChange={num("maxExperience")} />
            </div>
            <div className="@sm:col-span-2">
              <label className="label" htmlFor="cities">Preferred cities</label>
              <input
                id="cities"
                className="field"
                value={text.locations}
                onChange={(e) => setText((t) => ({ ...t, locations: e.target.value }))}
                placeholder="Anywhere in India, or e.g. Bengaluru, Pune"
              />
            </div>
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={p.showUnknownSalary} onChange={(e) => setP((x) => ({ ...x, showUnknownSalary: e.target.checked }))} />
          Show jobs that don&apos;t mention a salary (most Indian listings don&apos;t)
        </label>
      </Card>

      <Card className="p-5">
        <CardTitle icon="jobs">Where to look</CardTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="queries">Search keywords (one per line)</label>
            <textarea
              id="queries"
              className="field min-h-40"
              value={text.searchQueries}
              onChange={(e) => setText((t) => ({ ...t, searchQueries: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted">Used for Google Jobs searches.</p>
          </div>
          <div>
            <label className="label" htmlFor="careers">Extra career pages (one per line)</label>
            <textarea
              id="careers"
              className="field min-h-40 font-mono sm:text-xs"
              value={text.careerPages}
              onChange={(e) => setText((t) => ({ ...t, careerPages: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted">
              Format <code>lever:slug</code>, <code>greenhouse:slug</code> or <code>ashby:slug</code>. The slug is the last part of the
              careers URL, e.g. jobs.lever.co/<b>meesho</b>. Only India-based roles are kept.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="every">Check for new jobs every</label>
            <select id="every" className="field" value={p.fetchIntervalHours} onChange={num("fetchIntervalHours")}>
              {[1, 2, 3, 4, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} hour{h > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">You get a notification after each one that finds new jobs.</p>
          </div>
          <div>
            <label className="label" htmlFor="jq">Google Jobs searches per day</label>
            <input id="jq" type="number" min={0} max={10} className="field" value={p.jsearchQueriesPerDay} onChange={num("jsearchQueriesPerDay")} />
            <p className="mt-1 text-xs text-muted">Free plan: 200 a month. 5 a day ≈ 150.</p>
          </div>
        </div>
      </Card>

      {telegram && (
        <Card className="p-5">
          <CardTitle icon="bell">Telegram alerts</CardTitle>
          {!telegramOn && (
            <p className="-mt-2 mb-3 text-xs text-muted">
              Alerts go to your own Telegram bot. Add its token and your chat id in{" "}
              <a href="#keys" className="font-medium text-accent hover:underline">
                Your API keys
              </a>{" "}
              first.
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={p.morningDigest} onChange={(e) => setP((x) => ({ ...x, morningDigest: e.target.checked }))} />
            Morning digest at 9 AM: new jobs by category, top matches, follow-ups due
          </label>
          <div className="mt-3 max-w-xs">
            <label className="label" htmlFor="alert">Instant alert for new jobs scoring at least</label>
            <select id="alert" className="field" value={p.instantAlertScore} onChange={num("instantAlertScore")}>
              <option value={0}>Off</option>
              {[60, 70, 75, 80, 85, 90].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !telegramOn} onClick={() => start(async () => setMsg(await sendTestNotification()))}>
              Send test message
            </Button>
            <Button size="sm" disabled={pending || !telegramOn} onClick={() => start(async () => setMsg(await sendDigestNow()))}>
              Send digest now
            </Button>
          </div>
        </Card>
      )}

      <div className="panel-raised sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 md:bottom-4 flex flex-wrap items-center gap-3 rounded-xl p-3">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Working…" : "Save settings"}
        </Button>
        <Button
          disabled={pending}
          onClick={() => start(async () => setMsg(`Re-scored ${await rescoreJobs()} jobs.`))}
        >
          <Icon name="refresh" /> Re-score all jobs
        </Button>
        {msg && (
          <span className="inline-flex items-center gap-1 text-xs text-good">
            <Icon name="check" className="size-3.5" /> {msg}
          </span>
        )}
      </div>
    </div>
  );
}
