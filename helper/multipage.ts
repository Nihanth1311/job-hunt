// Forms spread over several pages.
//
// Workday: press Apply, choose how to apply ("Use My Last Application", "Autofill with Resume"),
// wait while you sign in or create your account (it never types passwords or codes), then fill
// each page and press Save and Continue, until the page whose button would submit. There it stops.
//
// Any other company site (guided): you move through the site in the helper's Chrome; every
// time a new form page appears, it's filled. You press Next and, at the end, Submit.

import type { Page } from "playwright-core";
import type { AutofillQuestion, AutofillReport, HelperTask, RunStatus } from "../src/shared/autofill";
import { fillForm } from "./fill";
import { NEXT_JS, SCAN_JS, START_JS, STATE_JS, type FormField, type PageState } from "./scan";

const MAX_PAGES = 15;
const MAX_STARTS = 4;

/** One multi-page application being worked through. */
export interface Flow {
  page: Page;
  task: HelperTask;
  resumePath: string | null;
  /** Workday: press Next itself. Guided sites: you press Next. */
  autoNext: boolean;
  starts: number;
  resumeDone: boolean;
  resume?: string;
  pages: string[];
  filled: { label: string; value: string }[];
  /** What the page looked like when last handled, to notice when it changes. */
  sig: string;
  index: number;
  status: RunStatus | null;
  busy: boolean;
}

export interface Outcome {
  status: RunStatus;
  message: string;
  report: AutofillReport;
}

const state = (page: Page) => page.evaluate(STATE_JS) as Promise<PageState>;
const scan = (page: Page) => page.evaluate(SCAN_JS) as Promise<FormField[]>;

/** A page worth filling: the application itself, not a job description with a search box. */
const isForm = (fields: FormField[]) => fields.some((f) => f.kind === "file") || fields.filter((f) => f.kind !== "file").length >= 3;

export function signature(s: PageState, fields: FormField[]): string {
  return [s.gate ? "gate" : "", s.step || s.heading, s.url, fields.slice(0, 6).map((f) => f.label).join("|")].join("::");
}

/** The page as it is now, cheaply: for noticing that you signed in or moved on. */
export async function look(page: Page): Promise<{ sig: string; index: number; gate: boolean }> {
  const s = await state(page);
  return { sig: signature(s, await scan(page)), index: s.index, gate: s.gate };
}

/** Wait for a Workday-style page to finish loading and draw itself. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForFunction("!document.querySelector('[data-automation-id=loadingSpinner], [data-automation-id=wd-LoadingPanel]')", null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/**
 * Work through the application from wherever it is now, until it needs you (sign in, a
 * question, the Submit button) or, on guided sites, until this page is filled.
 */
export async function advance(flow: Flow): Promise<Outcome> {
  const { page, task } = flow;
  let questions: AutofillQuestion[] = [];
  const notes: string[] = [];
  const out = (status: RunStatus, message: string): Outcome => {
    flow.status = status;
    return {
      status,
      message,
      report: { filled: flow.filled, questions, notes, resume: flow.resume, step: flow.pages[flow.pages.length - 1], pages: flow.pages },
    };
  };

  for (let i = 0; i < MAX_PAGES; i++) {
    await settle(page);
    const s = await state(page);
    let fields = await scan(page);
    flow.sig = signature(s, fields);
    flow.index = s.index;

    if (s.gate) {
      return out("waiting", "Sign in, or create your account, in the Chrome window. The helper never types passwords or codes; it carries on by itself once you're in.");
    }

    if (!isForm(fields)) {
      if (flow.autoNext && flow.starts < MAX_STARTS) {
        const start = (await page.evaluate(`${START_JS}(${flow.resumePath ? "true" : "false"})`)) as string;
        if (start) {
          flow.starts++;
          await page.locator("[data-jh-start]").first().click();
          await page.waitForTimeout(2000);
          continue;
        }
      }
      const next = (await page.evaluate(NEXT_JS)) as { kind: string; text: string };
      if (next.kind === "submit" && flow.pages.length) {
        return out("review", `All pages are filled. Check everything in Chrome (Back takes you through the pages), then press ${next.text || "Submit"} yourself.`);
      }
      return out(
        "waiting",
        flow.autoNext
          ? "Waiting for the application form in Chrome. If it's stuck, press Apply there; it carries on by itself."
          : "In Chrome, press Apply on the company's page (and sign in if it asks). Each form page is filled as soon as it appears.",
      );
    }

    const step = s.step || s.heading || `Page ${flow.pages.length + 1}`;
    if (!flow.pages.includes(step)) flow.pages.push(step);
    const result = await fillForm(page, task, flow.resumePath, { multipage: true, resumeDone: flow.resumeDone });
    if (result.uploaded) {
      flow.resumeDone = true;
      flow.resume ??= result.report.resume;
    }
    const fresh = new Set((result.report.filled ?? []).map((x) => x.label));
    flow.filled = [...flow.filled.filter((x) => !fresh.has(x.label)), ...(result.report.filled ?? [])];
    questions = result.report.questions ?? [];
    notes.push(...(result.report.notes ?? []));
    fields = await scan(page);
    flow.sig = signature(await state(page), fields);

    if (result.blocking > 0) {
      return out("needs_you", `Stopped on “${step}”: ${result.blocking} required question${result.blocking === 1 ? "" : "s"} need${result.blocking === 1 ? "s" : ""} you.`);
    }
    if (result.yoursInChrome > 0 && flow.autoNext) {
      // Workday won't move on without these; better to say so than press Next into an error.
      return out("needs_you", `Stopped on “${step}”: do the item${result.yoursInChrome === 1 ? "" : "s"} below in Chrome, then press Save and Continue there (or Carry on here).`);
    }

    const next = (await page.evaluate(NEXT_JS)) as { kind: string; text: string; disabled?: boolean };
    if (next.kind === "submit") {
      return out("review", `All pages are filled. Check everything in Chrome, then press ${next.text || "Submit"} yourself.`);
    }
    if (!flow.autoNext) {
      return out("waiting", `Filled “${step}”. Check it and press ${next.text || "Next"} in Chrome; the next page fills itself. Press Submit yourself at the end.`);
    }
    if (next.kind === "none") {
      return out("waiting", `Couldn't find a Next button on “${step}”. Move on in Chrome and it carries on.`);
    }
    if (next.disabled) {
      await page.waitForSelector("[data-jh-next]:not([disabled]):not([aria-disabled=true])", { timeout: 15_000 }).catch(() => {});
    }

    // Press Next and wait for the page to change, or for the form to say what's wrong.
    const before = flow.sig;
    await page.locator("[data-jh-next]").first().click();
    let moved = false;
    let errors: string[] = [];
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(500);
      const now = await state(page);
      if (signature(now, await scan(page)) !== before) {
        moved = true;
        break;
      }
      errors = now.errors;
      if (errors.length && t > 4) break;
    }
    if (!moved) {
      notes.push(...errors.map((e) => `The form says: ${e}`));
      return out("needs_you", `Couldn't leave “${step}”. Fix what the form points out in Chrome, then press Next there (or Carry on here).`);
    }
  }
  return out("waiting", "Stopped after many pages. Have a look at the form in Chrome.");
}
