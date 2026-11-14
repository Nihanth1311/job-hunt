// Filling one application form. For each question: work out the answer (src/shared/autofill.ts),
// fit it to the field (a dropdown's own wording, a radio button), and put it in. What it can't
// answer, or mustn't (agreements), goes back to you on the site. It never presses Submit.

import type { Page } from "playwright-core";
import { decide, pickOption, type AutofillQuestion, type AutofillReport, type HelperTask } from "../src/shared/autofill";
import { OPTIONS_JS, SCAN_JS, type FormField } from "./scan";

export interface FillResult {
  report: AutofillReport;
  /** Required questions still waiting for you (agreements and files you add yourself aren't counted). */
  blocking: number;
  /** The resume went onto this page. */
  uploaded: boolean;
  /** Required things only you can do in Chrome: tick a consent box, attach a file, fill a work-history entry. */
  yoursInChrome: number;
}

export interface FillOptions {
  /** A form spread over several pages (Workday, guided company sites). */
  multipage?: boolean;
  /** The resume is already on this application (an earlier page), so a non-required box can stay empty. */
  resumeDone?: boolean;
}

const RESUME = /resume|\bcv\b|curriculum/i;
const COVER = /cover ?letter/i;
const AUTOFILL_BOX = /autofill from resume|autofill with resume|parse your resume|upload your resume here to autofill/i;
const YES = /^(yes|y|true|checked|i agree)$/i;
const OPTIONAL_LINK = /\b(url|website|link|portfolio|blog|profile)\b/i;
const NO = /^(no|n|false|unchecked)$/i;

const scan = (page: Page) => page.evaluate(SCAN_JS) as Promise<FormField[]>;
const at = (page: Page, f: FormField) => page.locator(`[data-jh="${f.id}"]`).first();
const short = (v: string) => (v.length > 80 ? `${v.slice(0, 77)}…` : v);

/** Wait until the form has drawn itself (these are React pages). */
export async function waitForForm(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector("input:not([type=hidden]), textarea", { timeout: 30_000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(1500);
  return true;
}

/**
 * Fill everything it can. Safe to run again on the same page: fields that already hold
 * something (from you, from an earlier pass or from the site's own resume reader) are left alone.
 */
export async function fillForm(page: Page, task: HelperTask, resumePath: string | null, opts: FillOptions = {}): Promise<FillResult> {
  const filled: { label: string; value: string }[] = [];
  const questions: AutofillQuestion[] = [];
  const notes: string[] = [];
  let resumeName: string | undefined;
  const ctx = { contact: task.contact, bank: task.bank, runAnswers: task.runAnswers, company: task.job.company };

  // The resume first: some forms (Lever) read it and fill name and email themselves.
  let fields = await scan(page);
  const files = fields.filter((f) => f.kind === "file" && !COVER.test(`${f.label} ${f.context}`));
  let resumeField = files.find((f) => RESUME.test(`${f.label} ${f.context}`) && (opts.multipage || !AUTOFILL_BOX.test(f.context ?? "")));
  // Workday's first page ("Autofill with Resume") has one unnamed upload box: that's the resume.
  if (!resumeField && opts.multipage && files.length === 1) resumeField = files[0];
  const wantResume = resumeField && !resumeField.hasFile && !(opts.resumeDone && !resumeField.required);
  let uploaded = false;
  if (!wantResume) {
    if (!resumeField && !opts.multipage) notes.push("No resume upload on this form.");
  } else if (resumePath && process.env.HELPER_NO_UPLOAD) {
    notes.push("Test mode (HELPER_NO_UPLOAD): the resume wasn't attached.");
  } else if (resumePath && resumeField) {
    try {
      await at(page, resumeField).setInputFiles(resumePath);
      resumeName = resumePath.split("/").pop();
      uploaded = true;
      filled.push({ label: resumeField.label || "Resume", value: resumeName ?? "resume.pdf" });
      await page.waitForTimeout(opts.multipage ? 5000 : 2500); // Workday reads the resume before going on
      fields = await scan(page);
    } catch (e) {
      notes.push(`Couldn't attach your resume (${(e as Error).message.split("\n")[0]}). Attach it in Chrome.`);
    }
  }

  // Answering a question can reveal another ("If yes, which…?"), so look again after each pass.
  const done = new Set<string>(resumeField ? [resumeField.id] : []);
  for (let pass = 0; pass < 3; pass++) {
    const todo = fields.filter((f) => !done.has(f.id));
    if (!todo.length) break;
    for (const f of todo) {
      done.add(f.id);
      await fillField(page, f, ctx, filled, questions, notes);
    }
    await page.waitForTimeout(600);
    fields = await scan(page);
  }

  const seen = new Set<string>();
  const unique = questions.filter((q) => (seen.has(q.label) ? false : (seen.add(q.label), true)));
  const blocking = unique.filter((q) => q.required && !q.agreement && !q.manual).length;
  const yoursInChrome = unique.filter((q) => q.required && (q.agreement || q.manual)).length;
  return { report: { filled, questions: unique, notes, resume: resumeName }, blocking, uploaded, yoursInChrome };
}

async function fillField(
  page: Page,
  f: FormField,
  ctx: Parameters<typeof decide>[1],
  filled: { label: string; value: string }[],
  questions: AutofillQuestion[],
  notes: string[],
) {
  const label = f.label || "(unlabelled question)";
  if (f.kind === "file") {
    // The resume is done; a cover letter or other document is yours to add for now.
    if (!f.hasFile && !AUTOFILL_BOX.test(f.context ?? "") && f.required)
      questions.push({ label: COVER.test(`${f.label} ${f.context}`) ? "Cover letter (attach it in Chrome)" : `${label} (attach it in Chrome)`, kind: "file", required: true, manual: true });
    return;
  }
  if (f.value) return; // already answered: never overwrite
  if (f.inSection) {
    // Work history, education…: Workday fills these from your resume; what's still missing is yours.
    if (f.required) questions.push({ label: `${label} (fill in Chrome)`, kind: f.kind, required: true, manual: true });
    return;
  }

  const d = decide(label, ctx);
  if (d.skip) return;
  if (d.agreement) {
    questions.push({ label, kind: f.kind, required: f.required, agreement: true });
    return;
  }
  let options = f.options;
  if (f.kind === "combobox" && d.value !== null) options = await openDropdown(page, f);
  if ((d.value === null || d.value === "") && !f.required && OPTIONAL_LINK.test(label)) return; // "Naukri URL", "Other website": fine left empty
  if (d.value === null || d.value === "") {
    if (f.kind === "combobox" && !options) options = await openDropdown(page, f);
    if (f.kind === "combobox") await page.keyboard.press("Escape");
    questions.push({ label, kind: f.kind, required: f.required, options: options?.length ? options : undefined });
    return;
  }

  try {
    const shown = await put(page, f, d.value, options ?? []);
    if (shown) filled.push({ label, value: short(shown) });
    else questions.push({ label, kind: f.kind, required: f.required, options: options?.length ? options : undefined });
  } catch (e) {
    notes.push(`Couldn't fill “${short(label)}” (${(e as Error).message.split("\n")[0]}).`);
    questions.push({ label, kind: f.kind, required: f.required, options: options?.length ? options : undefined });
  }
}

/** Put one answer in one field. Returns what it now shows, or null when the answer doesn't fit. */
async function put(page: Page, f: FormField, answer: string, options: string[]): Promise<string | null> {
  const el = at(page, f);
  switch (f.kind) {
    case "text":
    case "textarea":
      await el.fill(answer);
      return answer;
    case "date": {
      const iso = toIsoDate(answer);
      if (!iso) return null;
      const [y, m, d] = iso.split("-");
      if (f.dateParts?.length) {
        // Workday: type into each box (Month, Day, Year) in turn.
        const digits: Record<string, string> = { m, d, y };
        for (const p of f.dateParts) {
          const box = page.locator(`[data-jh="${f.id}"] [data-jh-part="${p}"]`).first();
          await box.click({ timeout: 4000 });
          await box.pressSequentially(digits[p], { delay: 40 });
        }
        await page.keyboard.press("Tab").catch(() => {});
      } else {
        const format = f.dateFormat || "YYYY-MM-DD";
        await el.fill(format.replace("YYYY", y).replace("MM", m).replace("DD", d));
      }
      return `${d}/${m}/${y}`;
    }
    case "number": {
      const n = answer.match(/\d+(\.\d+)?/)?.[0];
      if (!n) return null;
      await el.fill(n);
      return n;
    }
    case "select": {
      const choice = pickOption(answer, options);
      if (!choice) return null;
      await el.selectOption({ label: choice });
      return choice;
    }
    case "radio": {
      const choice = pickOption(answer, options);
      if (!choice) return null;
      await clickChoice(page, f, options.indexOf(choice));
      return choice;
    }
    case "checkbox": {
      if (!f.options) {
        // A single box: tick it for "yes", leave it for "no".
        if (YES.test(answer.trim())) {
          await clickChoice(page, f, 0);
          return "Ticked";
        }
        return NO.test(answer.trim()) ? "Left unticked" : null;
      }
      const wanted = answer
        .split(/[,;\n]/)
        .map((a) => pickOption(a.trim(), options))
        .filter((c): c is string => !!c);
      if (!wanted.length) return null;
      for (const c of new Set(wanted)) await clickChoice(page, f, options.indexOf(c));
      return [...new Set(wanted)].join(", ");
    }
    case "combobox":
      return pickInDropdown(page, f, answer, options);
    default:
      return null;
  }
}

/** Click a radio button, checkbox or Yes/No button by its place in the group. */
async function clickChoice(page: Page, f: FormField, i: number) {
  const sel = f.buttons ? `[data-jh="${f.id}"] [data-jh-opt="${i}"]` : `[data-jh-group="${f.id}"][data-jh-opt="${i}"]`;
  const target = page.locator(sel).first();
  if (f.buttons) return target.click();
  // Styled forms often hide the real input under its label: click the label when the input can't be.
  try {
    await target.check({ timeout: 3000 });
  } catch {
    const id = await target.getAttribute("id");
    const label = id ? page.locator(`label[for="${id}"]`).first() : target.locator("xpath=ancestor::label[1]");
    await label.click({ timeout: 3000 });
  }
}

/** Open a custom dropdown and read its choices (empty for ones that search as you type). */
async function openDropdown(page: Page, f: FormField): Promise<string[]> {
  await at(page, f).click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  return (await page.evaluate(`${OPTIONS_JS}(${JSON.stringify(f.id)})`)) as string[];
}

/**
 * Choose in a custom dropdown. Fixed lists (Yes/No, countries) are matched as they are; search
 * boxes (location) get the answer typed in, then the suggestion that starts with it is taken.
 */
async function pickInDropdown(page: Page, f: FormField, answer: string, options: string[]): Promise<string | null> {
  const input = at(page, f);
  let opts = options;
  let choice = opts.length ? pickOption(answer, opts) : null;
  // A list behind a button (Workday) can't be typed into: no match means asking you.
  const typable = await input.evaluate((e) => e.tagName === "INPUT" || e.tagName === "TEXTAREA");
  if (!choice && typable) {
    await input.click({ timeout: 4000 }).catch(() => {});
    await input.fill("");
    await input.pressSequentially(answer.slice(0, 40), { delay: 35 });
    await page.waitForTimeout(1200);
    opts = (await page.evaluate(`${OPTIONS_JS}(${JSON.stringify(f.id)})`)) as string[];
    if (!opts.length) {
      // Workday's search boxes search when you press Enter.
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
      opts = (await page.evaluate(`${OPTIONS_JS}(${JSON.stringify(f.id)})`)) as string[];
    }
    const first = answer.toLowerCase().split(/[,\s]+/)[0];
    choice = pickOption(answer, opts) ?? opts.find((o) => o.toLowerCase().startsWith(first)) ?? null;
  }
  if (!choice) {
    await input.fill("").catch(() => {});
    await page.keyboard.press("Escape");
    return null;
  }
  await page.locator(`[data-jh-pick="${opts.indexOf(choice)}"]`).first().click({ timeout: 4000 });
  await page.waitForTimeout(700);
  // Some lists have a second level (Workday: "Website" → "Barclays Careers Website"): pick there too.
  const sub = (await page.evaluate(`${OPTIONS_JS}(${JSON.stringify(f.id)})`)) as string[];
  if (sub.length && !sub.includes(choice)) {
    const second = pickOption(answer, sub) ?? sub.find((o) => !/^other\b/i.test(o)) ?? null;
    if (second) {
      await page.locator(`[data-jh-pick="${sub.indexOf(second)}"]`).first().click({ timeout: 4000 });
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape").catch(() => {});
      return `${choice} › ${second}`;
    }
    await page.keyboard.press("Escape").catch(() => {});
  }
  return choice;
}

/** "1999-08-15", "15 Aug 1999", "Immediately" (today) → "1999-08-15"; null when it isn't a date. */
function toIsoDate(answer: string): string | null {
  const a = answer.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a;
  const at = /immediate|asap|right away|now/i.test(a) ? Date.now() : Date.parse(a);
  if (Number.isNaN(at)) return null;
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
