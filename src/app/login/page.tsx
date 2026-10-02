import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass, cx } from "@/components/ui";
import { devLoginAllowed, getSessionUser, googleConfigured, MAX_USERS } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "not-invited": "This Google account isn't on the invite list. Ask the person who runs this site to invite your Gmail address.",
  full: `This site is full (${MAX_USERS} people). Ask the admin to make room.`,
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long or was interrupted. Please try again.",
  google: "Google sign-in didn't go through. Please try again.",
  setup: "Google sign-in isn't set up on this server yet.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/");
  const { next, error } = await searchParams;
  const host = ((await headers()).get("host") ?? "").split(":")[0];
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const nextPath = typeof next === "string" ? next : "/";

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <ThemeToggle className="absolute right-4 top-4 z-10" />

      {/* Left: what this is */}
      <section className="hidden flex-col justify-between bg-ink p-12 text-bg lg:flex">
        <span className="text-sm font-semibold tracking-tight">Job Hunt</span>
        <div className="max-w-md">
          <h2 className="text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">
            Jobs you&apos;re actually <span className="text-accent">ready</span> to apply for.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-bg/70">
            Fresh roles from 90+ company careers sites, checked against your experience and skills, with a resume tailored for each one.
          </p>
        </div>
        <p className="text-xs text-bg/50">Invite only · up to {MAX_USERS} people</p>
      </section>

      {/* Right: sign in */}
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-ink">J</span>
          <h1 className="mt-6 text-3xl font-bold tracking-[-0.03em]">Sign in</h1>
          <p className="mt-2 text-sm text-muted">Use the Google account your invite was sent to.</p>

          {message && <p className="mt-6 rounded-lg border border-bad/25 bg-bad/8 px-4 py-3 text-sm text-bad">{message}</p>}

          {googleConfigured() ? (
            <a href={`/api/auth/google?next=${encodeURIComponent(nextPath)}`} className={cx(buttonClass("secondary"), "mt-8 h-12 w-full gap-3 text-[15px]")}>
              <GoogleMark />
              Continue with Google
            </a>
          ) : (
            <p className="mt-8 rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
              Google sign-in isn&apos;t set up yet. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the server&apos;s{" "}
              <code>.env</code> (see README).
            </p>
          )}

          {devLoginAllowed(host) && (
            <form action="/api/auth/dev" method="post" className="mt-3">
              <button className={cx(buttonClass("ghost"), "w-full")}>Continue as admin (this computer only)</button>
            </form>
          )}

          <p className="mt-10 text-xs leading-relaxed text-muted">
            We only read your name, email and profile photo from Google. Everything you add stays private to your account.
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
