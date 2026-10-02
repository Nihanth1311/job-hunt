import { SKILL_GROUPS, TRACK_LABEL, TRACK_TITLE, type Profile, type Track } from "../types";
import type { Analysis } from "./analyze";
import { experienceLabel, salaryLabel } from "./classify";
import { LATEX_PREAMBLE, latexHeader, profileLinks } from "./latex";
import { canonicalize, extractSkills } from "./skills";

export const PROMPT_MODES = ["tailor", "fit", "interview", "message"] as const;
export type PromptMode = (typeof PROMPT_MODES)[number];

export const PROMPT_MODE_LABEL: Record<PromptMode, string> = {
  tailor: "Tailor my resume",
  fit: "Check my fit",
  interview: "Interview prep",
  message: "Cover letter & recruiter message",
};

export interface JobInput {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  /** The source only gave the start of the description (e.g. Adzuna). */
  descriptionIsPreview?: boolean;
}

/** Only send a description Claude can rely on. A cut-off preview would make it tailor to half a job. */
export function hasFullDescription(job: JobInput): boolean {
  return !job.descriptionIsPreview && job.description.trim().length > 40;
}

// ---------- Shared instructions ----------

function jobBlock(job: JobInput, a: Analysis): string {
  const full = hasFullDescription(job);
  const facts = [
    job.title && `Title: ${job.title}`,
    job.company && `Company: ${job.company}`,
    job.location && `Location: ${job.location}`,
    job.url && `Link: ${job.url}`,
    full && experienceLabel(a.experience) && `Experience asked: ${experienceLabel(a.experience)}`,
    a.salary && `Salary mentioned: ${salaryLabel(a.salary.min, a.salary.max)}`,
  ].filter(Boolean);
  const description = full
    ? job.description.trim()
    : "(Not included. Ask me to paste the full job description before you start.)";
  return `=== THE JOB ===\n${facts.join("\n")}\n\n${description}`;
}

/** First instruction when we don't have the full description: ask for it, then wait. */
function askForDescription(job: JobInput): string {
  if (hasFullDescription(job)) return "";
  const where = job.url ? ` from the posting (${job.url})` : "";
  return `FIRST: ask me to paste the full job description. I'll copy it${where}. Wait until I've pasted it before doing anything else.\n\n`;
}

function skillsBlock(job: JobInput, a: Analysis): string {
  if (!hasFullDescription(job)) return "";
  const have = a.matchedSkills.length ? a.matchedSkills.join(", ") : "none detected";
  const gaps = a.missingSkills.length ? a.missingSkills.join(", ") : "none detected";
  return `Skills from the job that are already on my profile: ${have}\nSkills from the job that are NOT on my profile: ${gaps}\n\n`;
}

/** The master resume is the up-to-date source of truth; a base resume is only a fallback (it can be older). */
function resumeBlock(track: Track, baseResume: string, masterResume: string): string {
  if (masterResume.trim()) return `=== MY RESUME (complete and up to date) ===\n${masterResume.trim()}`;
  if (baseResume.trim()) return `=== MY ${TRACK_LABEL[track].toUpperCase()} RESUME ===\n${baseResume.trim()}`;
  return "=== MY RESUME ===\n(I haven't added it yet. Ask me to paste it.)";
}

/** Everything the app knows about me, so Claude never has to ask. */
function aboutMeBlock(p: Profile): string {
  const { linkedin, github, other } = profileLinks(p);
  const skills = SKILL_GROUPS
    .filter((g) => p.skills[g]?.length)
    .map((g) => `  ${g}: ${p.skills[g].join(", ")}`);
  return [
    "=== ABOUT ME ===",
    p.name && `Name: ${p.name}`,
    p.email && `Email: ${p.email}`,
    p.phone && `Phone: ${p.phone}`,
    p.location && `City: ${p.location}`,
    linkedin && `LinkedIn: ${linkedin}`,
    github && `GitHub: ${github}`,
    ...other.map((u) => `Link: ${u}`),
    `Total experience: ${p.yearsExperience} year(s)`,
    skills.length > 0 && `Skills I have (besides those on my resume):\n${skills.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Which of the job's skills I can honestly claim (on my resume, in my skills list or private notes). */
function skillCoverage(p: Profile, a: Analysis) {
  const mine = new Set(
    [...canonicalize(Object.values(p.skills).flat()), ...extractSkills(`${p.masterResume}\n${p.claudeNotes}`)].map((s) => s.toLowerCase()),
  );
  return {
    have: a.skills.filter((s) => mine.has(s.toLowerCase())),
    missing: a.skills.filter((s) => !mine.has(s.toLowerCase())),
  };
}

function notesBlock(p: Profile): string {
  return p.claudeNotes.trim()
    ? `\n\n=== PRIVATE CONTEXT ABOUT ME (for you only, never put this on the resume) ===\n${p.claudeNotes.trim()}`
    : "";
}

// ---------- Prompts ----------

export function buildJobPrompt(
  mode: PromptMode,
  args: { job: JobInput; analysis: Analysis; track: Track; baseResume: string; profile: Profile },
): string {
  const { job, analysis: a, track, baseResume, profile } = args;
  const role = TRACK_TITLE[track];
  const first = askForDescription(job);
  const context = `${jobBlock(job, a)}\n\n${resumeBlock(track, baseResume, profile.masterResume)}${notesBlock(profile)}`;

  switch (mode) {
    case "tailor":
      return tailorPrompt(job, a, track, baseResume, profile);

    case "fit":
      return `Act as a senior technical recruiter hiring for the job below. I'm considering applying as a ${role}.

${first}Be direct with me:
1. How strong is my fit (score out of 10), and why?
2. What red flags would make you reject my resume for this job?
3. Which of my experiences and projects should I highlight most?
4. What are the real gaps, and can any be covered honestly by things I've done (I'll tell you)?
5. Is this worth applying to with ~${profile.yearsExperience} year(s) of experience?

${skillsBlock(job, a)}${context}`;

    case "interview":
      return `Act as the hiring manager for the job below and help me prepare for the interview (${role} track).

${first}1. List the 10 most likely technical questions for this role and level, with what a strong answer should cover.
2. List 5 behavioural questions mapped to leadership principles (ownership, bias for action, dive deep, deliver results, customer obsession) and suggest which of my real experiences to use for each, in STAR format.
3. Point out topics from the job description I should revise first.
Then quiz me one question at a time when I say "start", and give honest feedback on each answer.

${context}`;

    case "message":
      return `Using my resume and the job below (I'm applying as a ${role}), write:

${first}1. A short cover letter (under 200 words, specific to this company, no clichés).
2. A LinkedIn message to a recruiter or engineer there asking for a referral (under 80 words).
Only mention experience that's actually in my resume.

${context}`;
  }
}

/** A general resume for one role type (no specific job), same one-shot LaTeX rules as tailoring. */
export function buildBaseResumePrompt(track: Track, profile: Profile): string {
  const role = TRACK_TITLE[track];
  const fence = "```";
  return `You are a senior technical recruiter and resume writer who hires ${role}s at product companies in India. Write my base resume for applying to ${role} roles, as a complete LaTeX document. I'll tailor it to each job later. Everything you need about me is in this message.

${NO_QUESTIONS}

=== WHAT TO DO (silently; don't show these steps) ===
1. Screen my resume the way you would when hiring a ${role} and find every red flag: missing or buried ${role} skills, vague bullets with no measurable result, weak verbs, irrelevant or outdated content, anything that wastes space, anything an ATS would misread.
2. Fix every red flag in the rewrite.
3. Target role: "${role}". Lead with the skills, experience and projects that matter most for ${role} roles and de-emphasise the rest.

=== CONTENT RULES ===
- Every experience and project bullet uses Google's XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]". Start with a strong action verb (past tense; present tense only for my current role). One to two lines each.
- [Y] must come from my resume (numbers, %, scale, time saved). Never invent a number. Where no number exists, state a concrete, verifiable outcome instead.
- Technical Skills: everything I have that ${role} job descriptions in India commonly ask for, using the standard spelling recruiters search for, most important first.
- Never invent employers, titles, dates or numbers.
- Summary: 2-3 lines for ${role} roles, with my strongest result.
- Show ownership, bias for action and delivering results through real examples, without buzzwords.
- ONE page. 3-6 bullets per role, 2-3 per project; drop school marks and coursework first if space is tight. Keep my degree and CGPA.
- Sections in this order: Summary, Technical Skills, Experience, Projects, Education, Achievements (only if space allows).
- Dates as "Mon YYYY -- Mon YYYY" or "Mon YYYY -- Present".

${LATEX_RULES}

=== OUTPUT FORMAT ===
Reply with ONE ${fence}latex code block and nothing else: no text before or after it. The code must start with these comment lines:
% Target: ${role} (base resume)
% ${role} keywords covered: <comma-separated>
% Red flags fixed: <one short line each, at most 5 lines>

=== PREAMBLE (copy exactly) ===
${LATEX_PREAMBLE}

=== HEADER (copy exactly, right after ${String.raw`\begin{document}`}) ===
${latexHeader(profile)}

${aboutMeBlock(profile)}

${resumeBlock(track, "", profile.masterResume)}${notesBlock(profile)}`;
}

const NO_QUESTIONS = `DO NOT ask me any questions and do not wait for input. Make every decision yourself and deliver the finished resume in this one reply. If something is unclear, missing or contradictory (a number, a title, a date, a city), use the information given here (my resume wins over anything else) and keep going.`;

// String.raw: LaTeX backslashes (\begin, \textbf) must reach Claude as written.
const LATEX_RULES = String.raw`=== LATEX RULES ===
- Copy the preamble below exactly, then \begin{document}, then the header below exactly (it has my real links), then the sections, then \end{document}.
- Use only the commands the preamble defines (\resumeSubheading, \resumeProjectHeading, \resumeItem and the list start/end commands). No extra packages, icons, images, columns or colours.
- Technical Skills: \begin{itemize}[leftmargin=0.15in, label={}] \small{\item{ \textbf{Frontend}{: React, ...} \\ \textbf{Backend}{: ...} }} \end{itemize}
- Escape special characters in text: \& \% \$ \# \_ (e.g. "62\%", "R\&D").
- It must compile with pdflatex on Overleaf without errors.`;

/**
 * The master tailoring prompt. One message in; Claude works through a recruiter's process in the
 * open (score, missing keywords, red flags), rewrites the experience for real, re-checks it the
 * way an ATS and a rushed hiring manager would, and ends with the finished LaTeX resume.
 * The app keeps only the LaTeX block when you paste the reply back.
 */
function tailorPrompt(job: JobInput, a: Analysis, track: Track, baseResume: string, p: Profile): string {
  const role = TRACK_TITLE[track];
  const company = job.company || "the company";
  const title = job.title || role;
  const { have, missing } = skillCoverage(p, a);
  const facts = [
    job.title && `Title: ${job.title}`,
    job.company && `Company: ${job.company}`,
    job.location && `Location: ${job.location}`,
    experienceLabel(a.experience) && `Experience asked: ${experienceLabel(a.experience)}`,
  ].filter(Boolean);
  const text = job.description.trim();
  const description = !text
    ? `(No description available. Tailor to the job title and what ${company} typically requires for this role.)`
    : hasFullDescription(job)
      ? text
      : `(Only the start of the description is available:)\n${text}\n\nTailor to this, the job title, and what ${company} typically requires for this role.`;
  const fence = "```";

  return `Act as a senior recruiter at ${company}, hiring for "${title}". You have read thousands of resumes for this exact role and you know what ${company}'s hiring managers and ATS screen for. Your goal: make me the strongest possible candidate for this job, with a final match score of 85/100 or higher. Take my resume (below) against the job description (below) through the four steps that follow, in order, and show the result of each step. Everything you need about me is in this message.

${a.category === "frontend" ? "My background is frontend, which this role centres on, and I'm actively learning the rest of the stack" : "My background is mostly frontend, and I'm actively learning the rest of this stack"}, so close the gap aggressively but truthfully: the skills section includes everything the job asks for, experience bullets only describe work I really did, and job skills I haven't used yet go into my personal projects as small additions I'll build before applying (see Step 2).

DO NOT ask me any questions and do not wait for input: deliver all four steps in this one reply. If something is unclear or missing, use what's given here (my resume wins over anything else) and keep going. Keep Steps 1 and 3 tight: bullets, no essays.

=== STEP 1 · RECRUITER SCREEN ===
Analyse my CURRENT resume against the job description, exactly as you would for this opening.
- Match score: X/100, with one line on what's driving it (skills, level, domain, evidence of impact).
- Top 5 missing keywords: the exact words from the job description that the ATS and you will look for, which my resume lacks or buries. For each, say in a few words where it will go in my rewrite.
- 3 red flags a hiring manager would spot in under 10 seconds. Quote the line (or name the gap) and say why it costs me the interview.

=== STEP 2 · REWRITE MY EXPERIENCE ===
Rewrite my Experience section (and Projects) for this job. This is a real rewrite, not polishing:
- Rework every bullet. Keep one unchanged only if it already follows the XYZ formula, carries a result, and matches what this job cares about. Reorder, merge, split or replace bullets so the work most relevant to "${title}" comes first in each role.
- Google's XYZ formula for every bullet: "Accomplished [X] as measured by [Y], by doing [Z]". Open with a strong action verb (past tense; present tense only for my current role), put the result early, one to two lines each.
- Work all 5 missing keywords in naturally, in the job's exact wording, wherever my work genuinely involved them. Never stuff keywords or attach them to work I didn't do.
- Remove all 3 red flags.
- Use everything you know about me (resume, skills list, private context) to make bullets specific: what I built, the stack, who used it, the scale, the outcome. Turn duties into achievements.
- Bridge to this role: frontend work usually includes backend-, platform- and DevOps-adjacent pieces (API design and integration, auth, caching, performance, testing, CI/CD, deployments, monitoring, data handling). Surface every such piece of my real work and describe it in this job's language, so my experience reads as directly relevant.
- Use my projects (resume and private context) to show the job's skills I've used outside work. Lead each project with the skills this job wants most.
- Must-have skills I have no evidence for at all (e.g. the job wants Azure and I've never used it): extend one of my real personal projects with a small, realistic piece of work using that skill, something I can build in a few hours (e.g. "Deployed it on Azure App Service with a GitHub Actions pipeline", "Added Redis caching for the API"), and write it as a PROJECT bullet, never in Experience. If I have no personal project that fits, add one small, realistic project in my area that uses those skills. Every such addition goes on the "Build before you apply" list in Step 3.
- [Y] must be real: a number from my resume or private context (users, %, latency, time saved, scale). Never invent a number. Where none exists, state a concrete, verifiable outcome instead.
Show the rewritten Experience and Projects as plain bullets under each role.

=== STEP 3 · THE 10-SECOND SCAN ===
Now act as two readers at once: the ATS filter, and a hiring manager reading 200 resumes in one sitting. Scan my NEW resume top to bottom.
- Name each section or line that would get filtered out or skipped, and why (one line each).
- Rewrite each of them so it stops the scroll: the result in the first few words, the strongest and most relevant item first, nothing a skimmer would pass over.
- New match score: X/100, and what changed. Score it honestly, as the ATS and this hiring manager would.
- If it's still below 85: say exactly what's holding it back and what would close the gap.
- BUILD BEFORE YOU APPLY: list every project addition you made for skills I haven't used yet: the skill, which project, exactly what to build (concrete steps), and roughly how long it takes. I'll build these before sending the resume, so every line on it is true and I can talk about it in the interview. Write "nothing to build" if there are none.

=== STEP 4 · FINAL RESUME (LATEX) ===
Put everything together: my complete tailored resume, with every fix from Steps 2 and 3, as ONE ${fence}latex code block at the very end of your reply. Nothing after it. The code must start with these comment lines:
% Target: ${title} at ${company}
% Match score: <before>/100 -> <after>/100
% Keywords added: <comma-separated>
% Skills to brush up on before interviews: <comma-separated, or "none">
% Build before applying: <one short line per project addition, or "nothing">

=== RULES FOR THE WHOLE RESUME ===
- Honesty first: never invent employers, titles, dates or numbers. Experience bullets describe only work I really did; skills I'm still learning appear in Technical Skills and as project additions from the "Build before you apply" list.
- Technical Skills: every skill, tool and technology the job asks for, in the job's exact wording and spelling, most important first. That includes skills not yet in my background (listed below as "to add"): I'm picking them up, so they go in Technical Skills (and the Summary if central to the role) and, where they're must-haves, into my projects as above; never into experience bullets.
- Summary: 2-3 lines that position me for this exact role at ${company} (for example, a strong frontend engineer with hands-on skills across the rest of this stack), leading with my strongest matching result and naming the job's core technologies.
- Show ownership, bias for action and delivering results through real examples, without buzzwords.
- ONE page. Cut or merge the least relevant bullets (3-6 per role, 2-3 per project); drop school marks and coursework first if space is tight. Keep my degree and CGPA.
- Sections in this order: Summary, Technical Skills, Experience, Projects, Education, Achievements (only if space allows).
- Dates as "Mon YYYY -- Mon YYYY" or "Mon YYYY -- Present".

${LATEX_RULES}

=== PREAMBLE (copy exactly) ===
${LATEX_PREAMBLE}

=== HEADER (copy exactly, right after ${String.raw`\begin{document}`}) ===
${latexHeader(p)}

=== THE JOB ===
${facts.join("\n")}

${description}

Skills from the job that I have: ${have.join(", ") || "(see my resume)"}
Skills from the job to add (I'm learning them): ${missing.join(", ") || "none detected"}

${aboutMeBlock(p)}

${resumeBlock(track, baseResume, p.masterResume)}${notesBlock(p)}`;
}
