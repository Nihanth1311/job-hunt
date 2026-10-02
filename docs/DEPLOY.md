# Putting Job Hunt online for free

This puts the site on **your own** free server so it keeps fetching jobs and sending alerts while your laptop is off.

> Use **personal accounts only** (personal email, personal GitHub, personal card for verification). Nothing in this setup should touch a work account, work laptop or work network.

Cost: ₹0/month on Oracle Cloud's Always Free tier, plus an optional domain. A free DuckDNS subdomain works fine.

---

## 1. Put the code in your private GitHub repo

On your laptop, in this project folder:

```bash
git init
git config user.name "Your Name"
git config user.email "your-personal-email@example.com"
git add .
git commit -m "Job Hunt HQ"
git branch -M main
```

(The two `git config` lines set your **personal** identity for this project only.)

Create an **empty private** repository on github.com (your personal account), then:

```bash
git remote add origin https://<your-username>@github.com/<your-username>/job-hunt.git
git push -u origin main
```

`.gitignore` already keeps out `.env` (your keys) and `data/` (your local database).

## 2. Create a free server (Oracle Cloud Always Free)

1. Sign up at **cloud.oracle.com** with your personal email. A debit or credit card is needed for identity verification only; Always Free resources are not charged.
2. Choose a home region close to you, e.g. **India West (Mumbai)** or **India South (Hyderabad)**. If free machines are out of stock there, try again later.
3. **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere (VM.Standard.A1.Flex)**, 1–2 OCPU, 6–12 GB RAM (all within Always Free)
   - Add your SSH public key
4. In the instance's **Virtual Cloud Network → Security List**, add ingress rules for TCP **80** and **443** from `0.0.0.0/0`.
5. SSH in: `ssh ubuntu@<server-ip>`

> Oracle may reclaim Always Free machines that stay idle for a long time. This app does a little work every few hours, which usually counts as activity. Upgrading the account to "Pay As You Go" removes the risk and still costs ₹0 as long as you stay within the free limits.

## 3. Free domain (DuckDNS)

1. Go to **duckdns.org** and sign in with your personal GitHub or Google account.
2. Create a subdomain, e.g. `myjobs` → `myjobs.duckdns.org`, and set it to your server's IP.

## 4. Install Docker and start the site

On the server:

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Ubuntu's own firewall also needs the ports open
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Your code. It's a private repo: when asked for a password, paste a GitHub personal access token
# (GitHub -> Settings -> Developer settings -> Fine-grained tokens, repo "job-hunt", Contents: Read-only).
git clone https://<your-username>@github.com/<your-username>/job-hunt.git
cd job-hunt
cp .env.example .env
nano .env
```

In `.env`, set at least:

| Variable | Value |
|---|---|
| `ADMIN_EMAIL` | Your Gmail (you invite everyone else from the People page) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From Google Cloud Console; add `https://myjobs.duckdns.org/api/auth/google/callback` as a redirect URI (see README) |
| `SESSION_SECRET` | At least 32 random characters. It also encrypts everyone's saved keys, so never change it later |
| `POSTGRES_PASSWORD` | Letters and numbers only |
| `DOMAIN` | `myjobs.duckdns.org` |
| `APP_URL` | `https://myjobs.duckdns.org` |

API keys (Google Jobs, Telegram) aren't set here: each person adds their own in Settings after signing in. Then:

```bash
docker compose up -d --build
```

Open `https://myjobs.duckdns.org`. Caddy gets the HTTPS certificate automatically within a minute.

## 5. Backups (your data, your copy)

```bash
mkdir -p ~/backups
crontab -e
# add this line: daily backup at 3 AM, keep 14 days
0 3 * * * cd ~/job-hunt && docker compose exec -T db pg_dump -U jobhunt jobhunt | gzip > ~/backups/jobhunt-$(date +\%F).sql.gz && find ~/backups -mtime +14 -delete
```

You can also download everything any time from **Settings → Export all data**.

## 6. Updating

```bash
cd ~/job-hunt && git pull && docker compose up -d --build
```

---

## Google sign-in on your domain

In Google Cloud Console → **Credentials → your OAuth client**, add:
- Authorised JavaScript origin: `https://myjobs.duckdns.org`
- Authorised redirect URI: `https://myjobs.duckdns.org/api/auth/google/callback`

and make sure the server's `.env` has `APP_URL=https://myjobs.duckdns.org`. Keep the localhost entries too, for your laptop.

## Moving your laptop data to the server

1. On your laptop: **Settings → Your account → Export my data**.
2. On the server, sign in with Google as the admin, then **Settings → Your account → Restore from a backup** and pick that file.

Your profile, master resume, base and tailored resumes, tracker and saved jobs come across. New jobs fill in from the company sites on their own.

## When you want to scale or pay for more

Nothing needs rewriting:

| Need | Change |
|---|---|
| Managed database with automatic backups | Point `DATABASE_URL` at Neon, Supabase, RDS or similar |
| More job searches | Upgrade the JSearch plan and raise “Google Jobs searches per day” in Settings |
| Serverless hosting (Vercel) | Use a hosted Postgres, set `SCHEDULER=off` and `CRON_SECRET`, and call `/api/cron/fetch` from a cron (e.g. GitHub Actions) |
| Automatic AI tailoring | Add an AI provider behind the same prompts (they're in `src/lib/core/prompts.ts`) |
| Bigger server | Raise the Oracle shape, or move the same `docker compose` setup to any VPS |
