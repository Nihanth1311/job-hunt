import { requireHelper } from "@/server/auth/helper";
import { helperReport } from "@/server/services/autofill";
import { RUN_STATUSES, type AutofillReport, type RunStatus } from "@/shared/autofill";

export const dynamic = "force-dynamic";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const list = <T>(v: unknown, max: number, each: (x: Record<string, unknown>) => T | null): T[] =>
  Array.isArray(v) ? v.slice(0, max).flatMap((x) => (x && typeof x === "object" ? (each(x as Record<string, unknown>) ?? []) : [])) : [];

/** Keep only what the site shows, at sensible sizes: the report comes from outside. */
function cleanReport(r: Record<string, unknown>): AutofillReport {
  return {
    filled: list(r.filled, 120, (x) => ({ label: text(x.label, 300), value: text(x.value, 300) })),
    questions: list(r.questions, 60, (x) => ({
      label: text(x.label, 500),
      kind: (text(x.kind, 20) || "text") as NonNullable<AutofillReport["questions"]>[number]["kind"],
      required: x.required === true,
      agreement: x.agreement === true,
      options: Array.isArray(x.options) ? x.options.slice(0, 80).map((o) => text(o, 200)).filter(Boolean) : undefined,
    })).filter((q) => q.label),
    notes: Array.isArray(r.notes) ? r.notes.slice(0, 20).map((n) => text(n, 300)).filter(Boolean) : [],
    resume: text(r.resume, 200) || undefined,
  };
}

/** The helper's report on one form. Answers with the run's status ("cancelled" = close the tab). */
export async function POST(request: Request, ctx: RouteContext<"/api/helper/runs/[id]">) {
  const uid = await requireHelper(request);
  if (uid instanceof Response) return uid;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !(RUN_STATUSES as readonly string[]).includes(String(body.status))) return Response.json({ error: "Bad report." }, { status: 400 });
  const status = await helperReport(uid, id, {
    status: body.status as RunStatus,
    message: text(body.message, 500),
    report: cleanReport((body.report as Record<string, unknown>) ?? {}),
  });
  return status ? Response.json({ status }) : Response.json({ error: "No such autofill." }, { status: 404 });
}
