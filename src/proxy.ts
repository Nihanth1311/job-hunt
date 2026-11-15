import { NextResponse, type NextRequest } from "next/server";

// Next.js runs proxy() before every request that `config.matcher` (bottom of this file) lets
// through, ahead of any page or API route. (Older Next.js versions called this file "middleware".)
//
// First gate: no session cookie, no app. The session itself is checked against the database
// in the app layout and in every action and API route (requireUser), so a removed person or
// a forged cookie gets nowhere even though this check only looks for the cookie.
const SESSION_COOKIE = "jh_session";
// Addresses that must work without a session cookie:
//   /login and /api/auth/…   signing in is how you get the cookie
//   /api/cron/…              the alarm clocks (GitHub Actions, cron-job.org); checked with CRON_SECRET in the route
//   /api/helper/…            the laptop helper; checked with its own token in every route (requireHelper)
//   /sw.js, the manifest and the icons: the phone fetches these without the cookie
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/helper\//, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/app-icon\//, /^\/apple-icon/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  // No cookie. An API call gets a plain 401; a page is sent to /login, which remembers where
  // you were going (?next=…) so sign-in can bring you back.
  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

// Run on everything except Next.js's own static files and a few public files (no sign-in needed for those).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
