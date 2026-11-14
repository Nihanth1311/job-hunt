import { NextResponse, type NextRequest } from "next/server";

// First gate: no session cookie, no app. The session itself is checked against the database
// in the app layout and in every action and API route (requireUser), so a removed person or
// a forged cookie gets nowhere even though this check only looks for the cookie.
const SESSION_COOKIE = "jh_session";
// The laptop helper signs in with its own token (checked in every /api/helper route).
// The Home Screen manifest, icons and notification worker are fetched without the session cookie.
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/helper\//, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/app-icon\//, /^\/apple-icon/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
