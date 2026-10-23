# Build Order: Phase 3

The agreed order for the remaining Phase 3 features (see [PLAN.md](./PLAN.md) section 6). Each one is a feature branch and a pull request, merged before the next starts.

| Order | Feature | Status | Notes |
|---|---|---|---|
| 1 | **Export / backup** | Built | ZIP of all records, photos and PDFs plus a readable "Open me.html"; restore into a new vault. See [BACKUP.md](./BACKUP.md). |
| 2 | **"Ask your doctor" hints** | Built | Built-in checks plus AI review of all current medicines across doctors, as questions for the next visit. See [ASK_YOUR_DOCTOR.md](./ASK_YOUR_DOCTOR.md). |
| 3 | **Visits log + follow-ups** | Built | Prescriptions log their visit; scans read the follow-up; "Coming up" on home; follow-ups close when the next visit is logged. See [VISITS.md](./VISITS.md). |
| 4 | **Lab value trends** | Built | Report scans read every result; Trends tab charts each test with the normal range and medicine changes; latest values in the Visit brief. See [LAB_TRENDS.md](./LAB_TRENDS.md). |
| 4a | **Privacy & consent** | Built | Privacy notice, consent and guardian confirmation, AI off until allowed, security contact email, breach runbook, and a one-year security log (Settings → Activity). See [COMPLIANCE.md](./COMPLIANCE.md) and [AUDIT_LOG.md](./AUDIT_LOG.md). |
| 5 | **Search** | Built | One box across every record type and note; all words must match; per-member search from a profile. See [SEARCH.md](./SEARCH.md). |
| 6 | **Condition timeline** | Built | Tap a condition: its current medicines, the doctors involved and every linked prescription, report and visit in one timeline. Condition-to-condition links were dropped as low value (multi-condition records already cover them). |
| 7 | **Reminders** | Built | Medicine times (weekly doses and tapers included), follow-ups and a monthly backup nudge by Web Push from a 5-minute cron. Set up per phone; no secrets (the VAPID key lives in D1). Refills left out: no pill count to base them on. See [REMINDERS.md](./REMINDERS.md). |
| 8 | **Offline mode** | Built | The latest 10 of each kind of record stay on the phone and open offline; BP and sugar can be logged offline and are sent when back online. See [OFFLINE.md](./OFFLINE.md). |

Phase 4 (Hindi UI) comes after this list. PIN lock dropped: the phone's own lock is enough.
