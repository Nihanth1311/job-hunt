// Automatic fetches run at fixed clock times in India, not "N hours after your last one":
// every 3 hours means 12, 3, 6 and 9 o'clock (am and pm). Everyone on the same period is fetched
// in the same pass, so the database wakes a few times a day instead of whenever anyone happens to
// be due, and you know when to expect your notification.
//
// Every allowed period (1, 2, 3, 4, 6, 12, 24 hours) divides 24, so the times line up with
// midnight India time every day.

const HOUR = 3_600_000;
/** India is UTC+5:30, all year. */
const IST_OFFSET = 5.5 * HOUR;

/** Start of the current slot: the latest clock time (India) that's a multiple of `hours`. */
export function slotStart(hours: number, now = Date.now()): number {
  const size = hours * HOUR;
  return Math.floor((now + IST_OFFSET) / size) * size - IST_OFFSET;
}

/** The next fixed time a `hours` period fetches. */
export const nextSlot = (hours: number, now = Date.now()) => slotStart(hours, now) + hours * HOUR;

/** Due if your last automatic fetch was before the current slot began (or you never had one). */
export function isDue(lastAutoFetchAt: string | null | undefined, hours: number, now = Date.now()): boolean {
  return !lastAutoFetchAt || new Date(lastAutoFetchAt).getTime() < slotStart(hours, now);
}

/**
 * Someone's schedule changed (a new person, a new "Check for new jobs every"): the scheduler's
 * next check reads the database again instead of trusting the quiet time it remembered.
 */
export function scheduleChanged() {
  (globalThis as { __jobHuntQuietUntil?: number }).__jobHuntQuietUntil = 0;
}

/** "12, 3, 6 and 9 o'clock (am and pm)": when a `hours` period fetches, in words. */
export function slotTimesLabel(hours: number): string {
  if (hours === 1) return "every hour, on the hour";
  if (hours === 24) return "once a day, at midnight";
  if (hours === 12) return "at 12 midnight and 12 noon";
  const times = Array.from({ length: 12 / hours }, (_, i) => String(i * hours || 12));
  return `at ${times.slice(0, -1).join(", ")} and ${times.at(-1)} o'clock (am and pm)`;
}
