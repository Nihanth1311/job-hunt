"use client";

import { useState, useTransition } from "react";
import { saveApiKeys, testJsearchKey } from "@/server/actions/settings";
import { Button, Card, CardTitle, Icon } from "../ui";

type Name = "jsearchKey" | "telegramBotToken" | "telegramChatId";

/**
 * Each person's own keys. Saved keys come back masked (never in full); typing a new value
 * replaces the old one, "Remove" deletes it. Stored encrypted on the server.
 */
export function ApiKeysCard({
  masked,
  quota,
  telegram,
}: {
  masked: Record<Name, string>;
  quota: { remaining: number; limit: number } | null;
  /** Telegram alerts are switched on for everyone (Admin page). */
  telegram: boolean;
}) {
  const [draft, setDraft] = useState<Partial<Record<Name, string>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (changes: Partial<Record<Name, string>>) =>
    start(async () => {
      setMsg(await saveApiKeys(changes));
      setDraft({});
    });
  const dirty = Object.values(draft).some((v) => v && v.trim());

  return (
    <Card id="keys" className="scroll-mt-6 p-5">
      <CardTitle icon="lock">Your API keys</CardTitle>
      <p className="-mt-2 max-w-2xl text-sm text-muted">
        Job Hunt runs on your own free keys, not the site owner&apos;s. They&apos;re stored encrypted, used only for your searches and
        alerts, and never shown again in full.
      </p>

      <div className={telegram ? "mt-5 grid gap-6 lg:grid-cols-2" : "mt-5 grid max-w-xl gap-6"}>
        <section>
          <h3 className="text-sm font-semibold">Google Jobs (JSearch)</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Adds LinkedIn, Naukri and Indeed jobs, about 50 a day. Free: 200 searches a month.{" "}
            <a href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              Get a key
            </a>{" "}
            (sign up, subscribe to the free Basic plan, copy <code>X-RapidAPI-Key</code>).
          </p>
          <KeyField
            label="RapidAPI key"
            saved={masked.jsearchKey}
            value={draft.jsearchKey ?? ""}
            onChange={(v) => setDraft((d) => ({ ...d, jsearchKey: v }))}
            onRemove={() => save({ jsearchKey: "" })}
          />
          {masked.jsearchKey && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => setMsg(await testJsearchKey()))}>
                Test key
              </Button>
              {quota && (
                <span>
                  {quota.remaining} of {quota.limit} searches left this month
                </span>
              )}
            </div>
          )}
        </section>

        {telegram && (
          <section>
            <h3 className="text-sm font-semibold">Telegram alerts</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Optional. In Telegram, message <b>@BotFather</b> → <code>/newbot</code> and copy the token. Then send your bot any message
              and open <code>api.telegram.org/bot&lt;token&gt;/getUpdates</code> to find your chat id.
            </p>
            <KeyField
              label="Bot token"
              saved={masked.telegramBotToken}
              value={draft.telegramBotToken ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, telegramBotToken: v }))}
              onRemove={() => save({ telegramBotToken: "" })}
            />
            <KeyField
              label="Chat id"
              saved={masked.telegramChatId}
              value={draft.telegramChatId ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, telegramChatId: v }))}
              onRemove={() => save({ telegramChatId: "" })}
            />
          </section>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="primary" disabled={!dirty || pending} onClick={() => save(draft)}>
          {pending ? "Saving…" : "Save keys"}
        </Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </Card>
  );
}

function KeyField({
  label,
  saved,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  saved: string;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="label mb-0">{label}</label>
        {saved && (
          <span className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-good">
              <Icon name="check" className="size-3" strokeWidth={2.5} /> Saved <span className="font-mono text-muted">{saved}</span>
            </span>
            <button type="button" onClick={onRemove} className="text-muted hover:text-bad">
              Remove
            </button>
          </span>
        )}
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={saved ? "Paste a new value to replace it" : "Paste it here"}
        className="field font-mono"
      />
    </div>
  );
}
