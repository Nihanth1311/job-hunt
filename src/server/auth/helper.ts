import "server-only";
import { helperUserId } from "../services/autofill";
import { sha256 } from "./crypto";
import { callerOf, isBlocked, isKnownGood, noteFailure, rememberGood } from "./rate-limit";

const WINDOW_MS = 10 * 60_000;

/**
 * The laptop helper signs its requests with its own token (Authorization: Bearer jhh_…), made in
 * Settings → Laptop helper. It can only reach the /api/helper/ routes, never the rest of the site.
 */
export async function requireHelper(request: Request): Promise<string | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const who = callerOf(request.headers);
  const refuse = (status: number, error: string) => Response.json({ error }, { status });
  // A linked laptop's token is answered from memory (see helperUserId), so it never waits here.
  // Unknown tokens: 20 wrong ones in 10 minutes and that caller is turned away before the database.
  if (token && !isKnownGood(sha256(token)) && isBlocked("helper", who, 20)) return refuse(429, "Too many attempts. Try again in a few minutes.");
  const userId = token ? await helperUserId(token) : null;
  if (!userId) {
    noteFailure("helper", who, WINDOW_MS);
    return refuse(401, "This laptop isn't linked any more. Link it again in Settings → Laptop helper.");
  }
  rememberGood(sha256(token));
  return userId;
}
