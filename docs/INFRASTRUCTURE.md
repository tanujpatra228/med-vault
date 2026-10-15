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
       ├─ D1  "med-vault"        (SQLite: vaults, devices, all records)
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
| **workers.dev subdomain** | URL `med-vault.<account>.workers.dev` | n/a | Free | No. A custom domain is optional (domain cost only). |
| **Cron Triggers** | Reminders, every 5 minutes (288 runs/day, counted as requests) | `triggers.crons` | Free (limited number per account), 10 ms CPU per run | No. Capped at 4 pushes per run to fit 10 ms; see [REMINDERS.md](./REMINDERS.md) |
| **Workers AI** | Reading prescription, medicine and report photos (`@cf/meta/llama-4-scout-17b-16e-instruct`, fallback `@cf/mistralai/mistral-small-3.1-24b-instruct`) | `AI` | 10,000 Neurons/day; a prescription scan measured **78.68 Neurons** (see below) | No, unless usage grows |
| **Claude API** (future upgrade) | Better handwriting recognition if Workers AI is not accurate enough | secret | None | **Yes**, pay per use, not Cloudflare. Only if needed. |

### Things we chose NOT to use

| Option | Why not |
|---|---|
| Cloudflare Access / Zero Trust for login | Built for a known team, not for strangers creating their own vaults. Needs identity providers and per-user setup. |
| Email/password accounts | Explicitly not wanted: no signup. |
| Cloudflare Images | Costs money beyond the free tier. Images are compressed in the browser before upload instead. |
| Pages | Workers with Static Assets is Cloudflare's current recommended path and lets one Worker serve app + API. |
| KV for device keys | D1 is already there and gives instant device removal. KV is eventually consistent. |

## Multi-vault capacity and abuse protection

Anyone with the URL can create a vault, so one deployment is shared by every family using it.

| Protection | Value | Where |
|---|---|---|
| New vaults per IP | 5 per day | `worker/auth.ts` |
| Wrong link codes / recovery keys per IP | 10 per 15 minutes | `worker/auth.ts` |
| Storage per vault | 2 GB | `worker/files.ts` |
| Link code lifetime | 10 minutes, single use | `worker/auth.ts` |
| AI per vault | 1,000 neurons per UTC day (~10 scans) | `worker/aiBudget.ts` |
| AI for all vaults together | 9,000 neurons per UTC day (of the free 10,000) | `worker/aiBudget.ts` |

### Workers AI usage (measured)

| Date | Call | Model | Neurons |
|---|---|---|---|
| 2026-10-13 | Prescription scan (real photo, production) | Llama 4 Scout 17B 16E Instruct | 78.68 |
| 2026-10-13 | Same prescription, scanned again | Llama 4 Scout | 96 |
| 2026-10-14 | Medicine review ("Ask your doctor"), 3 medicines | Llama 4 Scout | 46 |

Account total so far: 221 neurons.

What it means:
- **Cost varies per call.** The same photo cost 78 and then 96 neurons: billing is per token, and the model's answer length varies. A review grows with the number of medicines (roughly 45 for 3, an estimated 60 to 90 for 10).
- So limits are a **neuron budget**, not a call count (`worker/aiBudget.ts`, table `ai_usage`):
  - Each call records its real cost, computed from the token counts Workers AI returns (`usage.prompt_tokens` / `completion_tokens`) at the model's per-token rate. If a model returns no counts, the measured estimate is charged (scan 100, review 60).
  - Before a call, the app checks that a typical call of that kind still fits.
  - **Per vault:** 1,000 neurons per day (about 10 scans, or a mix of scans and reviews).
  - **All vaults together:** AI stops at 9,000 of the free 10,000 per day, so the account never goes over the free allowance however many families sign up.
  - Days are UTC, matching Cloudflare's reset (5:30 AM in India). Settings → "AI today" shows the vault's usage.
- If the dashboard total drifts from the sum in `ai_usage`, adjust the per-token rates in `worker/aiBudget.ts`:
  `npx wrangler d1 execute med-vault --remote --command "SELECT date(at), SUM(neurons) FROM ai_usage GROUP BY 1"`
- The free 10,000 neurons/day covers about 100 to 125 prescription scans per day across all vaults. Beyond the free tier, Workers AI costs $0.011 per 1,000 neurons: one scan is about $0.001 (under ₹0.1).

Rough capacity on the free tier: R2's 10 GB fits about 5 full vaults or many light ones (a family with 200 compressed photos uses ~100 MB). Beyond that, R2 is $0.015/GB-month.

Next step if bots ever create vaults: **Cloudflare Turnstile** (free) on the "Create my vault" form.

## Constraints that shape the code

1. **10 ms CPU per request (free plan).** No image processing, PDF parsing or heavy crypto in the Worker. Images are resized/compressed in the browser. Device keys, link codes and recovery keys are high-entropy random values, so a single SHA-256 is enough to store them (no slow password hashing in the Worker). File downloads stream from R2 without buffering.
2. **D1 is SQLite.** Use `?` bound parameters, `db.batch()` for multi-statement writes (it runs as one transaction), and indexes on `member_id` + date columns. Foreign keys are enforced, so deletes cascade.
3. **D1 write budget (100k rows/day).** Far above family use. Don't write on every read (e.g. no "last seen" updates per request).
4. **R2 is not cleaned up by D1 cascades.** Any route that deletes a member, prescription, report or medication must also delete its R2 objects.
5. **Request body limit 100 MB.** Uploads are capped at 15 MB per file in the API anyway.
6. **Web Push crypto is ~1-2 ms per message.** The reminder cron sends at most 4 per run and leaves the rest for the next run.
7. **PWA needs HTTPS.** Provided by workers.dev. Local dev runs on `localhost`, which browsers treat as secure.

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
| Push to `main` (or manual run) | `check`, then `deploy`: create D1/R2 if missing, inject the D1 id, apply migrations, build, `wrangler deploy` |

GitHub repository secrets:

| Secret | Status | Purpose |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Set | Which Cloudflare account to deploy to |
| `CLOUDFLARE_API_TOKEN` | Set | Deploy permission |

The API token needs these **Account** permissions: *Workers Scripts: Edit*, *D1: Edit*, *Workers R2 Storage: Edit* (plus *Account Settings: Read*, which the "Edit Cloudflare Workers" template includes).

**Before the first deploy:** enable R2 once in the Cloudflare dashboard (R2 → Get started). Everything else is created by the workflow.

## Manual setup (without CI)

```bash
npx wrangler login
npx wrangler d1 create med-vault           # copy database_id into wrangler.jsonc
npx wrangler r2 bucket create med-vault-files
npm run db:migrate:remote
npm run deploy
```

Local: `npm run db:migrate:local`, then `npm run dev`. No secrets are needed.

Workers AI only runs on Cloudflare, so local dev starts with remote bindings off. Put `AI_MOCK=1` in `.dev.vars` to get canned scan results, or run `CF_REMOTE=1 npm run dev` after `npx wrangler login` to call the real models (uses your free allowance).

## Backups

Families back up their own vault from Settings (a ZIP built on the phone, see [BACKUP.md](./BACKUP.md)). For the whole deployment:

D1 has Time Travel (point-in-time restore for the last 30 days on paid, 7 days on free). For an extra copy: `npx wrangler d1 export med-vault --remote --output backup.sql`. R2 objects can be copied with `rclone` or `wrangler r2 object get`.
