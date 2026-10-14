# Visits and Follow-ups

Status: **built**. Code: `shared/visits.ts` (follow-up parser), `worker/visits.ts`, `src/pages/member/VisitsTab.tsx`, `src/pages/forms/VisitForm.tsx`, `src/components/FollowUps.tsx`, migration `0005`.

## Why

"Review after 2 weeks" ends up in the notes and gets forgotten. With three doctors, nobody knows which appointment is due when.

## How it works (almost no typing)

1. **Saving a prescription logs its visit:** same doctor, date and condition. Existing prescriptions were backfilled as visits by the migration.
2. **The scan reads the follow-up.** The model copies the advice exactly ("Review after 4 weeks", "15 दिन बाद", "15 દિવસ પછી"). `parseFollowUpDays()` reads the interval in code, like doses. It only falls back to the model's day count, or to the notes, when the code can't read it. The follow-up date is then counted from the prescription date. The form shows "Written: …" so it can be checked against the paper.
3. **One-tap intervals:** 1 week, 2 weeks, 1 month and 3 months, counted from the visit date. Plus an optional "For the follow-up" note, such as "Bring CBC and LFT reports".
4. **Follow-ups close themselves.** Logging a new visit to the same doctor for the same member closes their open follow-ups that were due up to 2 weeks after it. "Mark as done" closes one manually. Changing a follow-up date reopens it.

## Where it shows

| Place | Shows |
|---|---|
| Home → **Coming up** | Open follow-ups for the whole family: overdue (up to 90 days back) first, then the next 60 days. Tap to call the doctor. |
| Member summary → **Next follow-up** | The same, for one person |
| Member → **Visits** tab | Every visit, newest first, with its follow-up status |
| Visit screen | "Log the visit" (pre-selects the doctor) or "Mark as done" |
| Prescription | Its follow-up, tap to edit |

Visits are included in backups and in "Open me.html".

## Next

Reminders (step 7) will send a notification the day before a follow-up, using `follow_up_on`.
