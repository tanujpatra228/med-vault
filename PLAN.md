# Med Vault: Product & Technical Plan

A private, family-wide vault for medications, reports, prescriptions and doctors. One place to answer: *"What is Mom taking right now, who prescribed it, and what did her last report say?"*

**Platform:** installable PWA, offline-first, cloud sync across all devices logged into the same account.

---

## 1. The Real Problem (sharpened)

Your mom's case is the design target:

- 3 doctors (ophthalmologist, rheumatologist, psychiatrist), 3 conditions, and one of them (eye infection) is **linked** to another (arthritis).
- Medications from 3 prescribers who **do not see each other's prescriptions**.
- Paper reports and prescriptions scattered across visits.

A flat "medications list + reports folder" will not fix this. The app is organized around **care threads**: a condition, the doctor treating it, the visits, the medicines and the reports, all linked. The flat views (all current meds, all reports by date) are filtered views over that graph.

---

## 2. Decisions Locked

| Topic | Decision | Consequence |
|---|---|---|
| Drug database | **None.** Free-text medication entry. | No accuracy guarantees. AI suggests, user confirms or edits. |
| Medication entry | AI from prescription photo **or** medicine strip/box photo, **always** with manual entry/edit. | Every AI result lands in an editable form, never saved silently. |
| Editing model | **One shared family account.** Any device logged in can edit. | No roles/permissions in v1. Simple auth. |
| Storage | **Offline-first.** Write to device, sync to cloud when online, pull to other devices. | Needs a local DB, an outbox, and conflict handling. This is the hardest engineering part. |
| Platform | **PWA** (web, installable). No native apps. | See PWA constraints in section 7. |

---

## 3. Domain Model

| Entity | What it is | Key fields |
|---|---|---|
| **Member** | A family member | name, DOB, blood group, allergies, chronic conditions, photo, emergency contact |
| **Doctor** | A care provider (shared across members) | name, specialty, clinic, phone, address |
| **Condition** (care thread) | A health problem being treated | member, title, status (active/resolved), started_on, linked conditions |
| **Visit** | One appointment | member, doctor, conditions, date, notes, next follow-up |
| **Medication** | A drug course | member, name, strength, form, dosage schedule, prescribed_by, condition, start/end date, status, stop reason, source (manual / ai_prescription / ai_medicine_photo) |
| **Report** | Lab / imaging / test result | member, type, date, lab, condition, extracted values |
| **Document** | Any file/photo | member, kind (prescription, report, medicine, bill, other), file, captured_at, links to visit/report/medication |
| **Reminder** | Dose, refill, follow-up | member, target, schedule |

Key relationships: `Condition <-> Condition` (eye infection related to arthritis), `Visit -> Medication`, `Medication -> Doctor`, `Report -> Condition`.

---

## 4. Screens (MVP)

1. **Family Home**: member cards with a badge, e.g. "4 active meds · follow-up in 3 days". Sync status indicator in the header (synced / pending N / offline).
2. **Member Profile** tabs:
   - **Overview**: allergies, blood group, active conditions, upcoming follow-ups.
   - **Medications**: active meds grouped by doctor/condition, stopped history collapsed.
   - **Reports**: reverse-chronological timeline, latest of each type pinned on top.
   - **Documents**: photo gallery, filter by kind.
   - **Care Threads**: one card per condition with doctor, last visit, meds, reports, linked conditions.
3. **Capture (+ button)**: camera → choose member → choose what it is:
   - *Prescription* → AI extracts doctor, date, list of meds → editable review form → save.
   - *Medicine photo* → AI reads name, strength, form from strip/box → editable form → save.
   - *Report* → AI extracts type, date, lab, values → editable form → save.
   - *Just store it* → saved as document, details later.
   - *Manual* → skip the camera, type it in.
4. **Doctor Directory**: all doctors, which members they treat.
5. **Visit Brief**: one screen to show a doctor: all current meds from every doctor, allergies, recent reports. Print / save as PDF.

### AI capture flow (offline aware)
```
Photo taken ──> saved locally (always works offline)
      │
      ├─ online?  ──> send to AI ──> editable pre-filled form ──> user confirms ──> saved
      │
      └─ offline? ──> document marked "pending extraction"
                      ──> when back online, AI runs in background
                      ──> notification/badge: "3 items ready to review"
```
User can always skip AI and fill the form manually.

---

## 5. Features Beyond MVP

1. **Interaction hints (AI, advisory only).** With no drug database, accuracy is not guaranteed, so this is framed as "questions to ask your doctor", never as medical advice. Still valuable given Mom's mix of psychiatric, arthritis and eye medication.
2. **Lab value trends**: chart ESR/CRP etc. across reports.
3. **Reminders**: dose times, refills, follow-ups (see PWA constraints).
4. **Search everything**: across names, notes and AI-extracted text.
5. **Emergency card** per member.
6. **Full export**: ZIP of images + JSON.

---

## 6. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Vite + React + TypeScript** (SPA) | Offline-first PWAs are simpler as a pure client app. No SSR needed for a private vault. |
| PWA | **vite-plugin-pwa** (Workbox) | Service worker, precaching app shell, install prompt, update flow. |
| UI | Tailwind CSS + shadcn/ui | Fast, mobile-first, accessible components. |
| Local DB | **Dexie.js** (IndexedDB) | Mature, reactive queries (`useLiveQuery`), works in every browser. |
| Local files | IndexedDB blobs (images compressed client-side to ~1-2 MB, WebP/JPEG) | Photos viewable offline. |
| Backend | **Supabase** (Postgres + Auth + Storage + Edge Functions) | Cloud copy of data and files, auth, server-side AI calls. |
| Sync | **Custom sync engine** (outbox push + cursor pull), see section 8 | Data volume is tiny and there is one account, so a simple engine is enough. Upgrade path: PowerSync if it ever outgrows this. |
| AI | **Claude API (vision)** called from a Supabase Edge Function | Reads handwritten/printed prescriptions, medicine strips, reports. Returns structured JSON. API key never in the browser. |
| Routing / state | React Router + TanStack Query (server calls) + Dexie live queries (data) | |

---

## 7. PWA Constraints (know these upfront)

| Concern | Reality | Mitigation |
|---|---|---|
| Camera | Works on Android and iOS via `<input type="file" accept="image/*" capture="environment">` | Use file input (most reliable), not `getUserMedia`, for v1. |
| Push notifications | Android: works. iOS: works **only if installed to Home Screen** (iOS 16.4+). | Onboarding step that pushes users to install. Reminders send Web Push from a Supabase scheduled function. |
| Storage eviction | Safari can clear storage for sites not used for a while. Installed PWAs are much safer. | Call `navigator.storage.persist()`. Cloud is the source of truth; local can always be rebuilt from sync. |
| Background sync | Background Sync API is Chrome-only. | Sync on app open, on `online` event, on visibility change, and on an interval while open. |
| Storage quota | Large on Chrome, more limited on iOS. | Compress images. Optionally keep only thumbnails locally for old documents and fetch full images on demand. |

---

## 8. Offline-First Sync Design

**Principles**
- Every record has a client-generated **UUID**, `updated_at`, `deleted` (soft delete), and `device_id`.
- The UI only reads/writes the **local Dexie DB**. It never waits for the network.
- Changes go into a local **outbox** table.

**Push** (when online): send outbox batches to a Supabase Edge Function / RPC that upserts rows. Server sets `server_updated_at` (monotonic). Clear outbox on success.

**Pull**: `SELECT * WHERE server_updated_at > last_cursor` per table, apply locally, advance cursor. Supabase Realtime can trigger an immediate pull on other open devices.

**Conflicts**: last-write-wins **per field** (keep a per-field timestamp map in a `field_updated_at` jsonb). Two devices editing different fields of the same medication both win. Same field: latest edit wins. Good enough for one family.

**Files**: photo saved locally as a blob first, a `file_uploads` outbox uploads it to Supabase Storage, then the document row gets its `storage_path`. Other devices download thumbnails on pull, full image on open (then cache).

**Deletes**: soft delete with `deleted = true`, synced like any edit. Purge after 30 days.

---

## 9. Database Schema (cloud, mirrored locally in Dexie)

All tables also have: `id uuid`, `account_id`, `created_at`, `updated_at`, `server_updated_at`, `field_updated_at jsonb`, `deleted bool`, `device_id`.

```sql
members(name, dob, sex, blood_group, allergies text[], conditions_summary, photo_path, emergency_contact jsonb)
doctors(name, specialty, clinic, phone, address, notes)
conditions(member_id, title, status, started_on, resolved_on, notes)
condition_links(condition_id, related_condition_id, relation)   -- caused_by | related_to | referred_from
visits(member_id, doctor_id, visit_date, notes, next_follow_up)
visit_conditions(visit_id, condition_id)
medications(member_id, doctor_id, condition_id, visit_id, name, strength, form,
            dosage jsonb, instructions, start_date, end_date, status, stop_reason, source)
reports(member_id, condition_id, visit_id, report_type, report_date, lab_name, summary)
report_values(report_id, test_name, value, unit, ref_low, ref_high, flag)
documents(member_id, kind, storage_path, thumb_path, captured_at, extraction_status,
          extraction jsonb, visit_id, report_id, medication_id)
reminders(member_id, target_type, target_id, schedule jsonb, active)
push_subscriptions(endpoint, keys jsonb, device_label)
```

RLS: every row `account_id = auth.uid()`. Storage bucket private, path prefixed by `account_id`.

---

## 10. Security

- One account, strong password or email OTP. Session persisted per device.
- **App lock**: PIN (and WebAuthn passkey/biometric where supported) before showing data, since a shared phone could be opened by anyone.
- Private storage bucket with short-lived signed URLs.
- "Log out this device" and "wipe local data" options.
- AI calls only through the Edge Function; images are not stored by the AI provider.

---

## 11. Roadmap

### Phase 0: Foundation
- Vite + React + TS + Tailwind + vite-plugin-pwa scaffold, installable app shell.
- Supabase project, auth, schema, RLS.
- Dexie schema mirroring cloud tables.

### Phase 1: Offline vault (no sync yet)
- Members, Doctors, Conditions, Visits, Medications, Reports CRUD, all local.
- Camera capture + local image storage + document gallery.
- Reports timeline, meds grouped by doctor, member overview.
- **Use it for Mom at this point** on one device.

### Phase 2: Sync
- Outbox push, cursor pull, per-field LWW, soft deletes.
- File upload/download queue.
- Sync status UI, Realtime-triggered pulls.
- Test: two phones, airplane mode on both, edit, reconnect, verify convergence.

### Phase 3: AI capture
- Edge Function calling Claude vision with three prompts: prescription, medicine photo, report.
- Editable review forms; pending-extraction queue for offline captures.

### Phase 4: Daily use
- Visit Brief + print/PDF.
- Reminders via Web Push.
- Lab trend charts, care thread linking UI, search.
- App lock (PIN / passkey).

### Phase 5: Extras
- AI interaction hints (advisory), emergency card, full export, Hindi/regional language.

---

## 12. Success Criteria for MVP

Load Mom's real data and pass:
1. All her current meds with prescribing doctor visible in **3 taps or fewer** from app open.
2. Latest blood report found in **under 5 seconds**.
3. Prescription photo to saved medications in **under 60 seconds**.
4. Add a med on phone A in airplane mode, reconnect, see it on phone B within seconds.
5. Show any doctor a complete medication list from all 3 doctors at once.
