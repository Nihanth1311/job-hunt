import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured, secureCookies } from "@/lib/auth";
import { seal } from "@/lib/auth/crypto";
import { authorizeUrl, callbackUrl, newFlow, OAUTH_COOKIE, safeNext } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/** "Continue with Google": remember state + PKCE verifier in a sealed cookie, then off to Google. */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=setup", req.url));
  const flow = newFlow(safeNext(req.nextUrl.searchParams.get("next")));
  const res = NextResponse.redirect(authorizeUrl(flow, callbackUrl(req)));
  res.cookies.set(OAUTH_COOKIE, seal(flow), { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/api/auth", maxAge: 600 });
  return res;
}
