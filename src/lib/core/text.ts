const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: "-",
  mdash: "-",
  hellip: "...",
  bull: "•",
  rupee: "₹",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** HTML (possibly entity-escaped, as Greenhouse sends it) -> readable plain text. */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return tidy(decodeEntities(s));
}

/**
 * Fix characters that show up as boxes or oddities: Word/Wingdings bullets (private-use
 * code points like U+F0B7), assorted bullet glyphs, zero-width and narrow spaces.
 */
export function normalizeChars(s: string): string {
  return s
    .replace(/[-]/g, "•")
    .replace(/[●▪◾◼■◆♦➢➤►▶✓✔☑❖⦁⁃∙]/g, "•")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[‐‑]/g, "-");
}

/** Job titles without posters' tags, e.g. "[DT] : Full Stack Engineer" -> "Full Stack Engineer". */
export function cleanTitle(s: string): string {
  return normalizeChars(s)
    .replace(/^\s*\[[^\]]{1,12}\]\s*[:\-–|]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tidy(s: string): string {
  return normalizeChars(s)
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lowercase, strip punctuation and noise words: used to spot duplicates across sources. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(pvt|private|ltd|limited|inc|llp|technologies|technology|india)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
