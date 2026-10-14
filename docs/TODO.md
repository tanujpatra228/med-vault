# Build Order: Phase 3

The agreed order for the remaining Phase 3 features (see [PLAN.md](./PLAN.md) section 6). Each one is a feature branch and a pull request, merged before the next starts.

| Order | Feature | Status | Notes |
|---|---|---|---|
| 1 | **Export / backup** | Built | ZIP of all records, photos and PDFs plus a readable "Open me.html"; restore into a new vault. See [BACKUP.md](./BACKUP.md). |
| 2 | **"Ask your doctor" hints** | Next | AI reviews all active medicines across doctors and lists possible interactions as questions for the next visit. Advisory only, clearly labelled. Counts against the daily AI limit. |
| 3 | **Visits log + follow-ups** | To do | Appointment date, doctor, notes, next follow-up date. Follow-up dates feed reminders later. |
| 4 | **Lab value trends** | To do | Record values (ESR, CRP, HbA1c) on reports, chart them over time. |
| 5 | **Search** | To do | Across members, medicines, prescriptions, reports, doctors and notes. |
| 6 | **Linked conditions** | To do | Link related conditions (e.g. eye infection related to arthritis) and show them as one care thread. |
| 7 | **Reminders** | To do | Dose, refill and follow-up reminders via Web Push, scheduled by Worker Cron Triggers. Needs a VAPID key saved as a Cloudflare secret (a server key, not a user password). |

Phase 4 (offline mode, PIN lock, Hindi UI) comes after this list.
