import { NextResponse, type NextRequest } from "next/server";
import { adminEmails, devLoginAllowed, signInVerified, startSession } from "@/server/auth";
import { onFirstSignIn } from "@/server/services/accounts";
import { siteUrl } from "@/server/auth/google";

export const dynamic = "force-dynamic";

// Local development only: sign in as the admin without Google (see devLoginAllowed).
export async function POST(req: NextRequest) {
  if (!devLoginAllowed(req.nextUrl.hostname)) return new NextResponse("Not available", { status: 404 });
  // Optionally sign in as someone you've invited, to try the app as them (the invite is still checked).
  const asEmail = String((await req.formData().catch(() => null))?.get("email") ?? "").trim();
  const email = asEmail || adminEmails()[0];
  const result = await signInVerified({ email, name: "", image: null });
  if (!result.ok) return NextResponse.redirect(siteUrl(req, "/login?error=not-invited"), 303);
  await onFirstSignIn(result.user);
  await startSession(result.user.id);
  return NextResponse.redirect(siteUrl(req, "/"), 303);
}
