"use client";

import { useState, useTransition } from "react";
import { inviteAction, removePersonAction } from "@/actions/settings";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { copyText } from "./claude";
import { Badge, Button, Card, CardTitle, Icon } from "./ui";

interface Row {
  email: string;
  name: string;
  image: string | null;
  role: string;
  userId: string | null;
  invited: boolean;
  lastLoginAt: string | null;
}

/**
 * Who has access: people already using the app, and people who've been given access but
 * haven't signed in yet. Give access by Gmail; take it away (optionally deleting their data).
 */
export function PeopleManager({ people, me, max }: { people: Row[]; me: string; max: number }) {
  const [email, setEmail] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const using = people.filter((p) => p.userId);
  const waiting = people.filter((p) => !p.userId);
  const full = people.length >= max;

  const add = () =>
    start(async () => {
      const e = email.trim();
      const err = await inviteAction(e);
      setError(err);
      setAdded(err ? null : e);
      if (!err) setEmail("");
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-5">
        <CardTitle icon="people">
          Who has access · {people.length} of {max}
        </CardTitle>

        <Section title="Using the app" count={using.length} empty="Nobody has signed in yet.">
          {using.map((p) => (
            <PersonRow key={p.email} p={p} me={me}>
              <span suppressHydrationWarning>{p.lastLoginAt ? `Active ${timeAgo(p.lastLoginAt)}` : "Signed up"}</span>
            </PersonRow>
          ))}
        </Section>

        {waiting.length > 0 && (
          <Section title="Hasn't signed in yet" count={waiting.length}>
            {waiting.map((p) => (
              <PersonRow key={p.email} p={p} me={me}>
                Can sign in with Google
              </PersonRow>
            ))}
          </Section>
        )}
      </Card>

      <Card className="h-fit p-5">
        <CardTitle icon="plus">Give someone access</CardTitle>
        <p className="-mt-2 mb-4 text-sm text-muted">Add their Gmail. Only Google accounts on this list can sign in.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="space-y-3"
        >
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" className="field" />
          <Button type="submit" variant="primary" className="w-full" disabled={pending || full}>
            {full ? `Full (${max} people)` : pending ? "Adding…" : "Give access"}
          </Button>
        </form>

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        {added && <SharePrompt email={added} />}

        <p className="mt-4 text-xs leading-relaxed text-muted">
          While your Google sign-in is in <b>Testing</b>, also add their Gmail as a test user in Google Cloud Console (OAuth consent
          screen → Audience), or publish the app once.
        </p>
      </Card>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty?: string; children: React.ReactNode }) {
  return (
    <section className="mt-1 first-of-type:mt-0 [&+section]:mt-5">
      <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {title} <span className="tabular-nums">{count}</span>
      </h3>
      {count === 0 && empty ? <p className="py-3 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

/** One person: who they are, their status, and (for everyone but admins) taking access away. */
function PersonRow({ p, me, children }: { p: Row; me: string; children: React.ReactNode }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const remove = (deleteData: boolean) => start(async () => (await removePersonAction(p.email, deleteData), setConfirm(false)));

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar name={p.name || p.email} image={p.image} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {p.name || p.email}
          {p.email === me && <span className="font-normal text-muted"> (you)</span>}
        </p>
        <p className="truncate text-xs text-muted">
          {p.name && `${p.email} · `}
          {children}
        </p>
      </div>
      {p.role === "admin" ? (
        <Badge tone="accent">Admin</Badge>
      ) : confirm ? (
        <span className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(false)}>
            {p.userId ? "Remove access, keep their data" : "Remove access"}
          </Button>
          {p.userId && (
            <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(true)}>
              Remove and delete their data
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Remove access
        </Button>
      )}
    </li>
  );
}

/** After giving access: the link to send them, with a copy button. No email is sent. */
function SharePrompt({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="mt-4 rounded-lg bg-good/8 p-3.5 text-sm ring-1 ring-inset ring-good/20">
      <p className="flex items-center gap-1.5 font-medium text-good">
        <Icon name="check" className="size-4" strokeWidth={2.5} /> {email} now has access
      </p>
      <p className="mt-1 text-muted">Send them this link to sign in with Google:</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface-solid px-2.5 py-1.5 text-xs ring-1 ring-line">{link}</code>
        <Button size="sm" onClick={() => copyText(link).then((ok) => setCopied(ok))}>
          <Icon name={copied ? "check" : "copy"} className="size-3.5" /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
