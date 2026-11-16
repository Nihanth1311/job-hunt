import { NextResponse, type NextRequest } from "next/server";
import { adminEmails, devLoginAllowed, signInVerified, startSession } from "@/server/auth";
import { onFirstSignIn } from "@/server/services/accounts";
import { siteUrl } from "@/server/auth/google";

export const dynamic = "force-dynamic";

// Local development only: sign in as the admin without Google (see devLoginAllowed).
export async function POST(req: NextRequest) {
  if (!devLoginAllowed(req.nextUrl.hostname)) return new NextResponse("Not available", { status: 404 });
  // Two more refusals. Next.js records where a request came from in X-Forwarded-For; through a
  // proxy or tunnel that list holds an outside address, and then this isn't a request from this
  // computer. And the form must have been sent by this site's own login page: browsers mark a
  // post from any other website as "cross-site".
  // What this can't stop: someone on your network who reaches the dev server directly and forges
  // those headers. Don't run `npm run dev` on a network you don't trust.
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (hops.some((h) => !local.includes(h))) return new NextResponse("Not available", { status: 404 });
  const from = req.headers.get("sec-fetch-site");
  if (from && from !== "same-origin" && from !== "none") return new NextResponse("Not available", { status: 404 });
  // Optionally sign in as someone you've invited, to try the app as them (the invite is still checked).
  const asEmail = String((await req.formData().catch(() => null))?.get("email") ?? "").trim();
  const email = asEmail || adminEmails()[0];
  const result = await signInVerified({ email, name: "", image: null });
  if (!result.ok) return NextResponse.redirect(siteUrl(req, "/login?error=not-invited"), 303);
  await onFirstSignIn(result.user);
  await startSession(result.user.id);
  return NextResponse.redirect(siteUrl(req, "/"), 303);
}
