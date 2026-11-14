// The autofill helper: runs on your laptop, fills application forms in Chrome for the jobs you
// press "Autofill" on in Job Hunt, and never presses Submit.
//
//   npm run helper -- connect <site address> <token>   once, with the command from Settings → Laptop helper
//   npm run helper                                      whenever you want to apply to jobs
//
// It asks the site for work every few seconds, and stops by itself after a while with nothing to
// do (so it never keeps your free database awake for nothing).

import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { MULTI_PAGE, type HelperTask, type RunStatus } from "../src/shared/autofill";
import { LinkError, Site } from "./api";
import { CHROME_DIR, FILES_DIR, readConfig, writeConfig } from "./config";
import { fillForm, waitForForm } from "./fill";
import { advance, look, type Flow } from "./multipage";
import { SUBMITTED_TEXT, SUBMITTED_URL } from "./scan";

/** Ask often while a form is open or something just happened; less when idle. */
const BUSY_POLL_MS = 3000;
const IDLE_POLL_MS = 8000;
const BUSY_FOR_MS = 2 * 60_000;
const STOP_AFTER_MS = Number(process.env.HELPER_IDLE_MINUTES || 30) * 60_000;

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), "·", ...a);

/** A form open in Chrome, waiting for you to finish and submit it. */
interface Open {
  page: Page;
  task: HelperTask;
  resumePath: string | null;
  /** The page said "thank you for applying" before you submitted (part of the job text): don't trust that phrase here. */
  thanksBefore: boolean;
  url: string;
  /** Everything filled so far, across passes (the first fill, then your answers). */
  filled: { label: string; value: string }[];
  /** The resume file attached on the first pass, if it was. */
  resume?: string;
  /** Workday and guided company sites: where it is in a form of several pages. */
  flow?: Flow;
}

class Helper {
  private ctx: BrowserContext | null = null;
  private open = new Map<string, Open>();
  private lastBusy = Date.now();

  constructor(private readonly site: Site) {}

  async run(first: { task: HelperTask | null; cancel: string[] }) {
    if (first.task) await this.handle(first.task);
    for (;;) {
      await this.watch();
      const busy = this.open.size > 0 || Date.now() - this.lastBusy < BUSY_FOR_MS;
      if (!busy && Date.now() - this.lastBusy > STOP_AFTER_MS) {
        log(`Nothing to do for ${STOP_AFTER_MS / 60_000} minutes, so I've stopped. Run "npm run helper" again when you need me.`);
        await this.close();
        return;
      }
      await sleep(busy ? BUSY_POLL_MS : IDLE_POLL_MS);
      try {
        const { task, cancel } = await this.site.next();
        for (const id of cancel) await this.forget(id, "Cancelled on the site: closed its tab.");
        if (task) await this.handle(task);
      } catch (e) {
        if (e instanceof LinkError) throw e;
        log("Couldn't reach the site, trying again:", (e as Error).message);
      }
    }
  }

  private async browser(): Promise<BrowserContext> {
    if (this.ctx) return this.ctx;
    fs.mkdirSync(CHROME_DIR, { recursive: true });
    const ctx = await chromium.launchPersistentContext(CHROME_DIR, {
      channel: "chrome", // your installed Google Chrome: nothing extra to download
      headless: Boolean(process.env.HELPER_HEADLESS), // for testing only: normally you watch it fill
      viewport: null,
      args: ["--start-maximized"],
    });
    ctx.on("close", () => {
      this.ctx = null;
    });
    this.ctx = ctx;
    return ctx;
  }

  /** One form to fill: a new one, or the one you just answered questions for. */
  private async handle(task: HelperTask) {
    this.lastBusy = Date.now();
    const label = `${task.job.title} at ${task.job.company}`;
    try {
      let open = this.open.get(task.runId);
      if (!open || open.page.isClosed()) {
        log(`Opening ${label}`);
        const resumePath = task.resume ? await this.download(task) : null;
        const ctx = await this.browser();
        const blank = ctx.pages().find((p) => p.url() === "about:blank" && ![...this.open.values()].some((o) => o.page === p));
        const page = blank ?? (await ctx.newPage());
        await page.goto(task.applyUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        const multi = !!task.platform && MULTI_PAGE.includes(task.platform);
        if (!multi && !(await waitForForm(page))) {
          await this.site.report(task.runId, "error", "The application form didn't appear. The job may be closed; check the tab in Chrome.");
          return;
        }
        const thanksBefore = SUBMITTED_TEXT.test(await bodyText(page));
        open = { page, task, resumePath, thanksBefore, url: page.url(), filled: [] };
        if (multi) {
          open.flow = { page, task, resumePath, autoNext: task.platform === "workday", starts: 0, resumeDone: false, pages: [], filled: [], sig: "", index: -1, status: null, busy: false };
        }
        this.open.set(task.runId, open);
      } else {
        log(task.status === "answered" ? `Filling your answers into ${label}` : `Carrying on with ${label}`);
        open.task = task;
        if (open.flow) open.flow.task = task;
      }
      await open.page.bringToFront();
      if (open.flow) return await this.step(task.runId, open.flow, label);
      const { report, blocking } = await fillForm(open.page, task, open.resumePath);
      const fresh = new Set((report.filled ?? []).map((x) => x.label));
      open.filled = [...open.filled.filter((x) => !fresh.has(x.label)), ...(report.filled ?? [])];
      report.filled = open.filled;
      open.resume ??= report.resume;
      report.resume ??= open.resume;
      const asks = report.questions?.length ?? 0;
      const status = blocking > 0 ? "needs_you" : "review";
      const message =
        blocking > 0
          ? `Filled ${report.filled?.length ?? 0} fields. ${blocking} required question${blocking === 1 ? "" : "s"} need${blocking === 1 ? "s" : ""} you.`
          : `Filled ${report.filled?.length ?? 0} fields. Check the form in Chrome and press Submit yourself.`;
      const now = await this.site.report(task.runId, status, message, report);
      log(`${label}: filled ${report.filled?.length ?? 0}, ${asks} question${asks === 1 ? "" : "s"} for you${now === "cancelled" ? " (cancelled)" : ""}`);
      if (now === "cancelled") await this.forget(task.runId, "");
    } catch (e) {
      if (e instanceof LinkError) throw e;
      const msg = (e as Error).message.split("\n")[0];
      log(`${label}: stopped (${msg})`);
      await this.site.report(task.runId, "error", `The helper stopped on this form: ${msg}`).catch(() => {});
    }
  }

  /** Move a multi-page form on and tell the site where it stands. */
  private async step(runId: string, flow: Flow, label: string) {
    flow.busy = true;
    try {
      const { status, message, report } = await advance(flow);
      const now = await this.site.report(runId, status, message, report);
      log(`${label}: ${message}`);
      if (now === "cancelled") await this.forget(runId, "");
    } finally {
      flow.busy = false;
    }
  }

  /**
   * A multi-page form you're working on in Chrome: when you sign in, or move to a new page, the
   * helper carries on. Going back to look at an earlier Workday page doesn't push you forward again.
   */
  private async follow(runId: string, o: Open) {
    const flow = o.flow!;
    if (flow.busy || !flow.status || !(["waiting", "needs_you", "review"] as RunStatus[]).includes(flow.status)) return;
    const now = await look(o.page).catch(() => null);
    if (!now || now.sig === flow.sig) return;
    const forward = now.index < 0 || flow.index < 0 || now.index > flow.index;
    const go = !now.gate && (!flow.autoNext || flow.status === "waiting" || (flow.status === "needs_you" && forward));
    if (!go) {
      flow.sig = now.sig;
      flow.index = now.index;
      return;
    }
    this.lastBusy = Date.now();
    try {
      await this.step(runId, flow, `${o.task.job.title} at ${o.task.job.company}`);
    } catch (e) {
      log(`${o.task.job.company}: couldn't carry on (${(e as Error).message.split("\n")[0]})`);
    }
  }

  /** Look at the open forms: submitted? closed? moved on? */
  private async watch() {
    for (const [runId, o] of this.open) {
      if (o.page.isClosed()) {
        this.open.delete(runId);
        log(`${o.task.job.company}: you closed the form.`);
        await this.site.report(runId, "error", "The form's tab was closed before it was submitted. Press Autofill to open it again.").catch(() => {});
        continue;
      }
      const url = o.page.url();
      const text = url !== o.url || !o.thanksBefore ? await bodyText(o.page) : "";
      if (SUBMITTED_URL.test(url) || (!o.thanksBefore && SUBMITTED_TEXT.test(text))) {
        this.open.delete(runId);
        this.lastBusy = Date.now();
        log(`${o.task.job.company}: submitted. Marked as Applied in your tracker.`);
        await this.site.report(runId, "submitted", "Submitted.").catch(() => {});
        continue;
      }
      if (o.flow) await this.follow(runId, o);
    }
  }

  private async forget(runId: string, why: string) {
    const o = this.open.get(runId);
    if (!o) return;
    this.open.delete(runId);
    if (why) log(`${o.task.job.company}: ${why}`);
    await o.page.close().catch(() => {});
  }

  private async download(task: HelperTask): Promise<string> {
    const dir = path.join(FILES_DIR, task.runId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(task.resume!.fileName).replace(/[^\w.\- ]+/g, "_") || "Resume.pdf");
    fs.writeFileSync(file, await this.site.resume(task.runId));
    return file;
  }

  async close() {
    await this.ctx?.close().catch(() => {});
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bodyText = (page: Page) => page.evaluate("document.body ? document.body.innerText.slice(0, 6000) : ''").catch(() => "") as Promise<string>;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "connect") {
    const [site, token] = args;
    if (!site || !/^https?:\/\//.test(site) || !token?.startsWith("jhh_")) {
      console.log("Use the command from Settings → Laptop helper: npm run helper -- connect <site address> <token>");
      process.exit(1);
    }
    const config = { site: site.replace(/\/+$/, ""), token };
    const hello = await new Site(config).hello();
    writeConfig(config);
    console.log(`Linked to ${hello.account} on ${config.site}. Start the helper any time with: npm run helper`);
    return;
  }

  const config = readConfig();
  if (!config) {
    console.log("This laptop isn't linked yet. In Job Hunt, open Settings → Laptop helper, press “Link a laptop” and run the command it shows.");
    process.exit(1);
  }
  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  const site = new Site(config);
  log(`Connecting to ${config.site}…`);
  const first = await site.hello();
  log(`Ready for ${first.account}. Press Autofill on a job in Job Hunt. (Ctrl+C to stop.)`);
  const helper = new Helper(site);
  const stop = async () => {
    log("Stopping. Forms still open in Chrome are closed with it.");
    await helper.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await helper.run(first);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
