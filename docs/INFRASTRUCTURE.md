# Infrastructure

Everything runs on Cloudflare. This file records what we use, the free-tier limits, and what those limits mean for the code.

## Overview

```
Android phone (installed PWA)
        │  HTTPS
        ▼
Cloudflare Worker  "med-vault"
 ├─ Static assets (Vite build of the React app, SPA fallback)
 └─ /api/*  Hono API
       ├─ D1  "med-vault"        (SQLite: all records, sessions)
       └─ R2  "med-vault-files"  (photos and PDFs)
```

One Worker serves both the app and the API, so there is one deploy, one domain and no CORS.

## Services

| Service | Used for | Binding | Free tier (as of Oct 2026, verify on the Cloudflare pricing pages) | Paid needed? |
|---|---|---|---|---|
| **Workers** | API + serving the app | n/a | 100,000 requests/day, 10 ms CPU per request | No |
| **Workers Static Assets** | React build (HTML/JS/CSS/icons) | `assets` | Asset requests are free and unlimited | No |
| **D1** | Database | `DB` | 5 GB storage, 5M rows read/day, 100k rows written/day | No |
| **R2** | Photos and PDFs | `FILES` | 10 GB storage, 1M writes/month, 10M reads/month, no egress fees | No, but **R2 must be enabled with a payment method on the account**. You are not charged while under the free limits. |
| **Worker secrets** | `APP_PASSWORD` | env | Free | No |
| **workers.dev subdomain** | URL `med-vault.<account>.workers.dev` | n/a | Free | No. A custom domain is optional (domain cost only). |
| **Cron Triggers** (Phase 3) | Reminder scheduling | n/a | Free (limited number per account) | No |
| **Workers AI** (Phase 2) | Reading prescriptions/medicine photos | `AI` | Daily free allowance (10,000 Neurons/day) | No, unless usage grows |
| **Claude API** (Phase 2 fallback) | Better handwriting recognition if Workers AI is not accurate enough | secret | None | **Yes**, pay per use, not Cloudflare. Only if needed. |

### Things we chose NOT to use

| Option | Why not |
|---|---|
| Cloudflare Access / Zero Trust for login | Heavier setup for a single family password, and the account usually needs a payment method on file. A Worker secret + D1 sessions is enough. Can switch later. |
| Cloudflare Images | Costs money beyond the free tier. Images are compressed in the browser before upload instead. |
| Pages | Workers with Static Assets is Cloudflare's current recommended path and lets one Worker serve app + API. |
| KV for sessions | D1 is already there and gives instant logout. KV is eventually consistent. |

## Constraints that shape the code

1. **10 ms CPU per request (free plan).** No image processing, PDF parsing or heavy crypto in the Worker. Images are resized/compressed in the browser. Login compares SHA-256 digests of the password (cheap) instead of running a slow hash in the Worker. File downloads stream from R2 without buffering.
2. **D1 is SQLite.** Use `?` bound parameters, `db.batch()` for multi-statement writes (it runs as one transaction), and indexes on `member_id` + date columns. Foreign keys are enforced, so deletes cascade.
3. **D1 write budget (100k rows/day).** Far above family use. Don't write on every read (e.g. no "last seen" updates per request).
4. **R2 is not cleaned up by D1 cascades.** Any route that deletes a member, prescription, report or medication must also delete its R2 objects.
5. **Request body limit 100 MB.** Uploads are capped at 15 MB per file in the API anyway.
6. **PWA needs HTTPS.** Provided by workers.dev. Local dev runs on `localhost`, which browsers treat as secure.

## Environments

| Env | How | Data |
|---|---|---|
| Local | `npm run dev` (Vite + Cloudflare plugin runs the Worker in workerd, with local D1 and R2 in `.wrangler/state`) | Local only |
| Production | `npm run deploy` | Cloudflare D1/R2 |

## CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:

| Trigger | Jobs |
|---|---|
| Pull request | `check`: `npm ci`, typecheck, build |
| Push to `main` (or manual run) | `check`, then `deploy`: create D1/R2 if missing, inject the D1 id, apply migrations, build, `wrangler deploy`, set `APP_PASSWORD` |

GitHub repository secrets:

| Secret | Status | Purpose |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Set | Which Cloudflare account to deploy to |
| `CLOUDFLARE_API_TOKEN` | Set | Deploy permission |
| `APP_PASSWORD` | **To add** | The family login password, pushed to the Worker as a secret on each deploy |

The API token needs these **Account** permissions: *Workers Scripts: Edit*, *D1: Edit*, *Workers R2 Storage: Edit* (plus *Account Settings: Read*, which the "Edit Cloudflare Workers" template includes).

**Before the first deploy:** enable R2 once in the Cloudflare dashboard (R2 → Get started). Everything else is created by the workflow.

## Manual setup (without CI)

```bash
npx wrangler login
npx wrangler d1 create med-vault           # copy database_id into wrangler.jsonc
npx wrangler r2 bucket create med-vault-files
npm run db:migrate:remote
npx wrangler secret put APP_PASSWORD       # the family password
npm run deploy
```

Local: copy `.dev.vars.example` to `.dev.vars`, set `APP_PASSWORD`, then `npm run db:migrate:local` and `npm run dev`.

## Backups

D1 has Time Travel (point-in-time restore for the last 30 days on paid, 7 days on free). For an extra copy: `npx wrangler d1 export med-vault --remote --output backup.sql`. R2 objects can be copied with `rclone` or `wrangler r2 object get`.
