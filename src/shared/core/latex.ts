import type { Profile } from "../types";

// The LaTeX resume Claude fills in. Fixed here (not left to Claude) so every tailored resume
// compiles the same way: one column, real text (pdfgentounicode) so ATS parsers can read it.

/** Escape text for LaTeX body text. */
export function texEscape(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

export interface ProfileLinks {
  linkedin: string | null;
  github: string | null;
  other: string[];
}

const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/(?!features|about|pricing)[A-Za-z0-9-]+/i;

const https = (u: string) => (/^https?:\/\//i.test(u) ? u.replace(/^http:/i, "https:") : `https://${u}`).replace(/\/$/, "");

/** LinkedIn / GitHub URLs from the Profile links, falling back to ones written in the resume. */
export function profileLinks(p: Profile): ProfileLinks {
  const lines = p.links.split(/\s+/).map((l) => l.trim()).filter(Boolean);
  const find = (re: RegExp) => {
    const hit = lines.map((l) => l.match(re)?.[0]).find(Boolean) ?? p.masterResume.match(re)?.[0];
    return hit ? https(hit) : null;
  };
  const linkedin = find(LINKEDIN);
  const github = find(GITHUB);
  const other = lines.filter((l) => !LINKEDIN.test(l) && !GITHUB.test(l)).map(https);
  return { linkedin, github, other };
}

const display = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "");

/** The finished header block, so names, links and phone are always exactly right. */
export function latexHeader(p: Profile): string {
  const { linkedin, github, other } = profileLinks(p);
  const parts = [
    p.phone.trim() && texEscape(p.phone.trim()),
    p.email.trim() && `\\href{mailto:${p.email.trim()}}{${texEscape(p.email.trim())}}`,
    linkedin && `\\href{${linkedin}}{${texEscape(display(linkedin))}}`,
    github && `\\href{${github}}{${texEscape(display(github))}}`,
    ...other.map((u) => `\\href{${u}}{${texEscape(display(u))}}`),
    p.location.trim() && texEscape(p.location.trim()),
  ].filter(Boolean);
  return `\\begin{center}
  {\\Huge \\scshape ${texEscape(p.name.trim() || "Your Name")}} \\\\ \\vspace{2pt}
  \\small ${parts.join(" $|$ ")}
\\end{center}`;
}

export const LATEX_PREAMBLE = String.raw`\documentclass[letterpaper,10.5pt]{article}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{tabularx}
\input{glyphtounicode}
\pdfgentounicode=1

\addtolength{\oddsidemargin}{-0.55in}
\addtolength{\evensidemargin}{-0.55in}
\addtolength{\textwidth}{1.1in}
\addtolength{\topmargin}{-0.6in}
\addtolength{\textheight}{1.2in}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{\vspace{-6pt}\scshape\raggedright\large\bfseries}{}{0em}{}[\titlerule\vspace{-4pt}]

\newcommand{\resumeItem}[1]{\item\small{#1\vspace{-2pt}}}
\newcommand{\resumeSubheading}[4]{\vspace{-2pt}\item
  \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
    \textbf{#1} & #2 \\
    \textit{\small #3} & \textit{\small #4} \\
  \end{tabular*}\vspace{-6pt}}
\newcommand{\resumeProjectHeading}[2]{\item
  \begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}
    \small #1 & \small #2 \\
  \end{tabular*}\vspace{-6pt}}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.15in, itemsep=1pt]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-4pt}}`;

/** Does this saved resume hold LaTeX (rather than Markdown)? */
export function isLatex(content: string): boolean {
  return /\\documentclass|\\begin\{document\}/.test(content);
}

/** Pull the LaTeX out of a pasted Claude reply (```latex fences, chat text around it). */
export function extractLatex(text: string): string {
  // The reply may contain other text or code blocks before the resume (the recruiter screen);
  // take the fenced block that is the actual document.
  const blocks = [...text.matchAll(/```(?:latex|tex)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  const fenced = blocks.find((b) => /\\documentclass/.test(b)) ?? blocks.at(-1);
  let body = fenced ?? text;
  // Without a fence (copied as plain text), start at \documentclass, keeping the "%" report lines just above it.
  if (!fenced) {
    const doc = body.search(/^\\documentclass/m);
    if (doc >= 0) {
      const lines = body.slice(0, doc).split("\n");
      let keep = lines.length - 1;
      while (keep > 0 && /^\s*(%.*)?$/.test(lines[keep - 1])) keep--;
      body = lines.slice(keep).join("\n") + body.slice(doc);
    }
  }
  const end = body.lastIndexOf("\\end{document}");
  if (end >= 0) body = body.slice(0, end + "\\end{document}".length);
  return body.trim();
}

// ---------- Text (Markdown) resume → LaTeX, so it can be a PDF too ----------

/** Characters plain LaTeX fonts lack, as close ASCII; anything else outside Latin-1 is dropped. */
function plainChars(s: string): string {
  return s
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/–/g, "-")
    .replace(/—/g, " - ")
    .replace(/[•▪●◦]/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[^\x00-\xff]/g, "");
}

/** **bold**, *italic*, `code` and [links](https://…) → LaTeX; everything else escaped. */
function inlineTex(s: string): string {
  const held: string[] = [];
  const hold = (tex: string) => `\u0000${held.push(tex) - 1}\u0000`;
  let t = plainChars(s);
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_, text: string, url: string) => hold(`\\href{${url.replace(/([%#])/g, "\\$1")}}{${texEscape(text)}}`));
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, x: string) => hold(`\\textbf{${texEscape(x)}}`));
  t = t.replace(/`([^`]+)`/g, (_, x: string) => hold(`\\texttt{${texEscape(x)}}`));
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, (_, pre: string, x: string) => pre + hold(`\\textit{${texEscape(x)}}`));
  return texEscape(t).replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
}

/**
 * A resume written in Markdown (as Claude writes it) as a LaTeX document in the same style as
 * the LaTeX resumes: "# Name" and the lines under it become the header, "## Experience" a section,
 * "- point" a bullet. Used to make a PDF of a text resume for application forms.
 */
export function markdownToLatex(md: string): string {
  const lines = md.replace(/\r/g, "").replace(/^```[a-z]*\n|\n```\s*$/gi, "").split("\n");
  const body: string[] = [];
  let inList = false;
  let header: string[] | null = null;
  const closeList = () => {
    if (inList) body.push("\\end{itemize}");
    inList = false;
  };
  const flushHeader = () => {
    if (!header) return;
    const [name, ...rest] = header;
    body.push(`\\begin{center}\n  {\\Huge \\scshape ${inlineTex(name)}} \\\\ \\vspace{2pt}\n  \\small ${rest.map(inlineTex).join(" \\\\ ")}\n\\end{center}`);
    header = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^#{3,6}\s+(.*)/);
    const bullet = line.match(/^\s*(?:[-*+•]|\d+[.)])\s+(.*)/);
    if (h1 && !body.length && !header) {
      header = [h1[1]];
      continue;
    }
    if (header && !h2 && !h3 && !bullet) {
      if (line.trim()) header.push(line.trim().replace(/^\*\*|\*\*$/g, ""));
      continue;
    }
    flushHeader();
    if (h2 || (h1 && body.length)) {
      closeList();
      body.push(`\\section{${inlineTex((h2 ?? h1)![1])}}`);
    } else if (h3) {
      closeList();
      body.push(`\\vspace{2pt}\\noindent\\textbf{${inlineTex(h3[1])}}\\par`);
    } else if (bullet) {
      if (!inList) body.push("\\begin{itemize}[leftmargin=0.15in, itemsep=1pt, topsep=2pt]");
      inList = true;
      body.push(`  \\item \\small ${inlineTex(bullet[1])}`);
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeList();
    } else if (line.trim()) {
      closeList();
      body.push(`\\noindent ${inlineTex(line.trim())}\\par`);
    } else {
      closeList();
    }
  }
  flushHeader();
  closeList();
  return `${LATEX_PREAMBLE}\n\n\\begin{document}\n${body.join("\n")}\n\\end{document}\n`;
}
