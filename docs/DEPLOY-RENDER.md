# Putting Job Hunt online with Render + Neon (free, no card)

- **Render** runs the app from your GitHub repo (free web service).
- **Neon** is the PostgreSQL database (free).
- **GitHub Actions** wakes the app every 3 hours to fetch jobs (`.github/workflows/fetch.yml`), because Render's free server sleeps after 15 minutes without visitors. The first visit after a quiet spell takes 30-60 seconds.

Use personal accounts only.

## 1. Database (Neon)

1. Sign up at [neon.tech](https://neon.tech) (e.g. "Continue with GitHub", personal account).
2. Create a project: name `job-hunt`, Postgres 17, region **AWS Asia Pacific (Singapore)**.
3. **Connect** -> copy the connection string with **Connection pooling turned off** (the host has no `-pooler`). It looks like `postgresql://user:password@ep-....ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

## 2. App (Render)

1. Sign up at [render.com](https://render.com) with your personal GitHub and allow access to the `job-hunt` repo.
2. **New -> Blueprint** -> pick `job-hunt`. Render reads `render.yaml` and asks for:
   - `DATABASE_URL`: the Neon string from step 1
   - `ADMIN_EMAIL`: your Gmail
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: from Google Cloud Console
   - `APP_URL`: leave as `https://example.com` for now; you'll fix it in step 4
3. **Apply**. The first build takes ~5-10 minutes. Your address appears at the top of the service page, e.g. `https://job-hunt-ab12.onrender.com`.
4. In the service -> **Environment**, set `APP_URL` to that address (no trailing slash) and save (it redeploys).

## 3. Google sign-in for the new address

Google Cloud Console -> Credentials -> your OAuth client:
- Authorised JavaScript origins: add `https://job-hunt-ab12.onrender.com`
- Authorised redirect URIs: add `https://job-hunt-ab12.onrender.com/api/auth/google/callback`

Keep the localhost entries for your laptop.

## 4. Scheduled fetching (GitHub Actions)

GitHub -> your `job-hunt` repo -> **Settings -> Secrets and variables -> Actions -> New repository secret**:
- `APP_URL`: the Render address
- `CRON_SECRET`: copy it from Render -> Environment (Render generated it)

Then **Actions -> Fetch jobs -> Run workflow** to fill the job pool right away (~5 minutes the first time).

## 5. Sign in and bring your data

1. Open the Render address and **Continue with Google** as the admin.
2. On your laptop: **Settings -> Your account -> Export my data**.
3. On the live site: **Settings -> Your account -> Restore from a backup** and pick that file.
4. **Settings -> Your API keys**: add your Google Jobs (JSearch) key.
5. **Admin**: invite your friends (and add them as test users in Google Cloud, or publish the app).

## Updating

Push to `main`; Render redeploys automatically.

## Limits worth knowing

- Neon free: 0.5 GB of storage. Each person's feed keeps ~30 days of jobs; 15 active people fit comfortably.
- GitHub Actions free: 2,000 minutes a month for private repos; the fetch uses roughly 5-15 minutes a day.
- Render free: 750 hours a month (enough for one always-available service); it sleeps when idle.
