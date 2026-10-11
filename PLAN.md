# Med Vault: Product & Technical Plan

A private, family-wide vault for medications, reports, prescriptions and doctors. One place to answer: *"What is Mom taking right now, who prescribed it, and what did her last report say?"*

---

## 1. The Real Problem (sharpened)

Your mom's case is the design target:

- 3 doctors (ophthalmologist, rheumatologist, psychiatrist), 3 conditions, and one of them (eye infection) is **linked** to another (arthritis).
- Medications from 3 prescribers who **do not see each other's prescriptions**.
- Paper reports and prescriptions scattered across visits.

A flat "medications list + reports folder" will not fix this. The app must be organized around **care threads**: a condition, the doctor treating it, the visits, the medicines, and the reports, all linked. The flat views (all current meds, all reports by date) are then just filtered views over that graph.

**Biggest risk you are not seeing yet:** drug interactions across prescribers. Psychiatric meds + arthritis meds (NSAIDs, steroids) + eye drops (steroids) is a classic danger zone. The app should flag this. That single feature can justify the whole product.

---

## 2. Core Concepts (Domain Model)

| Entity | What it is | Key fields |
|---|---|---|
| **Household** | Your family vault | name, owner |
| **Member** | A family member | name, DOB, blood group, allergies, chronic conditions, photo, emergency contact |
| **Doctor** | A care provider (shared across members) | name, specialty, clinic, phone, address |
| **Condition** (care thread) | A health problem being treated | member, title ("Eye infection"), status (active/resolved), started_on, **linked_conditions[]** |
| **Visit** | One appointment | member, doctor, condition(s), date, notes, next_follow_up |
| **Medication** | A drug course | member, name, strength, form, dosage schedule, prescribed_by (doctor), condition, start/end date, status (active/stopped/completed), stop reason |
| **Report** | Lab / imaging / test result | member, type (blood, X-ray, MRI...), date, lab, condition, extracted values |
| **Document** | Any file/photo | member, kind (prescription, report, medicine photo, bill, other), file, captured_at, linked to visit/report/medication |
| **Reminder** | Dose, refill, follow-up | member, target, schedule |

Relationships that matter:
- `Condition ↔ Condition` (eye infection *caused by / related to* arthritis)
- `Visit → Medication` (this prescription started these meds)
- `Medication → Doctor` (who to call if side effects)
- `Report → Condition` (which problem this test is for)

---

## 3. Screens (MVP)

1. **Family Home** - grid of member cards. Each card shows a glanceable badge: "4 active meds · follow-up in 3 days".
2. **Member Profile** - tabs:
   - **Overview**: allergies, blood group, active conditions, next appointments, interaction warnings.
   - **Medications**: active meds grouped by doctor/condition, with "stopped" history collapsed.
   - **Reports**: reverse-chronological timeline, filterable by type/condition. Latest of each type pinned at top.
   - **Documents**: photo gallery, filter by kind.
   - **Care Threads**: one card per condition showing doctor, last visit, meds, reports, and linked conditions.
3. **Capture (the + button, always one tap away)** - camera → pick member → app suggests what it is (prescription / report / medicine) → save. Details can be filled later.
4. **Doctor Directory** - all doctors, which members they treat.
5. **Visit Brief** - one screen to show a doctor: current meds from *all* doctors, allergies, recent reports, linked conditions. Shareable as PDF or expiring link.

---

## 4. Features That Make It Stand Out

Ranked by value for your situation:

1. **AI capture (scan → structured data).** Photograph a prescription, AI (Claude vision) extracts drug names, dosage, doctor, date and pre-fills the medication entries. You confirm, not type. Same for lab reports: extract values (HbA1c, ESR, CRP...) so they become trendable.
2. **Cross-prescriber interaction check.** Every time a med is added, check against all active meds for that member. Show a clear warning and a "Ask your doctor about this" note for the next visit.
3. **Visit Brief / Doctor Mode.** Walk into the rheumatologist and show everything the eye doctor and psychiatrist prescribed in 5 seconds.
4. **Lab value trends.** Line chart of ESR/CRP across reports, so you see if arthritis treatment is working.
5. **Reminders.** Dose times, refill alerts (based on quantity + schedule), follow-up dates.
6. **Search everything.** "methotrexate", "eye", "June blood test" across text extracted from all documents (OCR).
7. **Emergency card.** Lock-screen-accessible summary per member: allergies, conditions, critical meds, emergency contact.

---

## 5. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + TypeScript** | One codebase for Android + iOS, first-class camera, document scanner, local notifications. |
| Backend | **Supabase** (Postgres + Auth + Storage + Edge Functions) | Relational data fits the domain graph, Row Level Security for privacy, file storage for images, generous free tier. |
| AI extraction | **Claude API (vision)** via a Supabase Edge Function | Reads handwritten/printed prescriptions and reports, returns structured JSON. API key stays server-side. |
| Drug data | **RxNorm / openFDA** (or an Indian drug DB if meds are Indian brands) | Normalize brand names to generics, power interaction checks. |
| Local cache | SQLite (expo-sqlite) + sync | Works offline in a clinic with bad signal. |
| State/data | TanStack Query + Zustand | Simple, proven. |

**Alternative if you want to ship in a weekend:** Next.js PWA + Supabase. Works on phone browsers, camera via file input. Trade-off: weaker notifications and scanning on iOS. My recommendation: go Expo, since capture and reminders are core.

---

## 6. Privacy & Security (non-negotiable for medical data)

- Supabase RLS: every row scoped to `household_id`; only household members can read.
- Private storage bucket, signed URLs with short expiry.
- App lock with biometrics (Face ID / fingerprint).
- Images sent to AI only for extraction, not stored by the AI provider; make extraction opt-in per document.
- Export everything (ZIP of PDFs + JSON) so you are never locked in.
- Roles: Owner, Editor (e.g. your sibling), Viewer (e.g. a caregiver).

---

## 7. Database Schema (first cut)

```sql
households(id, name, created_by, created_at)
household_users(household_id, user_id, role)            -- owner | editor | viewer
members(id, household_id, name, dob, sex, blood_group, allergies text[], photo_path, emergency_contact jsonb)
doctors(id, household_id, name, specialty, clinic, phone, address, notes)
conditions(id, member_id, title, status, started_on, resolved_on, notes)
condition_links(condition_id, related_condition_id, relation)   -- caused_by | related_to | referred_from
visits(id, member_id, doctor_id, visit_date, notes, next_follow_up)
visit_conditions(visit_id, condition_id)
medications(id, member_id, doctor_id, condition_id, visit_id, name, generic_name, strength, form,
            dosage jsonb, start_date, end_date, status, stop_reason)
reports(id, member_id, condition_id, visit_id, report_type, report_date, lab_name, summary)
report_values(id, report_id, test_name, value, unit, ref_low, ref_high, flag)
documents(id, member_id, kind, storage_path, captured_at, ocr_text, extraction jsonb,
          visit_id, report_id, medication_id)
reminders(id, member_id, target_type, target_id, schedule jsonb, active)
```

---

## 8. Roadmap

### Phase 0: Foundation (week 1)
- Expo project, Supabase project, auth (email OTP / Google), RLS policies.
- Household + Members CRUD. Family Home screen.

### Phase 1: MVP vault (weeks 2-3) - *usable for Mom on day one*
- Doctors, Conditions, Visits, Medications CRUD.
- Camera capture + upload + document gallery.
- Reports timeline sorted by date, latest-per-type pinned.
- Member Overview with active meds grouped by doctor.
- Biometric app lock.

### Phase 2: Intelligence (weeks 4-5)
- AI extraction for prescriptions and reports (confirm-before-save flow).
- OCR text search.
- Drug name normalization + interaction warnings.
- Visit Brief screen + PDF export.

### Phase 3: Daily use (weeks 6-7)
- Dose, refill and follow-up reminders.
- Lab value trend charts.
- Condition linking UI (care thread graph).
- Share household with family (roles).

### Phase 4: Polish & extras
- Offline mode with sync.
- Emergency card / widget.
- Full export.
- Multi-language (Hindi/regional) for elderly members.

---

## 9. Success Criteria for MVP

Load Mom's real data and pass these tests:
1. From app open, see all her current meds with prescribing doctor in **under 3 taps**.
2. Find her latest blood report in **under 5 seconds**.
3. Add a new prescription from a photo in **under 60 seconds**.
4. Show any doctor a complete medication list from all 3 doctors at once.

---

## 10. Open Decisions

1. **Country / drug database**: Indian brand names need a different drug DB than US RxNorm. Confirm.
2. **Single user or shared family**: Will siblings/spouse edit too? Affects Phase 1 auth design.
3. **Cloud vs local-only**: Supabase cloud (sync across phones) vs on-device only (max privacy, no sync). Recommendation: cloud with RLS + encryption.
4. **Platform priority**: Android first, iOS first, or both?
