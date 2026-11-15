// Dates and times as the screens show them. Always India time, whatever time zone the server or the browser is in.
const IST = "Asia/Kolkata";

/** "just now", "12m ago", "5h ago", "3d ago"; a plain date once it's 30 days or more. */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(date);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: IST }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
  }).format(new Date(date));
}

/** yyyy-mm-dd in India time, for <input type="date">. */
export function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(date));
}

/** Is this date now or in the past? (Used for follow-ups that are due.) */
export function isOverdue(date: Date | string | null | undefined): boolean {
  return Boolean(date) && new Date(date!).getTime() <= Date.now();
}
