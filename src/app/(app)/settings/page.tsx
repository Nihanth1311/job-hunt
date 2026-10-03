import type { Metadata } from "next";
import { ApiKeysCard } from "@/components/api-keys-card";
import { ClipSetup } from "@/components/clip-setup";
import { CompaniesCard } from "@/components/companies-card";
import { FetchButton } from "@/components/fetch-button";
import { PushCard } from "@/components/push-card";
import { RestoreBackup } from "@/components/restore-backup";
import { SettingsForm } from "@/components/settings-form";
import { Badge, buttonClass, Card, CardTitle, cx, Icon, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getPushMode, getPushSubs, vapidPublicKey } from "@/lib/notify/push";
import { telegramConfigured } from "@/lib/notify/telegram";
import { careerSiteCounts, recentFetchRuns } from "@/lib/queries";
import { nextSlot, slotTimesLabel } from "@/lib/core/schedule";
import { getWakeups } from "@/lib/scheduler";
import { getPreferences, getSecrets, getState, maskSecret } from "@/lib/settings";
import { SOURCES } from "@/lib/sources";
import { getCompanyHealth } from "@/lib/sources/companies";
import { COMPANIES, SECTORS } from "@/lib/sources/companies/registry";

export const metadata: Metadata = { title: "Settings" };

const ALARM_LABEL: Record<string, string> = {
  github: "GitHub Actions",
  cronjob: "cron-job.org",
  timer: "Server's own timer",
  startup: "Server start",
  cron: "Other",
};

const SETUP: Record<string, string> = {
  jsearch: "Add your key in Your API keys",
  greenhouse: "Add boards under Extra career pages",
  lever: "Add boards under Extra career pages",
  ashby: "Add boards under Extra career pages",
};

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Badge tone={ok ? "good" : "neutral"}>
      <span className={cx("size-1.5 rounded-full", ok ? "bg-good" : "bg-muted/60")} />
      {children}
    </Badge>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const uid = user.id;
  const [prefs, runs, jsearchQuota, health, inFeed, secrets, pushKey, pushMode, pushSubs, lastAuto, wakeups] = await Promise.all([
    getPreferences(uid),
    recentFetchRuns(uid, 12),
    getState<{ remaining: number; limit: number | null; at: string }>(uid, "jsearchQuota"),
    getCompanyHealth(),
    careerSiteCounts(uid),
    getSecrets(uid),
    vapidPublicKey(),
    getPushMode(uid),
    getPushSubs(uid),
    getState<string>(uid, "lastAutoFetchAt"),
    getWakeups(),
  ]);
  const nextAuto = new Date(nextSlot(prefs.fetchIntervalHours));
  const companyRows = COMPANIES.map((co) => ({
    id: co.id,
    name: co.name,
    sector: co.sector,
    status: health[co.id] ?? null,
    inFeed: inFeed[co.name] ?? 0,
  }));
  const telegramOn = telegramConfigured(secrets);

  return (
    <>
      <PageHeader title="Settings" subtitle="Your API keys, the companies you follow, and how your feed is filtered." actions={<FetchButton />} />

      <div className="mb-5">
        <ApiKeysCard
          masked={{
            jsearchKey: maskSecret(secrets.jsearchKey),
            telegramBotToken: maskSecret(secrets.telegramBotToken),
            telegramChatId: secrets.telegramChatId ?? "",
          }}
          quota={jsearchQuota ? { remaining: jsearchQuota.remaining, limit: jsearchQuota.limit ?? 200 } : null}
        />
      </div>

      <div className="mb-5">
        <PushCard publicKey={pushKey} mode={pushMode} devices={pushSubs.map((s) => s.device)} intervalHours={prefs.fetchIntervalHours} />
      </div>

      <div className="mb-5">
        <CompaniesCard companies={companyRows} skipped={prefs.skippedCompanies} sectors={SECTORS} />
      </div>

      <div className="mb-5">
        <ClipSetup />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SettingsForm prefs={prefs} telegramOn={telegramOn} />

        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle icon="database">Job sources</CardTitle>
            <ul className="divide-y divide-line text-sm">
              {SOURCES.map((s) => {
                const ok = s.configured(prefs, secrets);
                return (
                  <li key={s.id} className="py-2.5 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span>{s.label}</span>
                      <Status ok={ok}>{ok ? "On" : "Off"}</Status>
                    </div>
                    {s.id === "jsearch" && ok && jsearchQuota && (
                      <p className="mt-0.5 text-xs text-muted">
                        {jsearchQuota.remaining} of {jsearchQuota.limit ?? 200} requests left this month · runs once a day (
                        {prefs.jsearchQueriesPerDay} searches)
                      </p>
                    )}
                    {s.scope === "shared" && <p className="mt-0.5 text-xs text-muted">Checked for everyone every few hours; no key needed.</p>}
                    {!ok && SETUP[s.id] && <p className="mt-0.5 text-xs text-muted">{SETUP[s.id]}</p>}
                  </li>
                );
              })}
              <li className="py-2.5 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span>Telegram alerts</span>
                  <Status ok={telegramOn}>{telegramOn ? "On" : "Off"}</Status>
                </div>
                {!telegramOn && <p className="mt-0.5 text-xs text-muted">Add your bot token and chat id in Your API keys</p>}
              </li>
            </ul>
          </Card>

          <Card className="p-5">
            <CardTitle icon="refresh">Recent fetches</CardTitle>
            <p className="-mt-2 mb-3 text-xs text-muted">
              Automatic fetch {slotTimesLabel(prefs.fetchIntervalHours)}, India time.{" "}
              {lastAuto && <>Last: {formatDateTime(lastAuto)} · </>}next: {formatDateTime(nextAuto)} (within 10 minutes).
            </p>
            {user.role === "admin" && Object.keys(wakeups).length > 0 && (
              <div className="mb-3 rounded-lg bg-surface-2 p-3 text-xs">
                <p className="mb-1 font-medium">Alarm clocks: last time each woke the app</p>
                <ul className="space-y-0.5 text-muted">
                  {Object.entries(wakeups)
                    .sort((a, b) => b[1].localeCompare(a[1]))
                    .map(([via, at]) => (
                      <li key={via} className="flex justify-between gap-2">
                        <span>{ALARM_LABEL[via] ?? via}</span>
                        <span title={formatDateTime(at)}>{timeAgo(at)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {runs.length === 0 ? (
              <p className="text-sm text-muted">Nothing fetched yet. Press “Fetch now”.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <span className="text-muted">
                      {formatDateTime(r.startedAt)} · {r.source}
                      {r.userId === "" && " (shared)"}
                    </span>
                    <span className={cx("text-right", r.error ? "text-bad" : "text-good")} title={r.error ?? undefined}>
                      {r.error ? `error: ${r.error.slice(0, 60)}` : r.finishedAt ? `${r.fetched} found, +${r.inserted} new` : "running…"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardTitle icon="lock">Your account</CardTitle>
            <p className="-mt-2 mb-4 text-sm text-muted">
              Signed in as <b className="text-ink">{user.email}</b>
              {user.role === "admin" && " · admin"}. Your jobs, profile, resumes and keys are visible only to you.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/export" className={buttonClass("secondary", "sm")}>
                <Icon name="download" className="size-3.5" /> Export my data (JSON)
              </a>
              <RestoreBackup />
              {user.role === "admin" && (
                <a href="/admin" className={buttonClass("secondary", "sm")}>
                  <Icon name="people" className="size-3.5" /> People
                </a>
              )}
              <form action="/api/auth/logout" method="post">
                <button className={buttonClass("ghost", "sm")}>
                  <Icon name="logout" className="size-3.5" /> Sign out
                </button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
