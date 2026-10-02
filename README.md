# Job Hunt HQ

A private, single-owner job search website. It finds fresh jobs in India, matches them to you, helps you tailor your resume with Claude, and tracks every application.

- **Jobs:** new roles from the last 24 hours, 2 days, 7 days or 30 days, grouped into **Full Stack · Frontend · Backend · DevOps · SDE**. Each job is filtered by your salary floor (default ₹10 LPA) and your experience, then scored against your skills.
- **Resume & Claude:** open a job or paste any job description. The site picks the right resume (a DevOps job gets your DevOps resume), builds a ready-made prompt, and **opens Claude** so you can chat and refine. Paste the final version back to keep it with the job and print it as a PDF.
- **Tracker:** a drag-and-drop board (Saved → Applied → Assessment → Interview → Offer / Rejected), with notes, a timeline and automatic follow-up dates.
- **Alerts:** an optional Telegram bot sends a 9 AM digest and instant alerts for strong matches.
- **Yours only:** runs on your laptop or your own free server. A password lock, no search-engine indexing, and one-click export of all your data.

Everything runs on free tiers today, and each piece can be swapped for a paid one later without rewriting anything (see [docs/DEPLOY.md](docs/DEPLOY.md#when-you-want-to-scale-or-pay-for-more)).

> **Keep it personal:** use only personal accounts (email, GitHub, API keys, cloud) for this project.

---

## Run it on your laptop

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. There's nothing else to install: the built-in database is created in `./data` on first run.

Set `ADMIN_EMAIL` (your Gmail) and `SESSION_SECRET` in `.env` first. Until Google sign-in is set up, the sign-in page offers **Continue as admin (this computer only)**, which works only on localhost in development.

Optional one-time privacy setting, which stops Next.js sending anonymous usage stats:

```bash
npx next telemetry disable
```

### First steps in the app

1. **Profile:** add your skills (Frontend / Backend / DevOps / Other) and paste your full resume as the *master resume*.
2. **Profile → Base resumes:** for each role type, press **Copy prompt & open Claude**, chat until you're happy, then paste the result back and save. Do this once per role type.
3. **Jobs → Fetch now.** Company career pages work without any key. Add free keys (below) for many more jobs.
4. On any job, press **Tailor resume**. Choose what you want (tailor, check fit, interview prep, cover letter), then **Copy prompt & open Claude** and press `Ctrl+V` in Claude.

## Sign-in with Google (invite only)

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) with your personal Google account. Create a project if asked.
2. **OAuth consent screen:** choose *External*, fill in the app name and your email. You can leave it in *Testing* and add each invited Gmail as a test user, or publish it (only the basic `email profile` scopes are used, so no review is needed).
3. **Create credentials → OAuth client ID → Web application.** Under *Authorised redirect URIs* add:
   - `http://localhost:3000/api/auth/google/callback` (your laptop)
   - `https://<your-domain>/api/auth/google/callback` (once it's online; also set `APP_URL=https://<your-domain>`)
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and your Gmail as `ADMIN_EMAIL`. Restart.
5. Sign in. Your first sign-in as admin takes over all existing data. Invite others from **People** (sidebar); only invited Gmail addresses get in, up to `MAX_USERS` (15).

Each person's jobs, verdicts, profile, resumes, tracker and keys are private to them. Removing someone on **People** signs them out everywhere at once (and can delete their data).

## API keys (each person adds their own)

In **Settings → Your API keys**. Stored encrypted; the site never uses the owner's keys for anyone else.

| What | Where (personal account) |
|---|---|
| Google Jobs via JSearch: LinkedIn, Naukri and Indeed postings | [JSearch on RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch), subscribe to the Basic (free) plan, copy `X-RapidAPI-Key` |
| Telegram alerts (optional) | In Telegram: @BotFather → `/newbot`. Message your bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat id |

**Company careers sites** (94 companies: Google, Amazon, Microsoft, JPMorgan, Workday-based banks and tech firms, Greenhouse/Lever/Ashby boards) need no key. They're fetched once for everyone into a shared pool, then scored for each person. Choose which to follow in **Settings → Companies**.

**LinkedIn & Naukri:** this app never logs in to or scrapes those sites, because that breaks their terms and can get your account restricted. You still get their postings through Google Jobs (JSearch), and you can paste any job you find there into **Resume & Claude → Save to my tracker**.

## How the “Open Claude” button works

The prompt (job + your resume + instructions) is **copied to your clipboard**, and Claude opens in a new tab in your own account, so you can keep chatting and editing. The prompt is never put in the URL, so it doesn't end up in browser history or server logs.

Tip: in Claude, create a **Project** called “Job Hunt”, add your resume as project knowledge, and paste the project's link into **Profile → Where “Open Claude” goes**.

The prompts tell Claude to use **only** what's in your resume and to ask before adding any skill. Interviewers will ask about everything on your resume.

## Put it online

See **[docs/DEPLOY.md](docs/DEPLOY.md)**. It covers a free Oracle Cloud server, a free domain, automatic HTTPS and daily backups. Before the site is reachable from the internet, set up Google sign-in (above), `SESSION_SECRET` and `APP_URL`.

## Project layout

```
src/
  app/(app)/        Pages: Today, Jobs, Tracker, Resume & Claude, Profile, Settings
  app/api/          /api/cron/fetch (external scheduler), /api/export (download your data)
  actions/          Server actions (what the buttons do)
  components/       UI
  lib/core/         Pure logic: categories, salary (LPA), experience, skills, scoring, prompts
  lib/sources/      Job sources: adzuna, jsearch, careers (greenhouse / lever / ashby)
  lib/db/           Database schema (Drizzle ORM). PGlite locally, PostgreSQL in production
  lib/fetcher.ts    Fetch → analyse → store → alerts
  lib/scheduler.ts  Runs the fetcher every few hours inside the server
  proxy.ts          Password lock
drizzle/            Database migrations (applied automatically on start)
```

Add a new job source by implementing `JobSource` in `src/lib/sources/` and listing it in `SOURCES`.

After changing `src/lib/db/schema.ts`, run `npm run db:generate` to create a migration.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

The same checks run on GitHub Actions for every push (`.github/workflows/ci.yml`).
