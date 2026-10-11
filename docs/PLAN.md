# Med Vault: Product Plan

A private vault for the whole family's medical records. Open the app, tap a family member, and instantly see their health summary, current medications, prescriptions and reports, **newest first, always**.

- **Platform:** Android PWA (installable web app). No iOS or native work.
- **Hosting:** Cloudflare (Workers, D1, R2). See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md).
- **Look and feel:** see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).
- **How we write code:** see [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md).

---

## 1. The Problem

Mom sees 3 doctors (eye, arthritis, psychiatrist) for 3 conditions, and the eye infection is linked to the arthritis. Each doctor prescribes without seeing the others' prescriptions. Reports and prescriptions are paper, scattered across visits. Multiply that by every family member.

Med Vault puts every member's medicines, prescriptions, reports, allergies and conditions in one place, with the latest information on top.

---

## 2. Guiding Rules

1. **Newest first, everywhere.** Reports, prescriptions, medications, documents. The latest item is always at the top.
2. **Must-haves first.** Ship a working vault, then add extras.
3. **Simple over clever.** One shared family account, no roles, no app lock (the phone PIN is enough), no offline sync in v1.
4. **Manual entry always works.** AI (later) only pre-fills forms you can edit.
5. **Stay on Cloudflare.** Prefer a Cloudflare service over a third-party one. Flag anything that needs a paid plan.

---

## 3. Decisions Log

| Topic | Decision |
|---|---|
| Platform | PWA for Android only. |
| Hosting | Cloudflare Workers (API + static assets), D1 (database), R2 (photos/PDFs). |
| Frontend | Vite + React + TypeScript, Cloudflare Vite plugin, shadcn/ui components. |
| Deploys | GitHub Actions: every push to `main` deploys to Cloudflare. |
| Git | Small commits straight to `main`; major modules on a branch with a pull request. |
| Account | One shared family account. Any logged-in device can view and edit. |
| Login | A single family password stored as a Worker secret. Sessions in D1. |
| App lock | Skipped. Phone PIN is enough. |
| Medicine database | None. Free-text medication entry. |
| Data storage | Cloud (D1/R2). Every logged-in phone sees the same data immediately. |
| Offline mode | Later phase. Will be a local cache layered on top, not a rewrite. |
| Interaction checks | Later phase, AI "ask your doctor" hints, advisory only. |
| Design | Visual language of the Lekha design system (fonts, colors, spacing, components), not its wording. |

---

## 4. Phase 1: Must-Haves (MVP)

| # | Feature | What it does |
|---|---|---|
| 1 | **Family members** | Add/edit members (name, relation, photo, DOB, sex, blood group, notes). Home screen lists everyone with active medicine and allergy counts. |
| 2 | **Health summary** | Top of each member's profile, one screen: allergies, active conditions, current medicines grouped by doctor, latest report, latest prescription, doctors seen. |
| 3 | **Allergies & conditions** | Drug/food/other allergies with reaction and severity. Conditions with status active/resolved. Allergies are highlighted on the summary. |
| 4 | **Prescriptions** | Doctor + date + condition + photos + list of medicines. Saving one adds its medicines to "Current medicines". Newest first. |
| 5 | **Medications** | Name, strength, form, dosage (e.g. 1-0-1), timing (before/after food), start/end date, prescribing doctor. Current on top, stopped ones in a history list. |
| 6 | **Reports catalog** | Blood, urine, imaging, scans, ECG, other. Date, lab, notes, photos/PDFs. Newest first, filter by type. |
| 7 | **Documents / photos** | Camera or gallery (images and PDFs), compressed on the phone before upload. Attached to a prescription, report, medicine or member. |
| 8 | **Doctors** | Directory: name, specialty, clinic, phone, address. Picked from a list when adding a prescription, with "add new" inline. |
| 9 | **Login** | One family password. Stays logged in on each device. |
| 10 | **Installable PWA** | Add to Android home screen, full-screen, app icon. |

### Screens

```
Login
Home (family members)
 └─ Member profile
     ├─ Summary        allergies, conditions, current medicines, latest report, latest prescription
     ├─ Medicines      current (newest first) + stopped history
     ├─ Prescriptions  newest first, tap for photos + medicines in it
     ├─ Reports        newest first, filter by type, tap to view files
     └─ Health         allergies & conditions
Doctors (directory)
+ Add (bottom sheet)  ->  Prescription | Report | Medicine | Allergy | Condition
```

### Add Prescription flow (the most-used flow)
1. Tap + → Prescription. Member is pre-selected when inside a profile.
2. Take or pick photo(s).
3. Pick doctor (or add new inline), date (defaults to today), condition (optional).
4. Add medicines: name, strength, form, dosage, timing, duration.
5. Save. Medicines appear in "Current medicines".

### Phase 1 is done when, with Mom's real data loaded:
1. Open app → tap Mom → allergies, conditions and all current medicines with their doctors on **one screen**.
2. The latest report is the **first item** in Reports.
3. A new prescription with a photo and 3 medicines is added in **under 2 minutes**.
4. Data added on one phone shows up on another phone logged into the same account.

---

## 5. Phase 2: AI-Assisted Entry

- Photo of a prescription → AI pre-fills doctor, date and medicines.
- Photo of a medicine strip or box → AI pre-fills name, strength and form.
- Photo of a report → AI pre-fills type, date and lab.
- Always lands in an editable form. Nothing saves without confirmation.
- Engine: Cloudflare Workers AI vision model first (stays on Cloudflare, free daily allowance). Fall back to the Claude API if accuracy on handwritten prescriptions is not good enough (paid, see INFRASTRUCTURE.md).

---

## 6. Phase 3: Good-to-Haves

- **Visit brief:** one screen to show any doctor all current medicines from every doctor, allergies and recent reports. Print / save as PDF.
- **Reminders:** dose, refill and follow-up reminders via Web Push, scheduled by Worker Cron Triggers.
- **"Ask your doctor" hints:** AI looks at all active medicines across doctors and lists possible interactions as questions for the next visit. Advisory only, clearly labelled.
- **Linked conditions:** e.g. eye infection related to arthritis, shown as one care thread.
- **Search** across names, notes and (later) AI-extracted text.
- **Lab value trends:** chart a value (ESR, CRP, HbA1c) across reports.
- **Export** everything (ZIP of files + JSON).
- **Visits log:** appointment date, doctor, notes, next follow-up.

## 7. Phase 4: Later

- **Offline mode:** local cache (IndexedDB) of data and photos, outbox for edits made offline, sync when online.
- **Optional PIN lock.**
- **Hindi / regional language UI.**

---

## 8. Data Model (Phase 1)

| Table | Key fields |
|---|---|
| `members` | name, relation, dob, sex, blood_group, notes, photo_file_id |
| `doctors` | name, specialty, clinic, phone, address, notes |
| `allergies` | member_id, allergen, kind (drug/food/other), reaction, severity, noted_on, notes |
| `conditions` | member_id, name, status (active/resolved), diagnosed_on, notes |
| `prescriptions` | member_id, doctor_id, condition_id, prescribed_on, notes |
| `medications` | member_id, prescription_id, doctor_id, condition_id, name, strength, form, dosage, timing, start_date, end_date, status, notes |
| `reports` | member_id, doctor_id, condition_id, title, report_type, report_date, lab_name, notes |
| `files` | member_id, owner_type, owner_id, name, mime_type, size (bytes stored in R2 under the file id) |
| `sessions` | token_hash, expires_at |
| `login_attempts` | ip, attempted_at |

Every list query sorts by its date column descending, then `created_at` descending.
