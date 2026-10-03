# How Job Hunt works

A guided tour of this project: what each part does, why it's built that way, and the ideas
behind it. Read it top to bottom once, then use it as a map. File links open the real code.

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
> [api-keys-card.tsx](../src/components/api-keys-card.tsx) (client) to show and edit.

---

## 3. Folder map

```
job-hunt-hq/
├─ src/
│  ├─ app/                  ← every URL is a folder here (the "App Router")
│  │  ├─ (app)/             ← signed-in pages; (app) groups them under one layout
│  │  │  ├─ page.tsx        ← "/"  Today
│  │  │  ├─ jobs/           ← "/jobs" list and "/jobs/[id]" job page
│  │  │  ├─ tracker/ resumes/ profile/ settings/ admin/ capture/
│  │  │  └─ layout.tsx      ← nav bar, sign-in check, re-scoring check
│  │  ├─ login/             ← the only page you can see signed out
│  │  ├─ api/               ← plain HTTP endpoints (sign-in, cron, fetch, export)
│  │  ├─ manifest.ts        ← makes the site installable as a phone app
│  │  └─ layout.tsx         ← <html>, fonts, theme
│  ├─ actions/              ← server actions: functions the UI calls like normal functions
│  ├─ components/           ← React components (UI)
│  ├─ lib/                  ← the brains, no UI
│  │  ├─ core/              ← pure logic: scoring, experience, skills, prompts
│  │  ├─ sources/           ← where jobs come from (one reader per site type)
│  │  ├─ db/                ← database connection + table definitions (schema.ts)
│  │  ├─ auth/              ← Google sign-in, sessions, encryption
│  │  ├─ notify/            ← phone push + Telegram
│  │  ├─ fetcher.ts         ← runs a fetch for a person
│  │  └─ scheduler.ts       ← decides who is due a fetch
│  └─ proxy.ts              ← first gate on every request (signed in?)
├─ drizzle/                 ← database migrations (numbered SQL files)
├─ public/sw.js             ← the service worker (notifications)
├─ .github/workflows/       ← the hourly GitHub alarm clock
├─ Dockerfile, render.yaml  ← how Render builds and runs the app
└─ .env                     ← your secrets (never committed)
```

> **Concept: separation of concerns.** `lib/core/` has *no* database or network code, only
> logic: "given this job text and this profile, what's the score?" Such code is easy to test
> and reuse. The same `analyzeJob` runs on the server during a fetch *and* in your browser when
> you paste a job on "Add a job".

---

## 4. Following one request

What happens when you open `/jobs` on your phone:

1. **[proxy.ts](../src/proxy.ts)** runs first. No `jh_session` cookie → redirect to `/login`.
   It only checks that the cookie *exists*; it's a cheap first gate.
2. **[(app)/layout.tsx](../src/app/(app)/layout.tsx)** calls `requireUser()`, which looks the
   session up in the database ([auth/index.ts](../src/lib/auth/index.ts)). A fake or deleted
   session → back to login. This is the real check.
3. **[jobs/page.tsx](../src/app/(app)/jobs/page.tsx)** reads the filters from the URL
   (`?fit=ready&sort=recent`) and asks [queries.ts](../src/lib/queries.ts) for *your* jobs.
   Every query includes `WHERE user_id = you`.
4. The server sends finished HTML. Your phone shows it. Buttons like **Save** call *server
   actions* in [actions/](../src/actions/), which check who you are again before changing
   anything.

> **Concept: never trust the client.** Anything from the browser can be faked. That's why every
> action and API route calls `requireUser()` itself, even though the page already did, and why
> every query is scoped to the signed-in user's id. We tested this: opening a friend's job or
> resume returns 404.

---

## 5. Where jobs come from (the fetch)

Three steps, in [fetcher.ts](../src/lib/fetcher.ts):

```
 1. Shared pool (once, for everyone)       2. Your feed                3. Your own sources
 ─────────────────────────────────        ──────────────────         ───────────────────
 94 company careers sites ──▶ raw_jobs ──▶ copy companies you  ──▶   Google Jobs (JSearch)
 (Amazon, Google, Workday,                 follow, score each        with YOUR key,
  Oracle, Greenhouse…)                     against YOUR profile      extra career pages
```

**Step 1, the shared pool.** Careers sites are checked *once* for everyone and stored in
`raw_jobs`. Fifteen people don't mean fifteen times the traffic to Amazon. Each kind of site has
a reader in [sources/companies/](../src/lib/sources/companies/):

- **Workday** (most big companies): a JSON endpoint the careers page itself uses, with an India
  filter. [workday.ts](../src/lib/sources/companies/workday.ts)
- **Amazon, Google**: their own formats. Google's job data is inside the page's HTML.
  [bigtech.ts](../src/lib/sources/companies/bigtech.ts)
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

All in [lib/core/](../src/lib/core/), pure functions:

- **[skills.ts](../src/lib/core/skills.ts)**: a dictionary of ~90 skills with the spellings
  JDs use ("k8s" → Kubernetes, "reactjs" → React), grouped into Frontend, Backend, DevOps, Data,
  Security and Other.
- **[experience.ts](../src/lib/core/experience.ts)**: finds "2-4 years", "0–2 yrs",
  "freshers welcome", "Senior …" and turns them into a range.
- **[classify.ts](../src/lib/core/classify.ts)**: works out the role type from the title, or
  from the description's skills if the title is vague.
- **[analyze.ts](../src/lib/core/analyze.ts)**: puts it together.

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
> stale. `SCORING_VERSION` in [jobs.ts](../src/lib/jobs.ts) is a number we bump; each person's
> feed is re-scored once, the next time they open the app.

---

## 7. Accounts and security

- **Sign-in** is Google OAuth (authorization code + PKCE) in
  [auth/google.ts](../src/lib/auth/google.ts). Google proves who you are; we never see a password.
- **Invite-only**: an admin adds emails on the People page, so only those can get in. Maximum 15.
- **Sessions**: a random token in an `httpOnly` cookie, which JavaScript can't read, so a
  malicious script can't steal it. The database stores only its **SHA-256 hash**, so a leaked
  database can't be used to sign in.
- **Your API keys** are encrypted with **AES-256-GCM** before they're stored
  ([auth/crypto.ts](../src/lib/auth/crypto.ts)). The key comes from `SESSION_SECRET`, which lives
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
                                                  → fetch → notify (every time, quiet at night)
                                              · morning digest due? → send
```

Why three? GitHub's scheduled runs are "best effort" and can be hours late. See the journal
entry below. **Settings → Recent fetches** shows when each alarm clock last arrived.

- **Answer first, work after** (`after()` in [cron route](../src/app/api/cron/fetch/route.ts)):
  GitHub bills by the minute it waits, so we reply in milliseconds and work in the background.
- **Up to one check early**: the schedule is checked every 10 minutes, so a fetch counts as due
  up to 10 minutes before its time (`EARLY_MS` in [fetcher.ts](../src/lib/fetcher.ts)). Every
  3 hours means 3 hours, not 3 hours plus however long until the next check.
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
  [push-card.tsx](../src/components/push-card.tsx) → [actions/push.ts](../src/actions/push.ts).
- **VAPID keys**: our server's own key pair that proves "this push really is from Job Hunt". Made
  automatically on first use and stored encrypted, so there was nothing for you to set up.
  [notify/push.ts](../src/lib/notify/push.ts)
- **Service worker** ([public/sw.js](../public/sw.js)): a small script the phone keeps even when
  the app is closed. It wakes for a push, shows the notification, and opens the right page on tap.
- **Why the Home Screen app?** Apple only allows web notifications for sites installed to the
  Home Screen. That needs a *web app manifest* ([manifest.ts](../src/app/manifest.ts)) and an
  icon, which is why the old bookmark didn't work and the new orange "JH" icon does.
- **Rules**: every automatic fetch → a notification, even "no new jobs", so you know it ran;
  quiet from 11 pm to 7 am (jobs worth a look are held for the morning). Your own "Fetch now" →
  always tells you it finished or failed, and only you.

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
> is a numbered SQL file in [drizzle/](../drizzle/) (`0000_init.sql` … `0006_last_seen.sql`).
> On start, the app applies any it hasn't run yet, so the live database always matches the code.

---

## 11. Learning journal

Newest first. Each entry: what changed, the problem behind it, and the lesson.

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
[fetch-button.tsx](../src/components/fetch-button.tsx), [api/fetch/route.ts](../src/app/api/fetch/route.ts)

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
Service worker, manifest, VAPID keys, quiet hours. See [§9](#9-phone-notifications-web-push).
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
