import { normalizeChars } from "@/lib/core/text";
import { cx } from "./ui";

type Block = { kind: "heading"; text: string } | { kind: "list"; items: string[] } | { kind: "para"; text: string };

const BULLET = /^\s*(?:[•·▪◦●*-]|\d{1,2}[.)])\s+/;

function isHeading(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (!t || t.length > 80 || BULLET.test(t)) return false;
  if (/:$/.test(t)) return true;
  // Short title-like line ("Responsibilities", "WHAT YOU'LL DO") followed by more text.
  const words = t.split(/\s+/).length;
  return Boolean(next?.trim()) && words <= 6 && !/[.!?,;]$/.test(t) && (t === t.toUpperCase() || /^[A-Z][\w'’&/()-]*(\s+[A-Za-z][\w'’&/()-]*)*$/.test(t));
}

function parse(text: string): Block[] {
  // Some sources run bullets together on one line ("Duties: • Build X • Ship Y"): give each its own line.
  const lines = normalizeChars(text)
    .replace(/\r/g, "")
    .split("\n")
    .flatMap((line) => {
      const [head, ...items] = line.split(/\s*•\s+/);
      return items.length ? [head, ...items.map((i) => `• ${i}`)].filter((l) => l.trim()) : [line];
    });
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join(" ") });
    if (list.length) blocks.push({ kind: "list", items: list });
    para = [];
    list = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush();
    if (BULLET.test(line)) {
      if (para.length) {
        blocks.push({ kind: "para", text: para.join(" ") });
        para = [];
      }
      list.push(line.replace(BULLET, ""));
    } else if (isHeading(line, lines[i + 1])) {
      flush();
      blocks.push({ kind: "heading", text: line.replace(/:$/, "") });
    } else {
      if (list.length) {
        blocks.push({ kind: "list", items: list });
        list = [];
      }
      para.push(line);
    }
  });
  flush();
  return blocks;
}

/** A job description, readable: headings, paragraphs and bullet lists, in full. */
export function JobDescription({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);
  if (!blocks.length) return <p className="text-sm text-muted">No description was provided.</p>;
  return (
    <div className={cx("space-y-3 text-sm leading-7 text-ink/90", className)}>
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h3 key={i} className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-ink first:pt-0">
            {b.text}
          </h3>
        ) : b.kind === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}
