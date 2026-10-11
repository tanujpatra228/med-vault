# Med Vault: Product & Technical Plan

A private vault for the whole family's medical records. Open the app, tap a family member, and instantly see their health summary, current medications, prescriptions and reports, **newest first, always**.

**Platform:** Android PWA (installable web app). No iOS work.

---

## 1. Guiding Rules

1. **Newest first, everywhere.** Reports, prescriptions, medications, visits, documents. The latest item is always at the top.
2. **Must-haves first.** Ship a working vault, then layer the extras.
3. **Simple over clever.** One shared family account, no roles, no app lock (phone PIN is enough), no offline sync in v1.
4. **Manual entry always works.** AI only pre-fills forms you can edit.

---

## 2. MVP Scope (must-haves)

| # | Feature | What it does |
|---|---|---|
| 1 | **Family members** | Add/edit members (name, photo, DOB, blood group). Home screen shows all members. |
| 2 | **Health summary** | Top of each member's profile: allergies, health conditions, current medications, latest report, latest prescription, doctors. One screen = full picture. |
| 3 | **Allergies & health conditions** | Dedicated section: drug/food allergies with severity, chronic or ongoing conditions (e.g. arthritis, eye infection) with status active/resolved. Shown prominently in red/amber on the summary. |
| 4 | **Prescriptions** | Each prescription = doctor + date + condition + photo(s) + list of medicines. Sorted newest first. |
| 5 | **Medications** | Current medicines (name, strength, dosage, timing, prescribing doctor, start/end date). Linked to the prescription they came from. Stopped meds move to a collapsed history. |
| 6 | **Reports catalog** | All reports (blood test, X-ray, MRI, etc.) with date, type, lab, notes and photos/PDFs. Newest first, filter by type. |
| 7 | **Documents / photos** | Capture with camera or pick from gallery (images + PDFs). Attach to a prescription, report or medicine. |
| 8 | **Doctors** | Simple list (name, specialty, clinic, phone). Pick from list when adding a prescription. |

### Explicitly NOT in MVP
AI extraction, offline sync, reminders, interaction checks, app lock, charts, sharing/export, multiple users or roles.

---

## 3. Screens

```
Home (family members)
 └─ Member Profile
     ├─ Summary        allergies, conditions, current meds, latest report, latest prescription
     ├─ Medications    current (newest first) + stopped history
     ├─ Prescriptions  newest first, tap to see photo + meds in it
     ├─ Reports        newest first, filter by type, tap to view files
     └─ Allergies & Conditions
Doctors (directory)
+ Add button (floating)  ->  Prescription | Report | Medicine | Allergy/Condition | Photo
```

**Add Prescription flow (most-used flow, optimized):**
1. Tap + → Prescription → pick member (pre-selected if inside a profile).
2. Take photo(s) of the prescription.
3. Pick doctor (or add new inline), date (defaults to today), condition (optional).
4. Add medicines: name, strength, dosage (e.g. 1-0-1), timing (before/after food), duration.
5. Save. Medicines automatically appear in "Current Medications".

---

## 4. Data Model

| Table | Key fields |
|---|---|
| `members` | name, photo, dob, sex, blood_group, notes |
| `allergies` | member_id, allergen, type (drug/food/other), reaction, severity, noted_on |
| `conditions` | member_id, name, status (active/resolved), diagnosed_on, notes |
| `doctors` | name, specialty, clinic, phone, address |
| `prescriptions` | member_id, doctor_id, condition_id, prescribed_on, notes |
| `medications` | member_id, prescription_id, doctor_id, name, strength, form, dosage, timing, start_date, end_date, status (active/stopped), notes |
| `reports` | member_id, condition_id, report_type, report_date, lab_name, notes |
| `files` | member_id, owner_type (prescription/report/medication), owner_id, storage_path, mime_type, created_at |

Every list query: `ORDER BY <date> DESC, created_at DESC`.

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Vite + React + TypeScript** | Fast, simple single-page app. |
| PWA | **vite-plugin-pwa** | Install to Android home screen, app-like full screen, cached app shell. |
| UI | **Tailwind CSS + shadcn/ui** | Mobile-first, clean, quick to build. |
| Backend | **Supabase** (Postgres + Auth + Storage) | Database, login and photo storage in one, free tier is plenty for a family. Data is in the cloud, so every logged-in phone sees the same records instantly. |
| Data fetching | TanStack Query | Caching, loading states, refetch on focus. |
| Hosting | Vercel or Netlify (free) | HTTPS is required for PWA install and camera. |

**Note on "no sync in v1":** data is stored in the cloud (Supabase) and read live. Multiple phones work from day one because they all read the same database. What is postponed is **working without internet**. When added later, it becomes a local cache on top of this, not a rewrite.

---

## 6. Phases

### Phase 1: MVP (the working vault)
1. Project scaffold, PWA manifest + icons, Supabase setup, login screen.
2. Members CRUD + Home screen.
3. Allergies & Conditions.
4. Doctors directory.
5. Prescriptions + Medications (with photo upload).
6. Reports catalog (with photo/PDF upload, filter by type).
7. Health Summary screen.
8. Deploy, install on Android, load Mom's real data.

### Phase 2: AI-assisted entry
- Photo of prescription → AI pre-fills doctor, date, medicines.
- Photo of medicine strip/box → AI pre-fills name, strength, form.
- Photo of report → AI pre-fills type, date, lab.
- Always an editable form before saving.

### Phase 3: Good-to-haves
- Visit Brief (show any doctor all current meds from all doctors).
- Dose / refill / follow-up reminders (Android Web Push).
- "Ask your doctor" interaction hints (AI, advisory only).
- Linking related conditions (eye infection ↔ arthritis).
- Search, lab value trends, export.

### Phase 4: Later
- Offline mode with background sync.
- Optional PIN lock.

---

## 7. MVP Done When

With Mom's real data loaded:
1. Open app → tap Mom → see allergies, conditions and all current meds with their doctors on **one screen**.
2. Latest report is the **first item** in Reports.
3. A new prescription with photo + 3 medicines is added in **under 2 minutes**.
4. Data added on one phone shows up on another phone logged into the same account.
