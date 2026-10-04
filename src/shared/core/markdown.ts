// Tiny, safe Markdown -> HTML for resumes. Everything is escaped first, so pasted
// content can never inject HTML or scripts.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Remove a ```markdown ... ``` wrapper if the text was copied straight from a chat. */
export function stripFences(md: string): string {
  const m = md.trim().match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  return m ? m[1] : md.trim();
}

export function markdownToHtml(md: string): string {
  const lines = stripFences(md).replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let listDepth = 0;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeLists = (to = 0) => {
    while (listDepth > to) {
      out.push("</ul>");
      listDepth--;
    }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);

    if (!line.trim()) {
      flushPara();
      closeLists();
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara();
      closeLists();
      out.push("<hr>");
    } else if (heading) {
      flushPara();
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet) {
      flushPara();
      const depth = bullet[1].replace(/\t/g, "  ").length >= 2 ? 2 : 1;
      while (listDepth < depth) {
        out.push("<ul>");
        listDepth++;
      }
      closeLists(depth);
      out.push(`<li>${inline(bullet[2])}</li>`);
    } else {
      closeLists();
      para.push(line.trim());
    }
  }
  flushPara();
  closeLists();
  return out.join("\n");
}
