# Plan: Dosage Schedules (weekly, specific days, tapers, half tablets)

Status: **built**. Code: `shared/schedule.ts` (model, validation, wording, today), `src/components/ScheduleEditor.tsx`, `src/pages/member/TodaySection.tsx`, migration `0002`.

## 1. Why

Today a medicine has one free-text `dosage` like `1-0-1`, which assumes "every day". This real prescription breaks that:

| # | Medicine | What the doctor wrote | What it means |
|---|---|---|---|
| 1 | Meditrex 5 mg (methotrexate) | हर शनिवार 2-0-0, हर रविवार 1-0-0 | **Weekly**: Saturday 2 in the morning, Sunday 1 in the morning, nothing on other days. 3 tablets = 15 mg per week. |
| 2 | Homin (B6+B9+B12) | हर सोम से शुक्र 1-0-0 | **Specific days**: Monday to Friday, 1 in the morning. Nothing on weekends. |
| 3 | Omnacortil 20 (prednisolone) | 1-1-0 for 4 days, then 1-½-0 for 3 days, after meal | **Taper**: 1 after breakfast and 1 after lunch for 4 days; then 1 after breakfast and **½** after lunch for 3 days. |

These are not edge cases. Weekly methotrexate with folic acid on the other days is the standard arthritis/spondylitis regimen, and steroid tapers are routine.

**Safety:** taking methotrexate daily instead of weekly is a well-known, dangerous medication error. Showing it as a plain "1-0-0" would be misleading, so weekly medicines must be impossible to miss.

## 2. The model: a schedule

Each medicine gets a structured `schedule`. A schedule is one or more **phases**; each phase has an optional length in days and a **pattern**.

```ts
type Dose = [morning: number, afternoon: number, night: number]; // 0, 0.5, 1, 1.5, 2 ...
type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Pattern =
  | { type: "daily"; dose: Dose }                                   // 1-0-1 every day
  | { type: "weekly"; days: Partial<Record<Weekday, Dose>> }        // Sat 2-0-0, Sun 1-0-0
  | { type: "interval"; every: number; dose: Dose }                 // every 2nd day (alternate days)
  | { type: "as_needed"; note: string | null };                     // SOS

interface Schedule {
  phases: Array<{ days: number | null; pattern: Pattern }>;         // days: null = until stopped
}
```

The three medicines above:

```jsonc
// Meditrex
{ "phases": [{ "days": null, "pattern": { "type": "weekly", "days": { "sat": [2,0,0], "sun": [1,0,0] } } }] }
// Homin
{ "phases": [{ "days": null, "pattern": { "type": "weekly", "days": { "mon": [1,0,0], "tue": [1,0,0], "wed": [1,0,0], "thu": [1,0,0], "fri": [1,0,0] } } }] }
// Omnacortil taper
{ "phases": [
  { "days": 4, "pattern": { "type": "daily", "dose": [1,1,0] } },
  { "days": 3, "pattern": { "type": "daily", "dose": [1,0.5,0] } }
] }
```

Phase dates are counted from the medicine's `start_date`, so the app always knows which phase applies today.

## 3. What the user sees

| Where | Shows |
|---|---|
| Medicine row (summary, medicines tab, prescription) | Compact text, e.g. `Sat 2-0-0 · Sun 1-0-0` with a **Weekly** flag; `Mon–Fri 1-0-0`; `1-1-0 → 1-½-0` with a **Taper** flag |
| Medicine detail | Full sentence: "Saturday: 2 after breakfast. Sunday: 1 after breakfast. 3 tablets a week." / "Days 1–4 (until 9 Oct): 1 after breakfast, 1 after lunch. Days 5–7 (until 12 Oct): 1 after breakfast, ½ after lunch." |
| **Today** line on every active medicine | "Today: 2 in the morning" or "Not today · next Saturday". The member summary gets a **Today's medicines** section built from this. |
| Weekly total | "3 tablets a week" (for methotrexate, matches the doctor's "15 mg/week" check) |
| Taper finished | Medicine automatically shows as finished after the last phase ends (no manual "stop" needed) |

Half tablets display as `½` (and `1½`).

**Meal-based wording.** The three dose slots are tied to meals, the way doctors write them. When the medicine's timing is "after food" / "before food", sentences use the meal: Omnacortil reads "Days 1–4: 1 after breakfast, 1 after lunch. Days 5–7: 1 after breakfast, ½ after lunch." Without a meal timing they fall back to morning / afternoon / night. The Today line follows the same rule ("Today: 1 after breakfast, ½ after lunch").

## 4. Entering a schedule

The "Dosage" field becomes a **schedule editor** with five choices:

1. **Every day** (default): three steppers, Morning / Afternoon / Night, in ½ steps.
2. **Specific days**: rows of *weekday chips + dose*. One row covers "Mon–Fri 1-0-0"; add a second row for "Sun 1-0-0" so Saturday and Sunday can differ. Shortcuts: Weekdays, Weekends, Once a week.
3. **Every few days**: "every [2] days" + dose.
4. **Changes over time** (taper): a list of steps, each "for [4] days" + dose, with "Add step".
5. **When needed** (SOS): optional note.

A live preview under the editor shows the sentence from section 3, so the user can check it against the paper.

## 5. AI scanning

The scan prompt asks the model for this schedule structure instead of a single dosage string, and is taught:
- Weekday words in Hindi, Gujarati and English: शनिवार/શનિવાર/Sat = Saturday, रविवार/રવિવાર/Sun, सोम/સોમ/Mon, मंगल/મંગળ/Tue, बुध/બુધ/Wed, गुरु/ગુરુ/Thu, शुक्र/શુક્ર/Fri; "हर" = every; "से" = to (a range of days).
- Arrows or "then" between rows = taper phases; "1-1/2-0" = [1, 0.5, 0].
- Frequency text like "3 tablets per week" or "5 days a week" as a cross-check.
- Shorthand: OD, BD, TDS, HS, SOS (already handled), plus "alternate days" = interval 2, "once a week" = weekly.

The server validates the schedule (known weekdays, doses 0–10 in ½ steps, 1–10 phases, phase lengths 1–365) and falls back to the plain text if it is malformed. As always, the result only fills the editor; the user confirms.

If the model can't get weekly or taper schedules right on real photos, this is where switching to the Claude API pays off.

## 6. Data and compatibility

- Migration `0002`: add `schedule TEXT` (JSON) to `medications`.
- Keep `dosage` as a human-readable summary, regenerated from `schedule` on save, so lists and old screens keep working.
- Existing medicines: `1-0-1`-style dosages are converted to a daily schedule; anything else stays as text until edited.
- `end_date` is derived from the last phase when the schedule has fixed lengths.

## 7. Build order (feature branch + PR)

1. Schedule types, validation, summary/sentence/"today" functions (including meal-based wording) with unit tests, using this prescription's three medicines as test cases.
2. Migration and API: accept and return `schedule`, keep `dosage` in sync.
3. Display: medicine rows, detail, Weekly/Taper flags, Today line.
4. Schedule editor in the medicine and prescription forms.
5. AI: prompt and normalizer for schedules; test with this prescription's three rows.
6. Member summary: **Today's medicines** section.
7. Docs update.

## 8. Unlocks next

With structured schedules, **dose reminders** (Phase 3) become straightforward: the reminder job only needs "what is due today at morning/afternoon/night", which step 1 already computes.
