// Next.js calls register() once, when the server process starts (never in the browser). It is the
// one place that can start something long-lived: here, the timer that checks whether anyone's
// automatic fetch is due (src/server/fetching/scheduler.ts).
export async function register() {
  // Next.js also loads this file for its small "edge" runtime, which has no timers or database.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // SCHEDULER=off: this server never fetches on its own (see startScheduler for when to use it).
  if (process.env.SCHEDULER === "off") return;
  // Imported here, not at the top, so the edge runtime never loads server-only code.
  const { startScheduler } = await import("./server/fetching/scheduler");
  startScheduler();
}
