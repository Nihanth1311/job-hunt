"use client";

import { useState, useTransition } from "react";
import { inviteAction, removePersonAction } from "@/actions/settings";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { Badge, Button, Card, CardTitle } from "./ui";

interface Row {
  email: string;
  name: string;
  image: string | null;
  role: string;
  userId: string | null;
  invited: boolean;
  lastLoginAt: string | null;
}

/** Invite people by Gmail address; take access away (optionally deleting their data). */
export function PeopleManager({ people, me, max }: { people: Row[]; me: string; max: number }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);

  const add = () =>
    start(async () => {
      const error = await inviteAction(email);
      setMsg(error ?? `Invited ${email.trim()}. They can now sign in with Google.`);
      if (!error) setEmail("");
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-5">
        <CardTitle icon="profile">
          People · {people.length} of {max}
        </CardTitle>
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.email} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={p.name || p.email} image={p.image} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.name || p.email}
                  {p.email === me && <span className="font-normal text-muted"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted" suppressHydrationWarning>
                  {p.email} · {p.userId ? (p.lastLoginAt ? `last signed in ${timeAgo(p.lastLoginAt)}` : "signed up") : "invited, hasn't signed in yet"}
                </p>
              </div>
              {p.role === "admin" ? (
                <Badge tone="accent">Admin</Badge>
              ) : confirm === p.email ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => (await removePersonAction(p.email, false), setConfirm(null)))}>
                    Remove access only
                  </Button>
                  {p.userId && (
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => (await removePersonAction(p.email, true), setConfirm(null)))}>
                      Remove and delete their data
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirm(p.email)}>
                  {p.userId ? "Remove" : "Cancel invite"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="h-fit p-5">
        <CardTitle icon="plus">Invite someone</CardTitle>
        <p className="-mt-2 mb-4 text-sm text-muted">They sign in with this Google account. Nobody else can get in.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="space-y-3"
        >
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" className="field" />
          <Button type="submit" variant="primary" className="w-full" disabled={pending || people.length >= max}>
            {people.length >= max ? `Full (${max} people)` : "Send invite"}
          </Button>
        </form>
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          There&apos;s no email sent: just tell them the site&apos;s address. Removing someone signs them out everywhere straight away.
        </p>
      </Card>
    </div>
  );
}
