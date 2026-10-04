// Every API address the screens use, in one place. Each one is served by the file at the same
// path under src/app/api/ (e.g. /api/fetch → src/app/api/fetch/route.ts).
//
// Most buttons don't need an address at all: they call server actions (src/server/actions/),
// which Next.js turns into requests for us. These are the few plain addresses: things a phone
// must not wait on, file uploads and downloads, and sign-in and sign-out.
// (/api/cron/fetch isn't here: only the alarm clocks call it, never the screens.)

export const API = {
  /** GET: is my fetch running, and how did my last one end? POST: start "Fetch now". */
  fetch: "/api/fetch",
  /** POST: stop my running "Fetch now". */
  fetchCancel: "/api/fetch/cancel",
  /** GET: download all my data as a JSON file. */
  exportData: "/api/export",
  /** POST (JSON body): restore from an "Export my data" file. */
  importData: "/api/import",
  /** GET: start Google sign-in; comes back to `next` afterwards. */
  googleSignIn: (next: string) => `/api/auth/google?next=${encodeURIComponent(next)}`,
  /** POST (form): sign in without Google, on your own computer during development only. */
  devSignIn: "/api/auth/dev",
  /** POST (form): sign out. */
  signOut: "/api/auth/logout",
} as const;
