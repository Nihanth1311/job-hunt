import { NextResponse, type NextRequest } from "next/server";
import { adminEmails, devLoginAllowed, signInVerified, startSession } from "@/lib/auth";
import { onFirstSignIn } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Local development only: sign in as the admin without Google (see devLoginAllowed).
export async function POST(req: NextRequest) {
  if (!devLoginAllowed(req.nextUrl.hostname)) return new NextResponse("Not available", { status: 404 });
  // Optionally sign in as someone you've invited, to try the app as them (the invite is still checked).
  const asEmail = String((await req.formData().catch(() => null))?.get("email") ?? "").trim();
  const email = asEmail || adminEmails()[0];
  const result = await signInVerified({ email, name: "", image: null });
  if (!result.ok) return NextResponse.redirect(new URL("/login?error=not-invited", req.url), 303);
  await onFirstSignIn(result.user);
  await startSession(result.user.id);
  return NextResponse.redirect(new URL("/", req.url), 303);
}
