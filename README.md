# Med Vault

A private vault for your whole family's medical records: current medicines, prescriptions, reports, allergies and health conditions, **newest first**. Built as an installable Android PWA on Cloudflare.

## Features (Phase 1)

- Family members with a one-screen **health summary**: allergies, active conditions, current medicines grouped by doctor, latest prescription and report.
- **Prescriptions** with photos and the medicines on them. Saving one adds its medicines to "current medicines".
- **Medicines**: dosage (1-0-1), timing, start/end, prescribing doctor; current vs stopped history.
- **Reports catalog** with photos/PDFs, filter by type.
- **Allergies & conditions**, **doctors directory** with tap-to-call.
- Camera capture with in-browser image compression.
- **No signup:** anyone with the URL creates their own vault in one tap. Link more phones with a one-time code; a recovery key restores access.
- **AI-assisted entry:** photograph a prescription, medicine strip or report and the form fills itself in (Cloudflare Workers AI). You check and save.
- **Questions for the doctor:** checks every current medicine from every doctor for allergy conflicts, duplicates and risky combinations (built-in rules plus AI), as questions for the next visit.
- **Visits and follow-ups:** every prescription logs its visit; scans read "review after 2 weeks"; upcoming and overdue follow-ups for the whole family on the home screen.
- **Lab trends:** report scans read every result; each test is charted over time with its normal range and medicine changes.
- **Search** across every record and note, for the family or one person.
- **Reminders** on each phone: medicine times (weekly doses and tapers included), follow-up visits and a monthly backup nudge.
- **Backup and restore:** one ZIP with every record and photo, readable on any computer; restore into a new vault.
- Installable on the Android home screen.

What comes next is in [docs/PLAN.md](docs/PLAN.md).

## Tech

React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, React Router · Hono API on Cloudflare Workers · D1 (SQLite) · R2 (files).

## Run locally

```bash
npm install
npm run db:migrate:local
echo AI_MOCK=1 > .dev.vars           # optional: canned AI scan results locally
npm run dev                           # http://localhost:5173
```

The Cloudflare Vite plugin runs the Worker in the real Workers runtime with local D1 and R2 (stored in `.wrangler/state`).

## Deploy

Every push to `main` deploys via GitHub Actions (`.github/workflows/deploy.yml`). Required repository secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. Enable R2 once in the Cloudflare dashboard before the first deploy. Details and manual steps: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Local dev server (app + API) |
| `npm run typecheck` | TypeScript across app, worker and config |
| `npm test` | Unit tests (vitest) |
| `npm run build` | Production build |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npm run deploy` | Build and deploy from your machine |

## Docs

| Doc | About |
|---|---|
| [PLAN.md](docs/PLAN.md) | Product plan: must-haves, later phases, good-to-haves |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Colors, type, spacing, components |
| [ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md) | How we write code and use git |
| [INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) | Cloudflare services, limits, CI/CD |
| [BACKUP.md](docs/BACKUP.md) | Backup ZIP format and restore |
| [ASK_YOUR_DOCTOR.md](docs/ASK_YOUR_DOCTOR.md) | Medicine review: built-in checks and AI |
| [VISITS.md](docs/VISITS.md) | Visits log and follow-ups |
| [LAB_TRENDS.md](docs/LAB_TRENDS.md) | Lab results and trend charts |
| [SEARCH.md](docs/SEARCH.md) | What search covers and how |
| [REMINDERS.md](docs/REMINDERS.md) | Push reminders: what, when, how, limits |
| [COMPLIANCE.md](docs/COMPLIANCE.md) | India privacy law (DPDP), consent, breach runbook |
| [TODO.md](docs/TODO.md) | Build order for what is next |

## Project layout

```
docs/        product, design, engineering, infrastructure
migrations/  D1 SQL migrations
shared/      types shared by API and app
worker/      Hono API (vault auth, CRUD, files)
src/         React app (components/ui = shadcn)
public/      PWA manifest, service worker, icons
```
