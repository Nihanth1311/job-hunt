"use client";

import { useState, useTransition } from "react";
import { inviteAction, removePersonAction } from "@/actions/settings";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { copyText } from "./claude";
import { Badge, Button, Card, Icon } from "./ui";

interface Row {
  email: string;
  name: string;
  image: string | null;
  role: string;
  userId: string | null;
  invited: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  /** Used the app in the last few minutes (worked out on the server). */
  active: boolean;
}

/** Everyone who can use the app, and whether they're using it now. Adding someone is tucked behind "+ Add person". */
export function PeopleManager({ people, me, max }: { people: Row[]; me: string; max: number }) {
  // Active people first, then most recently seen, then people who haven't signed in yet.
  const seen = (p: Row) => (p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : 0);
  const sorted = [...people].sort((a, b) => seen(b) - seen(a));

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon name="people" className="size-4 text-muted" />
          People · {people.length} of {max}
        </h2>
        <AddPerson full={people.length >= max} />
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((p) => (
          <PersonRow key={p.email} p={p} me={me} />
        ))}
      </ul>
    </Card>
  );
}

function Status({ p }: { p: Row }) {
  if (!p.userId) return <Badge tone="neutral">Hasn&apos;t signed in yet</Badge>;
  if (p.active) {
    return (
      <Badge tone="good">
        <span className="size-1.5 rounded-full bg-good" /> Active
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted" suppressHydrationWarning>
      {p.lastSeenAt ? `Last active ${timeAgo(p.lastSeenAt)}` : "Signed up"}
    </span>
  );
}

/** One person: who they are, whether they're active, and (for everyone but admins) taking access away. */
function PersonRow({ p, me }: { p: Row; me: string }) {
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
          {p.role === "admin" && <span className="ml-2 align-middle text-[11px] font-medium text-accent">Admin</span>}
        </p>
        {p.name && <p className="truncate text-xs text-muted">{p.email}</p>}
      </div>
      <Status p={p} />
      {p.role !== "admin" &&
        (confirm ? (
          <span className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(false)}>
              {p.userId ? "Remove, keep their data" : "Remove"}
            </Button>
            {p.userId && (
              <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(true)}>
                Remove and delete data
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} aria-label={`Remove ${p.email}`} className="rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-bad">
            <Icon name="x" className="size-4" />
          </button>
        ))}
    </li>
  );
}

/** "+ Add person": a Gmail field that opens on demand. Only Gmail accounts added here can sign in. */
function AddPerson({ full }: { full: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" disabled={full} onClick={() => (setOpen(true), setAdded(null))}>
        <Icon name="plus" className="size-3.5" /> {full ? "Full" : "Add person"}
      </Button>
    );
  }

  const link = window.location.origin;
  return (
    <div className="w-full rounded-lg bg-surface-2 p-3">
      {added ? (
        <div className="text-sm">
          <p className="font-medium text-good">{added} can now sign in.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface-solid px-2.5 py-1.5 text-xs ring-1 ring-line">{link}</code>
            <Button size="sm" onClick={() => copyText(link).then(setCopied)}>
              <Icon name={copied ? "check" : "copy"} className="size-3.5" /> {copied ? "Copied" : "Copy link"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setOpen(false), setCopied(false))}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const err = await inviteAction(email);
              setError(err);
              if (!err) {
                setAdded(email.trim());
                setEmail("");
              }
            });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their Gmail" className="field min-w-0 flex-1 basis-48 py-1.5" />
          <Button type="submit" size="sm" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setOpen(false), setError(null))}>
            Cancel
          </Button>
          {error && <p className="w-full text-xs text-bad">{error}</p>}
          <p className="w-full text-xs text-muted">Also add them as a test user in Google Cloud Console while sign-in is in Testing.</p>
        </form>
      )}
    </div>
  );
}
