import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { randomToken } from "./crypto";

// Google sign-in with the authorization-code flow + PKCE. The ID token comes straight from
// Google's token endpoint over TLS, so (per OpenID Connect) its claims can be trusted
// after checking issuer, audience, expiry and that the email is verified.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const OAUTH_COOKIE = "jh_oauth";

/**
 * The site's public address. Behind a host like Render the server itself listens on an internal
 * address (http://0.0.0.0:10000), so never build links from req.url: use APP_URL, or the
 * address the browser actually asked for.
 */
export function siteOrigin(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

/** An absolute link on this site, for redirects. */
export const siteUrl = (req: NextRequest, path: string) => new URL(path, siteOrigin(req));

/** Where Google sends people back. Set APP_URL when hosted (e.g. https://jobs.example.com). */
export function callbackUrl(req: NextRequest): string {
  return `${siteOrigin(req)}/api/auth/google/callback`;
}

export function newFlow(next: string) {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state: randomToken(24), verifier, challenge, next, exp: Date.now() + 10 * 60_000 };
}
export type Flow = ReturnType<typeof newFlow>;

export function authorizeUrl(flow: Flow, redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    code_challenge: flow.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${q}`;
}

interface IdClaims {
  iss: string;
  aud: string;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Trade the code for an ID token and return the verified Google profile. */
export async function verifiedProfile(code: string, verifier: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google sent no ID token");

  const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")) as IdClaims;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw new Error("Wrong token issuer");
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("Token is for a different app");
  if (claims.exp * 1000 < Date.now()) throw new Error("Token expired");
  if (!claims.email || claims.email_verified !== true) throw new Error("Google account email isn't verified");

  return { email: claims.email, name: claims.name ?? "", image: claims.picture ?? null };
}

/** Only redirect inside this site after sign-in. */
export const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");
