# Job Hunt, end to end

Two stories, step by step, in plain words:

- **Part A: how a fetch works.** From "an alarm clock rings" to "a notification on your phone".
- **Part B: how a code change goes live.** From "you edit a file" to "the live site runs it",
  including what a *build* actually is and how changes reach the database.

At the end there's a 60-second version for interviews.
For the deeper tour of each part, see [HOW-IT-WORKS.md](HOW-IT-WORKS.md).

---

## The cast (who is who)

| Name | What it physically is | Its job here |
|---|---|---|
| **GitHub** | A website that stores your code (the *repository*) | The single source of truth for the code. Also runs two robots (GitHub Actions): CI checks, and the hourly alarm clock. |
| **Render** | A company that rents you a computer in Singapore | Runs **one copy of our server program** (a Node.js process) 24/7, or rather, whenever it's awake. |
| **Neon** | A company that runs a PostgreSQL database for you, also in Singapore | Stores **all the data**: users, jobs, applications, settings. Lives separately from Render. |
| **cron-job.org** | A free website that calls a URL on a timer | A second alarm clock that keeps waking our server. |
| **Careers sites** | Amazon, Google, Workday, Greenhouse… | Where the jobs come from. |
| **Apple / Google push services** | Their servers that can reach your phone | Deliver our notifications. |
| **Your laptop** | Your machine | Where you write code and test (`npm run dev`). It talks to the **same Neon database** as the live site. |

The key idea: **code lives in one place (Render), data lives in another (Neon).**
Render can throw its server away and start a new one (every deploy does), and nothing is lost,
because nothing important is kept on Render's disk.

```
            code                         data
 GitHub ──────────▶ Render server ◀──────────────▶ Neon Postgres
 (stores it)        (runs it)       SQL over        (stores it)
                                    the internet
```

---

## Part A: the life of one fetch

### A0. Setting the scene: the server sleeps

Render's free plan **puts our server to sleep after ~15 minutes with no requests**. Asleep means
the program isn't running at all. The next request that arrives makes Render start it again
(takes 30–60 seconds: a "cold start").

So a timer *inside* the server isn't enough: a sleeping program can't notice the time. That's why
we have **alarm clocks outside** it.

### A1. Something wakes the server

Three things can start a fetch check. All of them end up calling the same function, `tick()` in
[scheduler.ts](../src/server/fetching/scheduler.ts):

| Alarm clock | How often | How it reaches us |
|---|---|---|
| **GitHub Actions** ([fetch.yml](../.github/workflows/fetch.yml)) | Every hour, at minute :07 | A GitHub machine runs `curl https://<our-app>/api/cron/fetch?from=github` with a secret header |
| **cron-job.org** | On the interval set on that site | Same URL, `?from=cronjob` |
| **The server's own timer** | Every 10 minutes, *while awake*, plus once 20 s after it starts | `setInterval` in `startScheduler()`, started from [instrumentation.ts](../src/instrumentation.ts) when the server boots |
| **You press "Fetch now"** | Whenever you like | The browser calls `POST /api/fetch` ([route](../src/app/api/fetch/route.ts)) |

Why so many? GitHub's schedule is "best effort" and can be hours late; cron-job.org fills the gaps.
Extra wake-ups are harmless (see A3).

### A2. The request passes the doors

For the alarm clocks (`/api/cron/fetch`, [route.ts](../src/app/api/cron/fetch/route.ts)):

1. **[proxy.ts](../src/proxy.ts)** runs first on every request. `/api/cron/` is on its "public"
   list, so it lets the request through without a sign-in cookie.
2. The route checks the header `Authorization: Bearer <CRON_SECRET>`. The secret is an
   environment variable on Render, also stored as a GitHub secret. Wrong or missing → `401
   Unauthorized`. (It compares with `timingSafeEqual`, so an attacker can't guess it letter by
   letter by measuring response times.)
3. It **answers `202 started` immediately**, and does the real work afterwards with Next.js's
   `after()`. GitHub bills by the minute it waits, so it shouldn't wait for us.

For "Fetch now": proxy.ts requires the session cookie, then the route looks the session up in
the database (`getSessionUser`) so it knows *which person* is asking. It also answers right away
with "started at …"; your phone then asks `GET /api/fetch` every few seconds "is it done yet?".

### A3. `tick()`: is anything due?

[scheduler.ts](../src/server/fetching/scheduler.ts)

1. **Write down who woke us** (in memory) so Settings can show "GitHub last arrived at …".
2. **Quiet check, no database**: after every pass we remember "nothing is due before 3:00".
   If it's earlier than that, return immediately. This matters because Neon's free plan counts
   the hours the database is awake; touching it every 10 minutes would keep it awake all month.
3. **One pass at a time**: if a pass is already running, the new wake-up just waits for it.
4. Otherwise, `doTick()` goes through **every user**:
   1. `ensureScored`: if scoring rules changed since this person's jobs were scored, re-score them.
   2. `unfinishedFetches`: if this person's "Fetch now" was cut off by a restart, tell them once.
   3. **Is their fetch due?** Each person picks "check every N hours". Fixed clock slots
      ([schedule.ts](../src/shared/core/schedule.ts)): every 3 h means 12, 3, 6, 9 o'clock India
      time. `isDue` = "was their last automatic fetch before the current slot started?"
      If yes → `runFetch(userId)`.
   4. Morning digest due (after 9 am, not sent today)? → send it on Telegram.
5. `cleanup()`: delete jobs older than 30 days.
6. Remember the next slot time, so checks before it are free (step 2).

### A4. `runFetch`: one person's fetch

[fetcher.ts](../src/server/fetching/fetcher.ts). Only one fetch per person at a time: a second
call for the same person joins the first one instead of starting another.
It also creates an `AbortController`, which is what the **Cancel** button triggers.

Then `doFetch` does three steps.

#### Step 1: refresh the shared pool (once for everyone)

There are ~94 company careers sites. If 15 people each fetched Amazon separately, that's 15× the
traffic for the same data. So careers sites are read **once for everyone** into a table called
`raw_jobs` (the *pool*).

1. `refreshPool` checks `fetch_runs` (a log table): when did the pool last refresh successfully?
   Recently (within your interval, or 20 min for "Fetch now") → skip, use what's there.
2. Otherwise run the **companies source** ([sources/companies/](../src/server/fetching/sources/companies/)).
   For each company *anyone* follows, call the right **reader** for its platform:
   Workday, Amazon, Google, Oracle, Eightfold, SmartRecruiters, Greenhouse, Lever, Ashby.
   Each reader makes HTTP requests to the same public JSON endpoints the company's own careers
   page uses, and turns the answer into a common shape (`RawJob`: title, company, location,
   url, description, posting date…).
3. Filters at the door: **India only, tech titles only, has a real posting date, posted in the
   last 30 days**.
4. Insert into `raw_jobs` in chunks of 100. Each row has a key `source:externalId`; `ON CONFLICT
   DO NOTHING` means a job that's already in the pool is silently skipped.
5. Log the run in `fetch_runs` (started, finished, how many, or the error).

Only one pool refresh runs at a time, even if three people's fetches start together.

#### Step 2: fill *your* feed from the pool

`fillFromPool(userId)`:

1. Read only what you could be missing: pool jobs **added since your last fill** (with 10 minutes
   of overlap, in case something landed mid-fill), **from companies you follow**, posted in the
   last 30 days. (Reading the whole pool each time used up Neon's monthly network allowance in 9
   days; this is the fix.)
2. Ask the database which of these you already have (by id), and keep only the new ones.
3. **Score each one for you** (`toNewJob` → `analyzeJob` in [analyze.ts](../src/shared/core/analyze.ts)):
   - find skills in the description ("k8s" → Kubernetes),
   - find required experience ("2–4 years"),
   - work out the role type (Frontend, Backend, Data…),
   - score = 55% skills you match + 25% experience fit + 10% salary + 10% is a tech role,
   - verdict: **fit / check / no**.
   The same job can be 82% for you and 40% for a friend: different profiles.
4. Insert into the `jobs` table with **your `user_id`**. A unique index on
   `(user_id, dedupe_key)` (company + title + city) stops the same job appearing twice from two
   sources.
5. Save `poolFilledAt = now`, so next time step 1 starts from here.

#### Step 3: your own sources

Sources that use *your* API keys, e.g. Google Jobs via JSearch with your RapidAPI key
(decrypted from the database just for this). Each one:

- skipped if not set up ("Add your key in Settings"),
- skipped if it already ran today and has a monthly quota (protects your 200 free requests),
- otherwise fetch → score → insert, same as step 2, logged in `fetch_runs`.

#### After the steps

1. Save `lastFetchAt` (and `lastAutoFetchAt` if automatic, which is what the schedule looks at).
2. **Telegram instant alert** if you've set it up and any new job is a strong fit.
3. **Phone notification** ([notify/push.ts](../src/server/notify/push.ts)) to your devices only:
   1. Load your saved push subscriptions (one per device: an address at Apple/Google + keys).
   2. Encrypt the message and sign it with our VAPID key (proves it's really from us).
   3. Send it to Apple's / Google's push service.
   4. They deliver it to your phone, where [sw.js](../public/sw.js) (the *service worker*, which
      runs even with the app closed) shows it.
4. If it was "Fetch now", save the result as `lastManualFetch`. Your phone's "is it done yet?"
   check sees it and shows "12 new jobs".

### A5. You open the app

1. Phone → Render: `GET /jobs`. proxy.ts sees your cookie.
2. The layout checks the session in Neon (the real security check).
3. [jobs/page.tsx](../src/app/(app)/jobs/page.tsx) asks Neon for *your* jobs
   (`WHERE user_id = you`, filters from the URL).
4. The server builds the HTML and sends it. Your phone shows the new jobs.

### A6. The server goes back to sleep

No requests for ~15 minutes → Render stops the server. Neon pauses the database after 5 quiet
minutes. Next alarm → everything starts again from A1.

### The whole fetch on one screen

```
 GitHub / cron-job.org / timer / "Fetch now"
        │
        ▼
 /api/cron/fetch  ── secret ok? ── answer 202 ── then in the background:
        │
        ▼
 tick(): anything due? (no → stop, database untouched)
        │ yes
        ▼
 for each person whose slot has come:  runFetch(person)
        │
        ├─ 1. Pool:  careers sites ──▶ raw_jobs        (once for everyone, if stale)
        ├─ 2. Feed:  new pool jobs from followed companies ──score──▶ jobs (your user_id)
        ├─ 3. Own:   JSearch with your key ──score──▶ jobs
        └─ notify:   Telegram + Web Push ──▶ Apple/Google ──▶ your phone
```

---

## Part B: from a code change to the live site

### B0. First: what is a "build"?

The code you write isn't the code the server runs.

- You write **TypeScript** (`.ts`, `.tsx`): JavaScript with types. Node.js and browsers can't run
  TypeScript directly.
- You write **JSX** (`<Button>…</Button>`) in React components. Browsers don't understand that
  either.
- You write **Tailwind classes** (`px-4 text-muted`). Those have to become real CSS.
- Your code is split into hundreds of files and imports packages from `node_modules`.

**`npm run build` (which runs `next build`) turns all of that into something a server can run
fast:**

1. **Check**: compile TypeScript; a type error stops the build.
2. **Translate**: TypeScript + JSX → plain JavaScript.
3. **Bundle**: combine many files into a few, keep only the code actually used, minify (strip
   spaces, shorten names). Separate bundles for the **server** and for the **browser**.
4. **CSS**: generate only the Tailwind classes you used.
5. **Pre-render** pages that don't depend on who's looking.
6. **Package**: with `output: "standalone"` ([next.config.ts](../next.config.ts)) it also writes a
   tiny `server.js` plus only the `node_modules` files the server needs.

Everything lands in the **`.next/` folder**. That folder is "the build". Running the app
(`node server.js` or `npm start`) just runs that output; it doesn't look at your source files.

> Analogy: your source code is the recipe; the build is the cooked meal packed in a lunchbox.
> The server only ever eats from the lunchbox.

`npm run dev` is different: it skips the full build and translates files on demand as you open
pages, and re-does it the moment you save (*hot reload*). Fast for working, slow and unoptimised
for real users. That's why production always uses a real build.

### B1. You change code on your laptop

1. Edit files in `src/`.
2. `npm run dev` → the app runs at `http://localhost:3000`. Your `.env` has the **same Neon
   `DATABASE_URL`** as the live site, and `SCHEDULER=off` so your laptop doesn't run fetches
   alongside the live server.
3. Optional checks: `npm run lint`, `npm run typecheck`, `npm run build`.

> ⚠️ Because your laptop and the live site share one database, anything you do locally
> (add a job, change settings, **apply a migration**) happens to the real data.

### B2. You commit and push

- `git commit` = take a snapshot of your changes, on your laptop only.
- `git push` = upload that snapshot to GitHub (`main` branch).

Nothing on the live site has changed yet. Pushing sets off two independent things (B4). One of
them uses Docker, so first, what that is.

### B3. First, what Docker is

**The problem:** the app runs on your laptop because you installed Node.js, ran `npm install`
and so on. Render's computer is a different, empty Linux machine. How do you get exactly the
right setup onto it, every time, with nothing missing?

**Docker's answer:** write the setup steps down once, in a file. Any computer can follow them and
end up with exactly the same result.

| Word | What it is | Cooking comparison |
|---|---|---|
| **Dockerfile** | A text file of setup steps ([Dockerfile](../Dockerfile)) | The recipe |
| **Image** | The result of following those steps: a frozen, packed copy of Linux + Node.js + your built app | A meal cooked and sealed in a box |
| **Container** | That image actually running | The box opened and the meal being eaten |

Always in this order: **Dockerfile → (docker build) → image → (docker run) → container**.

### B4. The timeline after `git push`

**⏱ 0:00. Push.** Your code arrives on GitHub, which notifies **two separate services at the same
moment**. They don't talk to each other, and both start from scratch:

```
                    git push
                       │
           ┌───────────┴────────────┐
           ▼                        ▼
   Track 1: GitHub CI         Track 2: Render
   "Is the code OK?"          "Put it live"
   (a test; its result        (this is the real
    is thrown away)            deploy)
```

#### Track 1: GitHub CI (on the side, only a test)

[ci.yml](../.github/workflows/ci.yml): GitHub borrows a temporary Linux machine, downloads the code,
runs `npm ci → lint → typecheck → build`, shows ✅ or ✗, and **deletes the machine**. Nothing it
built goes anywhere. **Yes, the app is built twice: once by CI as a test, once by Render for
real.** That's normal. (Render doesn't wait for CI; telling it to is a possible future step.)

#### Track 2: Render (the real deploy)

[render.yaml](../render.yaml) has `autoDeploy: true`, so Render reacts to every new commit on `main`.

**⏱ 0:01. Render downloads the code.**

**⏱ 0:01 to about 0:05. Render follows the Dockerfile**, setting up a fresh empty computer
three times, once per stage:

**Stage 1, "deps" (install packages)**
```dockerfile
FROM node:24-alpine                       # tiny Linux that already has Node.js 24
COPY package.json package-lock.json ./    # copy in only the shopping list
RUN npm ci                                # download the exact packages → node_modules/
```

**Stage 2, "build" (make the build)**
```dockerfile
FROM node:24-alpine                                   # a fresh empty computer again
COPY --from=deps /app/node_modules ./node_modules     # take the packages from stage 1
COPY . .                                              # copy in all the source code
RUN npm run build                                     # next build → .next/ (the "build", B0)
```
`COPY . .` skips everything in [.dockerignore](../.dockerignore) (`.env`, `data/`, `.git`, `docs`),
so **your secrets and local database never get into the image**.

**Stage 3, "run" (pack only what's needed)**
```dockerfile
FROM node:24-alpine                                     # fresh empty computer, third time
COPY --from=build .../.next/standalone ./               # server.js + only the packages it needs
COPY --from=build .../.next/static ./.next/static       # browser JS/CSS
COPY --from=build .../public ./public                   # icons, sw.js
COPY --from=build .../drizzle ./drizzle                 # migration SQL files (B5)
USER app                                                # don't run as admin (root)
CMD ["node", "server.js"]                               # "when this box is opened, run this"
```

**Only stage 3 becomes the image**; stages 1 and 2 are thrown away. Why three stages? Stages 1–2
are the **kitchen** (source, TypeScript, build tools, hundreds of MB of packages). Stage 3 is the
**lunchbox** (only the cooked output). You ship the lunchbox, not the kitchen: smaller, starts
faster, no source code inside.

✅ **About 0:05: one image**, a sealed box sitting on Render. Nothing is running yet.

**⏱ about 0:05. Render starts a container from the image.**
- It opens the box and runs the `CMD` line: `node server.js`.
- At that moment it **hands in your secrets** from the Render dashboard as environment variables
  (`DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`…). They were never in the box; the box is
  generic and the secrets are given only when it runs. The code reads them as
  `process.env.DATABASE_URL`.
- The server starts and runs `register()` in [instrumentation.ts](../src/instrumentation.ts), which
  starts the 10-minute scheduler (`SCHEDULER=on`).

**⏱ about 0:06. Health check.** Render visits `/login` on the new container (`healthCheckPath`).
A page comes back → the new version works.

**⏱ about 0:06. The switch.**
```
 before:  users ──▶ OLD container (yesterday's code)
 switch:  users ──▶ NEW container (your new code)
 after:   OLD container stopped and deleted
```
The old one keeps serving until the new one passes the check, so visitors never see the site down.
If the check fails, the old one stays and the deploy shows as failed. A "Fetch now" running in
the old container at that moment is cut off; `unfinishedFetches` notices on the next wake-up and
tells that person.

**⏱ later. The first database use** in the new container applies any new migration files to Neon
(B5). That's why `drizzle/` was copied into the box.

### B5. How changes reach the database (migrations)

Code and data change differently:

- **Code** is replaced completely on every deploy (new box, old box thrown away).
- **Data** in Neon is never replaced. It must be *changed in place*, carefully, without losing
  anything.

So a change to the database's **shape** (a new table, a new column) is written as a
**migration**: a numbered SQL file that says how to go from the old shape to the new one.

The steps:

1. You change the table definitions in [schema.ts](../src/server/db/schema.ts) (TypeScript).
2. `npm run db:generate` (drizzle-kit) compares schema.ts with the last migration and writes the
   difference as a new file, e.g. `drizzle/0007_something.sql`:
   ```sql
   ALTER TABLE "jobs" ADD COLUMN "remote_policy" text;
   ```
3. You commit and push that file along with the code.
4. The Dockerfile copies `drizzle/` into the image.
5. The first time the running app needs the database, `getDb()` in
   [db/index.ts](../src/server/db/index.ts) runs Drizzle's **migrator**:
   1. It looks in a bookkeeping table in Neon (`drizzle.__drizzle_migrations`) for the list of
      migrations already applied.
   2. It runs any files not in that list, in number order, and records them.
   3. Already-applied ones are skipped, so this is safe to do on every start.

Ordinary **data** changes (a new job, you saving a job, changing a setting) don't need any of
this. They're just the running app doing `INSERT` / `UPDATE` in Neon as people use it.

> ⚠️ Since the laptop shares Neon: running `npm run dev` with a new migration **applies it to the
> live database right away**, before you've pushed. The live (old) code then runs against the new
> shape until the deploy finishes. Adding a column is harmless for old code; *removing* or
> *renaming* one would break it. Rule: add first, remove later, in a separate deploy.

### B6. And the rest of the chain

- **GitHub Actions secrets** (`APP_URL`, `CRON_SECRET`) are only for the hourly alarm clock.
- **Phones** pick up the new version the next time they load a page. `sw.js` is served with
  "never cache" so notification fixes reach phones straight away.

### Part B on one screen

```
 laptop                GitHub                         Render                          Neon
 ──────                ──────                         ──────                          ────
 edit code
 npm run dev ─────────────────────────────────────────────────────────── same DB ────▶ (real data!)
 git commit
 git push ───────────▶ main updated
                        ├─▶ CI: lint, typecheck, build  (✅ / ✗, informational)
                        └─▶ webhook ─────────────────▶ download code
                                                        docker build:
                                                          deps:  npm ci
                                                          build: next build → .next/
                                                          run:   copy only the output
                                                        start container + env vars
                                                        health check /login
                                                        switch traffic, stop old one
                                                        first DB use: run new
                                                        migrations ──────────────────▶ ALTER TABLE…
```

---

## The 60-second interview version

> "Job Hunt is a Next.js app that collects software jobs in India from ~94 companies' own
> careers sites, scores each job against each user's profile, and notifies their phone.
>
> It runs as a Docker container on Render; the data is in PostgreSQL on Neon, accessed with
> Drizzle ORM. Render's free tier sleeps, so external schedulers (GitHub Actions hourly, plus
> cron-job.org) call a secret-protected endpoint that wakes it. The endpoint replies 202 and
> works in the background.
>
> Fetching has two levels: a **shared pool**, where each careers site is read once for all
> users, and a **per-user feed**, where only the new pool jobs from companies that user follows
> are copied in and scored by skills, experience, salary and role type. Duplicates are blocked by
> a unique index. Then it sends Web Push notifications signed with VAPID keys.
>
> I optimised it for free-tier limits: the scheduler skips the database when nothing is due so
> Neon can sleep, and the feed reads only jobs added since the last fill. That cut network use
> after the full-pool read burned the monthly allowance in 9 days.
>
> Deploys: push to main → GitHub CI runs lint, typecheck and build; Render builds a multi-stage
> Docker image, injects secrets as environment variables, health-checks it and swaps it in.
> Schema changes are versioned Drizzle migrations applied automatically on startup."

Questions you might get, and the short answer:

- **Why a shared pool?** Fewer requests to the companies (no rate limits, no blocking), faster
  fetches, and each person still gets their own scores.
- **What if two alarms arrive together?** Only one pass runs; per-person fetches are de-duplicated
  in memory; the schedule is slot-based, so a person is fetched once per slot.
- **How is it secured?** Google sign-in, invite-only; session token in an httpOnly cookie, stored
  hashed; API keys encrypted with AES-256-GCM; every query filtered by `user_id`; cron endpoint
  protected by a secret.
- **Why Docker?** The same image runs identically anywhere; multi-stage keeps it small and free of
  source code and secrets.
- **What's a migration?** A versioned, ordered SQL change to the database's shape, applied once
  and tracked, so code and database stay in step.
