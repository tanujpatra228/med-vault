# Build Order: Phase 3

The agreed order for the remaining Phase 3 features (see [PLAN.md](./PLAN.md) section 6). Each one is a feature branch and a pull request, merged before the next starts.

| Order | Feature | Status | Notes |
|---|---|---|---|
| 1 | **Export / backup** | Built | ZIP of all records, photos and PDFs plus a readable "Open me.html"; restore into a new vault. See [BACKUP.md](./BACKUP.md). |
| 2 | **"Ask your doctor" hints** | Built | Built-in checks plus AI review of all current medicines across doctors, as questions for the next visit. See [ASK_YOUR_DOCTOR.md](./ASK_YOUR_DOCTOR.md). |
| 3 | **Visits log + follow-ups** | Built | Prescriptions log their visit; scans read the follow-up; "Coming up" on home; follow-ups close when the next visit is logged. See [VISITS.md](./VISITS.md). |
| 4 | **Lab value trends** | Built | Report scans read every result; Trends tab charts each test with the normal range and medicine changes; latest values in the Visit brief. See [LAB_TRENDS.md](./LAB_TRENDS.md). |
| 4a | **Privacy & consent** | Built (audit log open) | Privacy notice, consent and guardian confirmation, AI off until allowed, security contact email, breach runbook. Audit log to be discussed. See [COMPLIANCE.md](./COMPLIANCE.md). |
| 5 | **Search** | Built | One box across every record type and note; all words must match; per-member search from a profile. See [SEARCH.md](./SEARCH.md). |
| 6 | **Condition timeline** | Built | Tap a condition: its current medicines, the doctors involved and every linked prescription, report and visit in one timeline. Condition-to-condition links were dropped as low value (multi-condition records already cover them). |
| 7 | **Reminders** | Next | Dose, refill and follow-up reminders via Web Push, scheduled by Worker Cron Triggers. Needs a VAPID key saved as a Cloudflare secret (a server key, not a user password). |

Phase 4 (offline mode, PIN lock, Hindi UI) comes after this list.
