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
