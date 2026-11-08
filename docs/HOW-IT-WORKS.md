# How Job Hunt works

A guided tour of this project: what each part does, why it's built that way, and the ideas
behind it. Read it top to bottom once, then use it as a map. File links open the real code.

For the two big flows step by step (one fetch from alarm to notification, and one code change
from `git push` to live, including what a build is), see [END-TO-END.md](END-TO-END.md).

At the end there's a **learning journal**: every meaningful change, the problem behind it, and
the lesson. It grows as the project does.

---

## 1. The big picture

```
                 ┌──────────────── Your phone / laptop ────────────────┐
                 │  Browser or Home Screen app (React UI)               │
                 │  Service worker (shows notifications)                │
                 └───────────────▲───────────────────┬─────────────────┘
                                 │ pages, data        │ clicks, forms
                                 │                    ▼
 GitHub Actions ──hourly──▶  ┌────────────────────────────────────────┐
 (the alarm clock)           │  Next.js server on Render              │
                             │  · renders pages (server components)   │
                             │  · handles actions & API routes        │
                             │  · fetches jobs, scores them           │
                             │  · sends push notifications            │
                             └───────┬──────────────┬────────────┬────┘
                                     │              │            │
                     ┌───────────────▼──┐  ┌────────▼───────┐  ┌─▼──────────────────┐
                     │ Neon (Postgres)  │  │ Job sources    │  │ Apple / Google     │
                     │ all the data     │  │ 94 careers     │  │ push services      │
                     └──────────────────┘  │ sites, JSearch │  │ (deliver to phone) │
                                           └────────────────┘  └────────────────────┘
```

In one sentence: **a Next.js app on Render, storing everything in a Postgres database on Neon,
woken every hour by GitHub to collect jobs from company careers sites, score them for each
person, and notify their phones.**

Everything runs on free plans. See [§10](#10-hosting-and-what-it-costs).

---

## 2. The building blocks (the "stack") and why each one

| Piece | What it is | Why we use it |
|---|---|---|
| **Next.js 16** | A React framework: UI *and* server in one project | One codebase, one deploy. Pages are built on the server, so they load fast and secrets never reach the browser. |
| **React** | The UI library | You already know it from frontend work. |
| **TypeScript** | JavaScript with types | Catches mistakes before running. If a function wants a `userId: string`, passing a number fails at build time. |
| **Tailwind CSS** | Styling with small utility classes (`px-4`, `text-muted`) | Fast to write and consistent. Our colours are *tokens* in [globals.css](../src/app/globals.css), so light and dark mode are one switch. |
| **PostgreSQL** | A relational database | Reliable, free on Neon, and good at the filtering and sorting a job list needs. |
| **Drizzle ORM** | Writes SQL from TypeScript | Type-safe queries: a typo in a column name is a build error, not a 3 am crash. |
| **PGlite** | Postgres compiled to WebAssembly, runs inside Node | Lets the app run on a laptop with zero setup. Same queries as real Postgres. |
| **Render** | Hosting that runs our server | Free plan, deploys automatically when you `git push`. |
| **Neon** | Hosted Postgres | Free plan, Singapore region (close to India). |
| **GitHub Actions** | Runs scripts on a schedule | Our hourly alarm clock (Render's free server sleeps, so it can't set its own). |
| **web-push** | Library that sends phone notifications | Standard Web Push, no third-party account needed. |

> **Concept: server vs client.** In Next.js, most components run *on the server*: they read
> the database directly and send finished HTML. Files that start with `"use client"` run *in the
> browser*: they handle clicks, typing and live updates. Rule of thumb: server for data, client
> for interaction. Example: [settings/page.tsx](../src/app/(app)/settings/page.tsx) (server)
> reads your keys and passes masked versions to
> [api-keys-card.tsx](../src/client/components/settings/api-keys-card.tsx) (client) to show and edit.

---

## 3. Folder map

The code is split into **three layers**, plus the routing folder Next.js requires:

```
job-hunt-hq/
├─ src/
│  ├─ app/                    ← ROUTES ONLY: which URL shows what (Next.js requires this folder)
│  │  ├─ (app)/               ← signed-in pages; (app) groups them under one layout
│  │  │  ├─ page.tsx          ← "/"  Today
│  │  │  ├─ jobs/             ← "/jobs" list and "/jobs/[id]" job page
│  │  │  ├─ tracker/ resumes/ profile/ settings/ admin/
│  │  │  └─ layout.tsx        ← nav bar, sign-in check, re-scoring check
│  │  ├─ login/               ← the only page you can see signed out
│  │  ├─ api/                 ← API endpoints (thin: they hand the work to server/)
│  │  ├─ manifest.ts          ← makes the site installable as a phone app
│  │  └─ layout.tsx           ← <html>, fonts, theme
│  │
│  ├─ client/                 ← FRONTEND: what you see and click
│  │  ├─ api/
│  │  │  ├─ endpoints.ts      ← every API address the screens use, in one list
│  │  │  └─ requests.ts       ← the browser's calls to them: startFetch(), getFetchStatus()…
│  │  └─ components/
│  │     ├─ ui/               ← building blocks, one per file: button, card, badge, icon…
│  │     ├─ layout/           ← nav bar, avatar, theme switch
│  │     ├─ feedback/         ← the progress bar shown while a switch saves
│  │     ├─ jobs/ resumes/ tracker/ settings/ profile/ admin/   ← each screen's parts
│  │
│  ├─ server/                 ← BACKEND: only ever runs on the server
│  │  ├─ actions/             ← server actions: what the buttons do (the frontend's only door in)
│  │  ├─ auth/                ← Google sign-in, sessions, encryption
│  │  ├─ db/                  ← database connection + table definitions (schema.ts)
│  │  ├─ services/            ← business logic: jobs, applications, accounts, settings, queries
│  │  ├─ fetching/            ← fetcher.ts, scheduler.ts, and sources/ (one reader per site type)
│  │  └─ notify/              ← phone push + Telegram
│  │
│  ├─ shared/                 ← USED BY BOTH: pure logic, no database, no browser-only code
│  │  ├─ core/                ← scoring, experience, skills, role types, prompts, schedule maths
│  │  └─ types.ts             ← shared types, incl. what the server hands to the screens
│  │
│  ├─ proxy.ts                ← first gate on every request (signed in?)  ┐ Next.js wants these
│  └─ instrumentation.ts      ← starts the scheduler with the server      ┘ two at the top of src/
├─ drizzle/                   ← database migrations (numbered SQL files)
├─ public/sw.js               ← the service worker (notifications)
├─ .github/workflows/         ← the hourly GitHub alarm clock
├─ Dockerfile, render.yaml    ← how Render builds and runs the app
└─ .env                       ← your secrets (never committed)
```

**Who may use whom:**

```
   app/  ──────────►  client/  server/  shared/      (the glue: may use all three)
   client/ ─────────►  shared/,  and server/actions only
   server/ ─────────►  shared/                        (never client/)
   shared/ ─────────►  nothing (only type names from server/db/schema, which vanish at build time)
```

These rules aren't just written down: they're in `eslint.config.mjs`, so `npm run lint` fails
if, say, a component imports the database. Every backend file also starts with
`import "server-only"`, so Next.js refuses to build if one ever ends up in the browser. (Two
exceptions: the action files, whose `"use server"` already means server-only, and `db/schema.ts`,
which the migration tool reads outside Next.js.)

> **Concept: separation of concerns.** Each layer has one job. `client/` decides how things
> *look*; `server/` decides what *happens* (database, other websites, secrets); `shared/core/`
> is pure logic with no database or network: "given this job text and this profile, what's the
> score?". That makes it easy to test and lets it run on both sides: the same `analyzeJob`
> scores jobs on the server during a fetch *and* in your browser on "Add a job".

> **Concept: one list of endpoints.** `client/api/endpoints.ts` names every API address once.
> If an address changes, there's one line to edit, and searching for `API.fetch` finds every
> place that uses it. Most buttons don't need an address at all: they call server actions,
> which Next.js turns into requests behind the scenes.

---

## 4. Following one request

What happens when you open `/jobs` on your phone:

1. **[proxy.ts](../src/proxy.ts)** runs first. No `jh_session` cookie → redirect to `/login`.
   It only checks that the cookie *exists*; it's a cheap first gate.
2. **[(app)/layout.tsx](../src/app/(app)/layout.tsx)** calls `requireUser()`, which looks the
   session up in the database ([auth/index.ts](../src/server/auth/index.ts)). A fake or deleted
   session → back to login. This is the real check.
3. **[jobs/page.tsx](../src/app/(app)/jobs/page.tsx)** reads the filters from the URL
   (`?fit=ready&sort=recent`) and asks [queries.ts](../src/server/services/queries.ts) for *your* jobs.
   Every query includes `WHERE user_id = you`.
4. The server sends finished HTML. Your phone shows it. Buttons like **Save** call *server
   actions* in [server/actions/](../src/server/actions/), which check who you are again before changing
   anything.

> **Concept: never trust the client.** Anything from the browser can be faked. That's why every
> action and API route calls `requireUser()` itself, even though the page already did, and why
> every query is scoped to the signed-in user's id. We tested this: opening a friend's job or
> resume returns 404.

---

## 5. Where jobs come from (the fetch)

Three steps, in [fetcher.ts](../src/server/fetching/fetcher.ts):

```
 1. Shared pool (once, for everyone)       2. Your feed                3. Your own sources
 ─────────────────────────────────        ──────────────────         ───────────────────
 94 company careers sites ──▶ raw_jobs ──▶ copy companies you  ──▶   Google Jobs (JSearch)
 (Amazon, Google, Workday,                 follow, score each        with YOUR key,
  Oracle, Greenhouse…)                     against YOUR profile      extra career pages
```

**Step 1, the shared pool.** Careers sites are checked *once* for everyone and stored in
`raw_jobs`. Fifteen people don't mean fifteen times the traffic to Amazon. Each kind of site has
a reader in [sources/companies/](../src/server/fetching/sources/companies/):

- **Workday** (most big companies): a JSON endpoint the careers page itself uses, with an India
  filter. [workday.ts](../src/server/fetching/sources/companies/workday.ts)
- **Amazon, Google**: their own formats. Google's job data is inside the page's HTML.
  [bigtech.ts](../src/server/fetching/sources/companies/bigtech.ts)
- **Oracle, Eightfold, SmartRecruiters, Greenhouse, Lever, Ashby**: each its own small reader.

These are the same public feeds your browser loads on a careers page, so they're free. The
trade-off: they're unofficial, so a company can change them. **Settings → Companies** shows
which ones are answering.

**Step 2, your feed.** `fillFromPool` copies jobs from companies you follow into `jobs` with your
`user_id`, scored for *your* profile. Same job, different score per person.

**Step 3, your own sources.** Google Jobs via JSearch uses *your* RapidAPI key (200 free
requests a month), so one person can't use up another's quota.

**Honest dates.** We dropped Adzuna because its "posted" dates were re-listing dates: it said
"1 day ago" for jobs open for 30+ days. Company sites give the real posting date, and jobs older
than 30 days are skipped and cleaned up.

> **Concept: deduplication.** The same job can show up from two sources. Each job gets a
> `dedupe_key` (company + title + city, normalised), and the database has a unique index on
> `(user_id, dedupe_key)`, so a second copy is refused at the database level, not just in code.

---

## 6. Scoring: fit, check, no

All in [shared/core/](../src/shared/core/), pure functions:

- **[skills.ts](../src/shared/core/skills.ts)**: a dictionary of ~90 skills with the spellings
  JDs use ("k8s" → Kubernetes, "reactjs" → React), grouped into Frontend, Backend, DevOps, Data,
  Security and Other.
- **[experience.ts](../src/shared/core/experience.ts)**: finds "2-4 years", "0–2 yrs",
  "freshers welcome", "Senior …" and turns them into a range.
- **[classify.ts](../src/shared/core/classify.ts)**: works out the role type from the title, or
  from the description's skills if the title is vague.
- **[analyze.ts](../src/shared/core/analyze.ts)**: puts it together.

```
score = 55% skills you match  + 25% experience fits  + 10% salary  + 10% is a tech role
```

Plus the rules that matter more than the number (`judgeFit`):

- **no**: not a tech role, internship, campus hiring, too senior, or pays below your floor
- **check**: something's unknown (experience not stated, only a preview, few skills match)
- **fit**: everything checked and OK

New users score **0** until they add skills: with nothing to compare, any number would be made
up.

> **Concept: versioned re-scoring.** When the rules change, old scores in the database are
> stale. `SCORING_VERSION` in [jobs.ts](../src/server/services/jobs.ts) is a number we bump; each person's
> feed is re-scored once, the next time they open the app.

---

## 7. Accounts and security

- **Sign-in** is Google OAuth (authorization code + PKCE) in
  [auth/google.ts](../src/server/auth/google.ts). Google proves who you are; we never see a password.
- **Invite-only**: an admin adds emails on the Admin page, so only those can get in. At most `MAX_USERS` people (15 by default, 20 on Render).
- **Sessions**: a random token in an `httpOnly` cookie, which JavaScript can't read, so a
  malicious script can't steal it. The database stores only its **SHA-256 hash**, so a leaked
  database can't be used to sign in.
- **Your API keys** are encrypted with **AES-256-GCM** before they're stored
  ([auth/crypto.ts](../src/server/auth/crypto.ts)). The key comes from `SESSION_SECRET`, which lives
  only in `.env` and on Render.
- **Secrets never go to git**: `.gitignore` excludes `.env`. Only `.env.example` (no real
  values) is committed.

> **Concept: hashing vs encryption.** *Hashing* is one-way: we can check a session token
> matches but can never get it back. *Encryption* is two-way: we need your JSearch key back to
> use it, so it's encrypted, not hashed.

---

## 8. Running on a schedule

Render's free server **sleeps after 15 minutes** without visitors, so it can't run its own timer.

```
Alarm clocks (any of them can wake the app; extra wake-ups are harmless)
  · cron-job.org, every 30 min ─┐
  · GitHub Actions, hourly     ─┼─▶ GET /api/cron/fetch?from=…  (with a secret header)
  · the server's own timer,    ─┘     └─▶ answers "202 started" at once, then in the background:
    every 10 min while awake                scheduler.tick(): for each person
                                              · is their "Check for new jobs every N hours" up?
                                                  → fetch → notify (every time, day and night)
                                              · morning digest due? → send
```

Why three? GitHub's scheduled runs are "best effort" and can be hours late. See the journal
entry below. **Settings → Recent fetches** shows when each alarm clock last arrived.

- **Answer first, work after** (`after()` in [cron route](../src/app/api/cron/fetch/route.ts)):
  GitHub bills by the minute it waits, so we reply in milliseconds and work in the background.
- **Fixed clock times**: "every 3 hours" means at 12, 3, 6 and 9 o'clock India time, for
  everyone ([core/schedule.ts](../src/shared/core/schedule.ts)). Everyone on the same period is
  fetched in one pass, and you know when to expect your notification.
- **Most checks don't touch the database**: after a pass, the scheduler remembers when the next
  fixed time is, and checks before then return immediately (it still looks once an hour, to
  pick up changes). That matters because Neon's free plan counts the hours the database is
  awake (100 a month) and only pauses it after 5 quiet minutes.
- **"Fetch now" doesn't move your schedule**: automatic fetches track `lastAutoFetchAt`
  separately.

---

## 9. Phone notifications (Web Push)

```
 Your phone                           Our server                    Apple / Google
 ──────────                           ──────────                    ──────────────
 1. Turn on switch  ── subscription ─▶ saved in DB (pushSubs)
                                       … later, a fetch finds jobs …
                                     2. encrypt + sign message ───▶ 3. push service
 4. service worker (sw.js) ◀───────────────────────────────────────── delivers it
    shows the notification
```

- **Subscription**: when you flip the switch, the phone creates a unique address (an
  *endpoint* at Apple or Google) plus encryption keys, and we store them. Code:
  [push-card.tsx](../src/client/components/settings/push-card.tsx) → [server/actions/push.ts](../src/server/actions/push.ts).
- **VAPID keys**: our server's own key pair that proves "this push really is from Job Hunt". Made
  automatically on first use and stored encrypted, so there was nothing for you to set up.
  [notify/push.ts](../src/server/notify/push.ts)
- **Service worker** ([public/sw.js](../public/sw.js)): a small script the phone keeps even when
  the app is closed. It wakes for a push, shows the notification, and opens the right page on tap.
- **Why the Home Screen app?** Apple only allows web notifications for sites installed to the
  Home Screen. That needs a *web app manifest* ([manifest.ts](../src/app/manifest.ts)) and an
  icon, which is why the old bookmark didn't work and the new orange "JH" icon does.
- **Rules**: every automatic fetch → a notification, day and night, even "no new jobs", so you
  know it ran. Your own "Fetch now" → always tells you it finished or failed, and only you.

---

## 10. Hosting and what it costs

| Service | Free plan | Our usage |
|---|---|---|
| Render | 750 server-hours a month, sleeps when idle | ~250 h (awake ~15–20 min each hour) |
| Neon | 0.5 GB storage | well under |
| GitHub Actions (private repo) | 2,000 minutes a month | ~720 (hourly, under a minute each) |
| Company careers sites | free, public | no keys |
| JSearch | 200 requests a month **per person** | ~150 with 5 searches a day |

**Deploying** is `git push`. Render sees the new commit, builds the
[Dockerfile](../Dockerfile), and swaps the new version in. **Your laptop and the live site share
one database** (Neon): `DATABASE_URL` in `.env` points there, with `SCHEDULER=off` locally so
your laptop doesn't run fetches too.

> **Concept: migrations.** The database's shape (tables, columns) changes over time. Each change
> is a numbered SQL file in [drizzle/](../drizzle/) (`0000_init.sql` … `0007_resume_files.sql`).
> On start, the app applies any it hasn't run yet, so the live database always matches the code.

---

## 11. Learning journal

Newest first. Each entry: what changed, the problem behind it, and the lesson.

### Tailoring: every role gets job-aligned bullets
**Problem:** the tailoring prompt said experience bullets may only describe work already on the
resume, so job skills went into Projects only. A screen that reads the Experience section found
none of the job's core skills, and the resume was dropped at the first step.
**Change** ([prompts.ts](../src/shared/core/prompts.ts), Step 2 "FIRST"): before anything else,
Claude adds 1-2 job-aligned bullets to the current job, 1 to the internship that led into it, and
rewords other internships toward the job at beginner level ("gained exposure to…"). They go
first in each role (the top of a role is what gets read), use the job's exact keywords, carry no
invented numbers, and are listed in a "% Experience bullets added" line so you can prepare to
talk about each one. Company, title and dates never change.
**Design choice:** the rules name kinds of role ("the internship that led into your current
job"), not companies, because every invited user shares this prompt.
**Lesson:** a rule like "only describe real work" can quietly defeat the goal (passing the
screen). Check what each rule costs, and keep the trade-off visible to the person taking the risk.

### Resume score: rated like an ATS and a recruiter
**What:** on a job's page, a resume gets a score (0-100) as you paste it, with the breakdown,
the must-have skills colour-coded, your experience against the job's, and recruiter-style tips.
**Why it changed:** the first version only counted keywords. Screening software and recruiters
look at more: *must-haves* weigh more than nice-to-haves, a skill **used in a job** beats one
only **listed**, recent work counts more, and years of experience are their own check.
**The formula** ([resume-score.ts](../src/shared/core/resume-score.ts)), out of 100:
- **Skills 45:** each skill the job names gets a weight: 3 when it's a must-have (under a
  "Requirements" heading, in the title, or said with "must/strong"), 1 when it's "nice to have /
  a plus", 2 otherwise, a little more when repeated. The resume earns 100% of it for a skill used
  in the most recent job, 90% in an older job, 80% in a project, 45% if only in the Skills list.
  A skill implied by another (PostgreSQL → SQL, Django → Python) earns 85% of that, with a tip
  to write the exact word too, because older ATS (Taleo, iCIMS) only match exact words.
- **Experience 20:** years **read from the dates in the resume** (overlaps counted once,
  internships at half), with relevant years (jobs using this job's skills, or the same kind of
  role) counting fully and the rest a third, against the years the job asks for.
- **Role 10:** is the resume the same kind of role (backend, data…)? Related roles get partial credit.
- **Impact 10:** bullets with numbers (%, users, ms, ₹) and strong verbs.
- **ATS-readable 10:** email, phone, standard headings, sensible length. **Education 5:** a degree when the job asks for one.
- **Knockouts:** missing most must-haves, or under half the required years, caps the score at
  45 (both: 30), like the pass/fail filters ATS run before ranking.
**Salary isn't in it:** most postings don't state one. **Tested** on one resume against three
jobs: a backend job it fits scored 95, a frontend job 60, a senior data job 30.
**Limits:** it only knows skills in the app's list (Scala, Snowflake aren't in it yet), and it
can't judge writing quality the way an AI model or a person can.
**Lesson:** when you can't use a model, encode what experts actually look at (importance,
evidence, recency, hard filters) instead of counting words.

### Resumes as real PDFs: upload, LaTeX, preview
**What:** the Resumes page was rebuilt around one **Add resume** panel (upload a PDF, paste LaTeX,
or write it with Claude) and compact cards showing each resume's first page. **Preview** opens
every page; **Download** saves a file named like *Your Name - Backend Developer.pdf*.
**How:**
- **LaTeX → PDF** goes to a free online LaTeX compiler (latex.ytotech.com; texlive.net if that
  one can't be reached), the same kind of service as Overleaf. A real TeX install is ~4 GB and
  wouldn't fit Render's free server. A mistake that stops the PDF (e.g. a missing package) is
  reported with its line number and nothing is saved, unless you choose *Save anyway*.
- **Uploaded PDFs** are checked by their first bytes (`%PDF-`), not by the name the browser
  reports, and their text is pulled out (with `unpdf`) so Claude can still read them.
- **Storage:** a new `resume_files` table ([0007_resume_files.sql](../drizzle/0007_resume_files.sql))
  holds the bytes (`bytea`), *beside* `resume_versions` rather than in it, so listing resumes
  never pulls files over Neon's network (see the next entry for why that matters). LaTeX made
  before this change is compiled the first time someone looks at it, then kept.
- **Preview** draws the PDF with PDF.js onto a `<canvas>` instead of using the browser's
  built-in viewer, which doesn't work inside a page on Android phones.
- **Caching:** a resume never changes under its id (an edit saves a new row), so the PDF
  address tells the browser to keep it for a year (`immutable`): the thumbnail, the preview and
  later visits download it once.

[resume-files.ts](../src/server/services/resume-files.ts),
[api/resumes](../src/app/api/resumes/route.ts), [pdf-view.tsx](../src/client/components/resumes/pdf-view.tsx),
[add-resume.tsx](../src/client/components/resumes/add-resume.tsx)
**Bug found while testing:** the preview closed itself a moment after opening. In development,
React runs each effect twice on purpose (mount, clean up, mount) to expose this kind of bug.
The cleanup called `dialog.close()`, whose `close` event arrived *after* the second mount and
told React to remove the preview. **Fix:** don't close on cleanup; removing the element is enough.
**Attached to the job, for good:** a tailored resume always pointed at its job (`job_id`), but
the daily cleanup deletes old jobs you never saved, which cut that link (`ON DELETE SET NULL`).
The cleanup now skips any job that has a resume (`NOT EXISTS`), and the job page's list has
Preview, Download and Delete right there.
**Downloads you can see:** a plain download link gives no sign on most phones. The Download
button now fetches the file itself (`fetch` → `Blob` → a temporary link with `download="…"`), so
it can show *Downloading…*, pop a check, and slide up a notice with the file name. The server
names the file `Your_Name_Role_Company.pdf` (`Content-Disposition`), and the button asks with
`cache: "no-store"` so an old cached copy can't come back under an old name.
**Lessons:** never trust a file's name or type, look at its bytes. Keep big blobs out of the
rows you list. And when an effect "undoes" something, ask what events the undo fires.

### Neon's network allowance at 95%
**Problem:** Neon's free plan allows **5 GB a month** of data leaving the database; running out
stops the database until the next period. It was at 95% after about 9 days. **Cause:** every
person's fetch read the **whole shared shelf** (3,300+ jobs with descriptions, ~18 MB) to find the
few new ones: 4 people × 8 fetches a day ≈ **575 MB a day**. The Jobs page also sent all 150
descriptions (~0.7 MB) on every visit and filter click. **Fix:** each person remembers when they
last took from the shelf (`poolFilledAt`) and asks only for jobs added since then, from companies
they follow, so the database does the filtering and only those rows travel; the Jobs list no
longer carries descriptions, and a card loads its own when you open Details. **Tested:** a fill
after the first one reads only new jobs (a planted old job isn't even read); following a company
fills just that company; the Jobs page sent 0 of 100 descriptions; Details still shows the text.
**Lessons:** "it works" isn't the same as "it's cheap"; read the whole table only when you need
the whole table. Filter in the database (`WHERE`), not in JavaScript after loading everything.
And watch every free-plan meter, not just the first one you hit.

### No more quiet hours
**What:** automatic fetches at 12, 3 and 6 am now notify you like any other; before, nothing was
sent between 11 pm and 7 am and jobs found then were held for a morning notification. Without the
hold, `notifyNewJobs` got simpler: it no longer keeps a "held" list or looks jobs up again.
**Lesson:** features cost code. When a rule isn't wanted, removing it also removes the code that
only existed to support it.

### The 9 am notification that arrived at 9:13, and the ones that never came
**Problem 1 (5 Oct, morning):** the 9 o'clock notification only appeared at 9:13. The "Recently
sent" record showed the server sent it at 9:04 and Apple accepted it; the phone was idle, and
notifications sent with "normal" urgency may be held until the phone wakes. So the server was
switched to "high" urgency.
**Problem 2 (same afternoon):** after that, *no* server-sent notification appeared at all (12:01,
3:04, a 3:40 test, 6:03), though Apple accepted every one. **Investigation, one variable at a
time:** tests sent from a laptop, with high and with normal urgency, arrived; a test built exactly
like the server's, sent to a locked phone, arrived; the app's own sending code run from the laptop
arrived; the server's sender address (`APP_URL`) was correct. What remained: "high" urgency sent
from Render. **Fix:** urgency is now a setting, `PUSH_URGENCY`, defaulting to "normal" (what
worked); "high" can be tried on Render by changing it, with no code change. The root cause of
"high from Render vanishes" is still unknown.
**Lessons:** change one thing at a time and confirm it in the real environment, because "high
urgency" was tested from a laptop, not from where it runs. When something can't be explained yet,
make it a setting you can flip back, and keep the evidence.

### A progress bar for the switches
**Problem:** flipping a switch (Telegram alerts on Admin, Notifications in Settings) waited on the
server with no sign that anything was happening. **Fix:** a thin bar runs across the top of the
screen and a small spinner turns inside the knob while it saves; the switch can't be pressed twice.
The bar lives in [feedback/progress-bar.tsx](../src/client/components/feedback/progress-bar.tsx);
a component turns it on with `useBusyWhile(pending)`. It waits 150 ms before showing, so quick
saves don't flicker. **Tested** in a headless browser with a slowed network, both directions.
**Lesson:** start small. A broader version (messages and loading screens everywhere) was tried
and taken out; the part that was clearly needed came back on its own.

### Frontend, backend and shared: a clear folder structure
**What:** everything outside `app/` moved into three layers: `client/` (what you see),
`server/` (what happens) and `shared/` (pure logic used by both). See [§3](#3-folder-map).
`ui.tsx` became a folder of building blocks, one per file. Every API address now comes from
`client/api/endpoints.ts`. **How it was kept safe:** files were moved with `git mv` (history kept)
and imports were rewritten by a script, not by hand; nothing else changed. Then: type-check and
lint clean, the production build listed **the same 30 routes** as before, all **58 test checks**
passed exactly as before, and every page plus Fetch now and Cancel was clicked through in a browser.
**Lessons:** for a big change, record a *baseline* first, change one kind of thing at a time, and
prove "nothing changed" by comparing against the baseline. And put rules into tools: the layer
boundaries are lint errors now, so they can't quietly erode.

### Admin page, a Telegram switch for everyone, and less clutter
**What:** the People page is now **Admin**, with a "Features for everyone" card. Its Telegram
switch is one app-wide setting (stored under the shared `""` user, like the job pool). Off
hides every Telegram part of Settings *and* stops sending: the function that talks to Telegram
checks the switch itself, so nothing slips through, even for people who saved keys before. The
"Clip jobs from any website" bookmark is gone (it existed to fix Adzuna's cut-off descriptions;
Adzuna is gone too), along with its page and helpers. "Recently sent" shows the last 5 with See more.
**Lesson:** hide a feature in the UI for *people*, and block it at the one place it acts for
*safety*; hiding alone leaves the old paths working. And delete code whose reason has gone:
less code is less to read, test and break.

### Internship as its own role type
**What:** an Internship chip next to Frontend, Backend, Data Science… Tech internships ("Frontend
Intern", "Data Science Intern") get the category `internship`; non-tech ones ("Marketing Intern")
stay under Other. The role is still remembered underneath, so tailoring picks the right base
resume. **Design choice:** internships stay "no" for a full-time search, so the chip also
switches "Can I apply?" to All; otherwise it would always look empty. **Found on the way:** titles
saying "Software *Engineering*" weren't recognised as tech at all (the rule only knew "Software
Engineer"), which a test with a real-looking title exposed. Bumping `SCORING_VERSION` re-sorts
everyone's existing jobs.
**Lesson:** a category and a verdict are different things. Mixing them up ("internship = no") made
internships impossible to browse. And test with real-looking inputs: they find the gaps that
tidy examples miss.

### Fetches on time, but no notifications
**Problem:** after the scheduling fix, every fetch ran on the hour, yet no notifications arrived
at 6 pm, 9 pm or 9 am. **Investigation, one stage at a time:** the fetches ran (`fetch_runs`);
the phone was still registered; the signing keys hadn't changed; a test push with the live
keys got **201 Accepted** from Apple *and appeared on the phone*. A first theory (all
notifications shared one `tag`, so new ones silently replaced old ones) was **wrong**: the
phone's Notification Center was empty, and a test with that exact tag appeared too. Running the
real scheduler locally, both with `next start` and as Render runs it (`node server.js`), sent
correctly, and Render's logs showed no sending errors. **Outcome:** the cause is unknown,
because the old version recorded nothing about what it sent. **Fix:** every send is now recorded
(title, devices accepted, Apple's errors) and shown in Settings → Recently sent. The first
scheduled notification after that change arrived.
**Lessons:** a theory must explain *all* the evidence; one fact that doesn't fit (an empty
Notification Center) means it's wrong. Test each stage separately (did it run? was it sent?
accepted? shown?). It's fine to say "we don't know yet", as long as you add the record that will
tell you next time.

### Fixed fetch times, and a database that gets to sleep
**Problem:** found while checking whether the app could handle 20 people. Neon's free plan
gives **100 compute-hours a month** and pauses the database after 5 quiet minutes. The new
10-minute checks read the database every time, so it would never pause: about 186 hours a
month, and the app would stop when the allowance ran out. **Fix:** fetch at fixed clock times
(every 3 hours means 12, 3, 6, 9), and remember the next one in memory so checks in between skip
the database. **Lessons:** on free plans, *idle time is a resource*; something that runs "only
every 10 minutes" can still cost 24 hours a day. Read the pricing page for *what is counted*,
not just the headline limits. And grouping work into batches (everyone at 3 o'clock) is
cheaper than spreading it out.

### "Every 3 hours" was really every 2 h 15 min
**Problem:** Settings said "next: around 2:53 pm", but the fetch would have run at about
2:08 pm. When GitHub's late hourly alarm was the only trigger, fetches were allowed up to
45 minutes early so a late alarm couldn't push you past your slot. With a check every
10 minutes, that allowance just made every interval shorter. **Fix:** allow one check (10 min).
**Lesson:** a workaround is tied to the problem it worked around. When the cause goes away
(an unreliable alarm), revisit the workaround, or it quietly becomes a bug.

### Automatic fetches missed for hours; no notification
**Problem:** you were due an automatic fetch from about 02:40 UTC, but the next one ran at 06:23,
and it sent no notification. **Investigation:** `fetch_runs` and the per-person
`lastAutoFetchAt` showed the app fetched correctly *whenever it was woken*. GitHub's hourly
alarm simply didn't arrive for ~5 hours: GitHub's scheduled workflows are "best effort" and get
delayed or dropped when GitHub is busy. The silence had a second cause: that fetch found 0 new
jobs, and the rule was "notify only when something's new".
**Fix:** (1) more than one alarm clock: the server checks its own schedule every 10 minutes
while awake (`SCHEDULER=on`), cron-job.org calls it reliably, and GitHub stays as a backup. Extra
alarms are harmless because a person is only fetched when due (the scheduler is
**idempotent**). (2) Every daytime automatic fetch now notifies, even with nothing new.
(3) Settings shows when each alarm last arrived, so next time we can *see* instead of guess.
**Lessons:** don't depend on a single unreliable trigger; design for redundancy. *Observability*
(recording what happened) turns "it seems broken" into a five-second diagnosis. And when the
spec says "notify after every fetch", don't quietly add "…if there's news".

### Fetch now: start, then check back
**Problem:** on the phone, "Fetch now" sometimes said *failed*, but the server logs showed every
fetch finished fine. **Root cause:** the button kept one HTTP request open for the whole 2–4
minute fetch, and iOS kills open requests when you leave an app. **Fix:** `POST /api/fetch`
starts the fetch and answers at once; the button asks `GET /api/fetch` every 3 s, and again
when the app comes back to the foreground.
**Lesson:** *check the data before changing code.* Looking at `fetch_runs` showed the server was
fine, which pointed straight at the client. And: never hold a request open for minutes on mobile.
Use the **start-then-poll** pattern (or a push) for long jobs.
[fetch-button.tsx](../src/client/components/jobs/fetch-button.tsx), [api/fetch/route.ts](../src/app/api/fetch/route.ts)

### Notify when your own Fetch now fails
**Problem:** a failed fetch while you're out of the app was silent. **Fix:** "Fetch failed"
with the reason. A fetch cut off by a server restart can't report itself, so we write a
"fetch started" marker; if it's still there 20 minutes later, the next hourly run tells you.
**Lesson:** a crashed process can't tell anyone it crashed, so *something else* has to notice
(a marker plus a later check, the same idea as a heartbeat).

### Per-person fetch interval, hourly wake-up
**Problem:** the interval setting couldn't work below 3 hours, because GitHub only woke the
server every 3 hours. **Fix:** wake hourly; each person is fetched when *their* interval is up.
**Lesson:** a schedule is only as fine-grained as whatever wakes it up.

### Phone notifications (Web Push)
Service worker, manifest, VAPID keys. See [§9](#9-phone-notifications-web-push).
**Lesson:** on iPhone, web push needs the Home Screen app. Platform rules shape the feature as
much as code does.

### Shared job links
**Problem:** a link to your job was a 404 for a friend, because job ids are per person.
**Fix:** if the id isn't yours, find (or add) the same job in *their* feed and redirect.
**Lesson:** per-user data and shareable URLs pull in opposite directions; decide what a link
*means* (here: "this posting", not "this row").

### Data Science and Cybersecurity roles
New role types, skill groups and base resumes. Old jobs moved into the new categories through
a `SCORING_VERSION` bump. **Lesson:** keep derived data (categories, scores) re-computable from
the source data.

### New users scored 0
**Problem:** a friend with no skills saw 69%, really just *experience + salary* points.
**Lesson:** a number with nothing behind it is worse than no number.

### Multi-user accounts
Google sign-in, invites, `user_id` on every table, encrypted per-person keys, shared job pool.
**Lesson:** adding users later means touching *every* query. The migration
[0005_accounts.sql](../drizzle/0005_accounts.sql) had to be hand-edited so existing data became
the owner's rather than being lost.

### Company careers sites instead of Adzuna
**Problem:** Adzuna said "posted 24 h ago" for jobs open 30+ days. **Fix:** read companies'
own careers sites for honest dates. **Lesson:** know your data's *source of truth*, and check
the dates.
