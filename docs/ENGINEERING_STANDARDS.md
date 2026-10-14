# Engineering Standards

Derived from our infrastructure (see [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)): a single Cloudflare Worker on the free plan, D1 (SQLite), R2, and a React PWA for Android.

## 1. Stack

| Area | Choice |
|---|---|
| Language | TypeScript, `strict: true`, everywhere |
| Frontend | React + Vite, React Router, TanStack Query |
| Styling | Tailwind CSS v4 with design tokens from `src/styles.css` |
| Components | shadcn/ui (Radix primitives, `lucide-react` icons) in `src/components/ui/` |
| API | Hono on Cloudflare Workers |
| Database | D1 with plain SQL migrations in `migrations/` |
| Files | R2 |
| Build/dev | `@cloudflare/vite-plugin` (runs the real Workers runtime locally) |

No new dependency without a reason. Prefer platform APIs (Web Crypto, `fetch`, `Intl`, Canvas) over libraries.

## 2. Repository layout

```
docs/          product, design, engineering, infrastructure docs
migrations/    D1 SQL migrations, numbered, never edited after being applied remotely
shared/        types shared by API and app (no runtime code that depends on DOM or Workers)
worker/        Cloudflare Worker (Hono API)
src/           React app
  api/         typed fetch client and TanStack Query hooks
  components/  reusable UI built on the design system
  pages/       one file per screen
  lib/         small helpers (dates, image compression)
public/        PWA manifest, service worker, icons
```

## 3. Worker / API rules

1. **Respect the 10 ms CPU limit.** No image processing, PDF parsing or slow hashing in the Worker. Stream R2 objects; never buffer whole files.
2. **All SQL uses bound parameters** (`prepare(...).bind(...)`). Never build SQL from user input. Column names for writes come from a fixed allowlist per table.
3. **Multi-row writes use `db.batch()`** so they are atomic (e.g. a prescription and its medicines).
4. **Validate every input** at the API boundary: required fields, enum values, `YYYY-MM-DD` dates, max lengths. Return `400` with `{ error: "message" }`.
5. **Consistent responses:** JSON only. Success returns the resource (or `{ ok: true }`). Errors return `{ error }` with the right status: 400 invalid, 401 not logged in, 404 missing, 413 too large, 429 rate limited, 500 unexpected.
6. **IDs are UUIDs** from `crypto.randomUUID()`. Timestamps are ISO-8601 UTC; dates are `YYYY-MM-DD`.
7. **Newest first is part of the API.** Every list endpoint orders by its date column `DESC`, then `created_at DESC`. The client never re-sorts.
8. **Delete R2 objects with their owners.** D1 cascades do not reach R2.
9. **Every `/api/*` route requires a linked device** (`requireDevice`) except `/api/auth/*`.
10. **Secrets only via `wrangler secret`** (prod) or `.dev.vars` (local, git-ignored). Never commit secrets.
11. **Tenant isolation is non-negotiable.** Every query reads `c.get("vaultId")` and filters by `vault_id`, including updates and deletes. Every inserted row gets `vault_id`. Any id coming from the client that points at another record (member, doctor, condition, prescription) is checked to belong to the same vault (`assertRefs`). New routes must be tested with a second vault trying to read and modify the first.

## 3a. AI rules

1. **AI output is a suggestion.** It only ever pre-fills a form the user confirms. No endpoint saves AI output into records. The one exception is the medicine review (`med_reviews`), which stores advisory questions, labelled as such, never medical data.
2. **Normalize on the server.** Never trust the model's JSON: validate dates, enums and lengths in `worker/ai.ts` and drop what fails. Covered by `worker/ai.test.ts`.
3. **Never lose a suggestion silently.** If AI proposes a new doctor or condition, the user must add or skip it before saving (conditions: each diagnosis read gets Add / Skip in the picker).
4. **Images go to the model as data URLs prepared in the browser.** The Worker does no image work (10 ms CPU limit).
5. **Respect the shared allowance.** Every AI call checks `assertAiBudget()` first and records its real neuron cost with `recordAiUsage()` (`worker/aiBudget.ts`).
7. **AI needs the vault's permission.** Every AI call checks `hasAiConsent()`; without it, scans are refused and reviews use built-in rules only (see COMPLIANCE.md).
6. **Advice is a question.** Anything health-related the app generates is phrased as a question for the doctor, never an instruction (see ASK_YOUR_DOCTOR.md).

## 4. Database rules

1. Schema changes only through a new numbered file in `migrations/`. Never edit an applied migration.
2. Every table has `id`, `created_at`; mutable tables have `updated_at` (set by the API on update).
3. Index every foreign key used in a `WHERE`, plus `(member_id, <date> DESC)` for timelines.
4. Use `ON DELETE CASCADE` for child records of a member, `ON DELETE SET NULL` for optional links (doctor, condition).
5. Keep row-write counts low (D1 free tier: 100k rows/day).

## 5. Frontend rules

1. **Server state lives in TanStack Query.** No copying API data into `useState`. Mutations invalidate the queries they affect.
2. **Design tokens only.** Use Tailwind classes mapped to tokens (`bg-paper`, `text-ink-muted`, `border-rule`). No raw hex, no arbitrary colors.
3. **shadcn first.** Before building a UI element, check whether shadcn/ui has it (https://ui.shadcn.com/docs/components). Add it with `npx shadcn@latest add <name>` (config in `components.json`), then adjust its classes to the design tokens. Never fork a shadcn component into a page; keep it in `src/components/ui/`.
4. **Reuse app components** from `src/components/` (Row, Field, FormPage, PhotoPicker...). Add to them rather than styling one-offs.
5. **Mobile first.** Design for a 360px-wide Android screen; 48px touch targets; forms use native inputs (`type="date"`, `inputmode`) so Android shows the right keyboard.
6. **Compress images in the browser** before upload (max 2000px long side, JPEG ~0.82). PDFs upload as-is. Max 15 MB per file.
7. **Every screen handles loading, empty and error states.** Empty states tell the user the next action.
8. **Accessibility:** semantic elements (`button`, `a`, `label`), visible focus ring, text meaning beyond color.
9. **Dates** are formatted with `Intl.DateTimeFormat('en-IN')` via `src/lib/format.ts`.
10. **Doses come from the schedule.** Read a medicine's dosing with `scheduleOf()` / `medView()`, never by parsing the `dosage` text. `dosage` is a derived summary kept for display and old rows. All schedule logic (validation, wording, what is due today) lives in `shared/schedule.ts` and is unit-tested there.

## 6. PWA rules

1. `public/manifest.webmanifest` with 192px and 512px icons plus a maskable icon.
2. The service worker caches the app shell only. **Never cache `/api/*` responses** in v1 (medical data must be fresh; offline mode is a later phase).
3. New deploys activate on next launch; no stale app shells.

## 7. Code style

- Small, single-purpose functions and components. A file over ~300 lines is a signal to split.
- Name things for the domain: `prescription`, `medication`, `member`, not `item` or `data`.
- Comments explain *why*, not *what*.
- No dead code, no commented-out code, no `any` (use `unknown` and narrow).
- Format with the editor's default Prettier settings (2 spaces, double quotes, semicolons).

## 8. Quality gates (before every commit)

```bash
npm run typecheck   # zero errors
npm test            # unit tests (vitest)
npm run build       # must succeed
```

Manually check any changed screen in the browser at phone width. CI runs the same three checks on every PR.

Unit tests live next to the code (`*.test.ts`) and cover pure logic: parsing, normalization, matching. They run without the Workers runtime (`vitest.config.ts`).

## 9. Git workflow

- **Small tasks go straight to `main`**, one commit per task. Never bundle unrelated changes in one commit.
- **Major features or modules** (e.g. AI capture, reminders, offline mode): branch off `main` (`feature/<name>`), commit in small steps, open a pull request, merge when CI is green.
- Commit messages: imperative summary line under ~70 chars (`Add reports filter by type`), body explains why when it is not obvious.
- `main` must always build: CI runs typecheck + build on every PR and push, and every push to `main` deploys to production.
- Never commit `.dev.vars`, `.wrangler/` or `dist/`.

## 10. Security & privacy

- **No passwords, no accounts.** A vault is opened by a device key: a random 256-bit token stored hashed (SHA-256) in D1 and sent as an `HttpOnly; Secure; SameSite=Lax` cookie, refreshed daily on use.
- New devices join with a single-use link code (8 chars, 10 minutes) or the vault's recovery key (20 chars, ~98 bits, shown once, stored hashed).
- Vault creation and failed link/recovery attempts are rate limited per IP.
- Files are served only to devices of the owning vault, with `Cache-Control: private`.
- No secrets in the repo or in CI beyond the Cloudflare deploy token.
- No analytics or third-party scripts. Fonts from Google Fonts are the only external request.
