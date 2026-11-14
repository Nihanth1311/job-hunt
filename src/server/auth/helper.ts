import "server-only";
import { helperUserId } from "../services/autofill";

/**
 * The laptop helper signs its requests with its own token (Authorization: Bearer jhh_…), made in
 * Settings → Laptop helper. It can only reach the /api/helper/ routes, never the rest of the site.
 */
export async function requireHelper(request: Request): Promise<string | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const userId = token ? await helperUserId(token) : null;
  return userId ?? Response.json({ error: "This laptop isn't linked any more. Link it again in Settings → Laptop helper." }, { status: 401 });
}
