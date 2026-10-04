"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveProfileAction } from "@/server/actions/settings";
import { SKILL_GROUPS, type Profile, type SkillGroup } from "@/shared/types";
import { Button, buttonClass, Card, Icon, type IconName } from "../ui";

const GROUP_LABEL: Record<SkillGroup, string> = {
  frontend: "Frontend skills",
  backend: "Backend skills",
  devops: "DevOps & cloud skills",
  data: "Data science & ML skills",
  security: "Cybersecurity skills",
  other: "Other (Git, DSA, tools…)",
};

const PLACEHOLDER: Record<SkillGroup, string> = {
  frontend: "React, Next.js, TypeScript, Tailwind",
  backend: "Node.js, Express, PostgreSQL, REST APIs",
  devops: "Docker, Kubernetes, CI/CD, AWS, Linux",
  data: "Pandas, Scikit-learn, PyTorch, Statistics, Power BI",
  security: "SIEM, Penetration Testing, OWASP, Network Security",
  other: "Git, DSA, Agile",
};

const toList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function ProfileForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile);
  const [skillText, setSkillText] = useState<Record<SkillGroup, string>>(
    Object.fromEntries(SKILL_GROUPS.map((g) => [g, (profile.skills[g] ?? []).join(", ")])) as Record<SkillGroup, string>,
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState("");

  const current: Profile = {
    ...p,
    skills: Object.fromEntries(SKILL_GROUPS.map((g) => [g, toList(skillText[g])])) as Profile["skills"],
  };
  const set =
    (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setP((x) => ({ ...x, [k]: k === "yearsExperience" ? Number(e.target.value) : e.target.value }));

  const save = () =>
    start(async () => {
      await saveProfileAction(current);
      setSaved("Saved — all jobs re-scored with your skills.");
    });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionHead icon="profile">About you</SectionHead>
        <p className="mb-4 mt-1 text-xs text-muted">Only used inside your prompts and resumes. This site is private.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" className="field" value={p.name} onChange={set("name")} />
          </div>
          <div>
            <label className="label" htmlFor="email">Personal email</label>
            <input id="email" className="field" value={p.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" className="field" value={p.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="label" htmlFor="loc">City</label>
            <input id="loc" className="field" value={p.location} onChange={set("location")} placeholder="Hyderabad, India" />
          </div>
          <div>
            <label className="label" htmlFor="yrs">Years of experience</label>
            <input id="yrs" type="number" min={0} max={40} step={0.5} className="field" value={p.yearsExperience} onChange={set("yearsExperience")} />
          </div>
          <div>
            <label className="label" htmlFor="links">Links (one per line)</label>
            <textarea id="links" className="field min-h-[38px]" rows={2} value={p.links} onChange={set("links")} placeholder={"linkedin.com/in/…\ngithub.com/…"} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead icon="sparkles">Your skills</SectionHead>
        <p className="mb-4 mt-1 text-xs text-muted">
          Comma-separated. Jobs are scored by how many of their skills appear here, so list everything you can honestly talk about in an interview.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {SKILL_GROUPS.map((g) => (
            <div key={g}>
              <label className="label" htmlFor={`sk-${g}`}>{GROUP_LABEL[g]}</label>
              <textarea
                id={`sk-${g}`}
                className="field min-h-20"
                value={skillText[g]}
                onChange={(e) => setSkillText((s) => ({ ...s, [g]: e.target.value }))}
                placeholder={PLACEHOLDER[g]}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead icon="jobs">Master resume</SectionHead>
        <p className="mb-4 mt-1 text-xs text-muted">
          Paste your full current resume (plain text or Markdown). It&apos;s the single source of truth: every tailored version is built only from what&apos;s here.
        </p>
        <textarea className="field min-h-72 font-mono sm:text-xs leading-relaxed" value={p.masterResume} onChange={set("masterResume")} />
      </Card>

      <Card className="p-5">
        <SectionHead icon="chat">Claude</SectionHead>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="curl">Where “Open Claude” goes</label>
            <input id="curl" className="field" value={p.claudeUrl} onChange={set("claudeUrl")} placeholder="https://claude.ai/new" />
            <p className="mt-1 text-xs text-muted">
              Tip: make a “Job Hunt” Project in Claude with your resume as project knowledge, then paste that project&apos;s link here.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="notes">Private notes for Claude</label>
            <textarea
              id="notes"
              className="field min-h-24"
              value={p.claudeNotes}
              onChange={set("claudeNotes")}
              placeholder="Context Claude should know but never put on a resume, e.g. which areas you're strongest in or still learning."
            />
          </div>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <SectionHead icon="document">Base resumes</SectionHead>
          <p className="mt-1 text-xs text-muted">One per role type, made with Claude from your master resume.</p>
        </div>
        <Link href="/resumes" className={buttonClass("secondary", "sm")}>
          Open Resumes <Icon name="arrowRight" className="size-3.5" />
        </Link>
      </Card>

      <div className="panel-raised sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 md:bottom-4 flex flex-wrap items-center gap-3 rounded-xl p-3">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-good">
            <Icon name="check" className="size-3.5" /> {saved}
          </span>
        )}
      </div>

    </div>
  );
}

function SectionHead({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
        <Icon name={icon} className="size-3.5" />
      </span>
      {children}
    </h2>
  );
}
