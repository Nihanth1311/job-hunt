import { NextResponse, type NextRequest } from "next/server";
import { signInVerified, startSession } from "@/lib/auth";
import { unseal } from "@/lib/auth/crypto";
import { callbackUrl, OAUTH_COOKIE, siteUrl, verifiedProfile, type Flow } from "@/lib/auth/google";
import { onFirstSignIn } from "@/lib/accounts";

export const dynamic = "force-dynamic";

const toLogin = (req: NextRequest, error: string) => {
  const res = NextResponse.redirect(siteUrl(req, `/login?error=${error}`));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
};

/** Google sends people back here with a code. Check it's the flow we started, then sign them in. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return toLogin(req, "cancelled");

  const flow = unseal<Flow>(req.cookies.get(OAUTH_COOKIE)?.value);
  const code = params.get("code");
  if (!flow || !code || params.get("state") !== flow.state || flow.exp < Date.now()) return toLogin(req, "expired");

  let profile;
  try {
    profile = await verifiedProfile(code, flow.verifier, callbackUrl(req));
  } catch (e) {
    console.warn("[auth]", e instanceof Error ? e.message : e);
    return toLogin(req, "google");
  }

  const result = await signInVerified(profile);
  if (!result.ok) return toLogin(req, result.reason);

  await onFirstSignIn(result.user);
  await startSession(result.user.id);
  const res = NextResponse.redirect(siteUrl(req, flow.next));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}
