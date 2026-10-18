# Home readings (blood pressure and sugar)

Status: **built**. Code: `shared/readings.ts` (limits, flags, summary), `worker/readings.ts`, `migrations/0011_readings.sql`, `src/components/HomeReadings.tsx`, `src/pages/forms/ReadingForm.tsx`.

## What it does

- **Trends → Home readings:** **Log BP** (upper, lower, pulse) and **Log sugar** (mg/dL, and when: fasting, after a meal, random). Time defaults to now and can be changed.
- One card per series: blood pressure, and sugar per timing (a fasting and an after-meal value have different normal limits, so they are never mixed in one chart).
- **Charts:**
  - BP shows the upper number as a solid line and the lower as hollow points, with dotted lines at 140 and 90. Sugar shows the usual range as a band.
  - Periods: 30 days, 90 days or all. Several readings a day are plotted at their time.
  - Readings are listed under the chart; tap one to edit or delete it.
- **Visit brief and its shared text:** last 30 days per series, with average, lowest to highest, number of readings, and how many were high or low.
- Included in backup and restore.

## Family view (home screen)

**Blood pressure & sugar** on the home screen (shown once anyone has a reading in the last 90 days) gives **one card per person**. Design chosen from the comparison mockups:

- **BP:** one bar per reading, from the lower to the upper number. Over the normal zone, with dotted limits at 140 and 90; a high reading gets a status dot.
- **Sugar:** underneath, on its own mg/dL scale, aligned to the same date line, so a day sits in the same column in both panels.
  - Fasting readings are filled dots and after-meal or random readings are hollow.
  - Each kind is joined by a faint line, with dotted limits at 100 and 140; out-of-range readings are drawn in the status color.
- **Never one shared axis.** mmHg and mg/dL on one axis would put different meanings at the same height.
- **Period:** 14, 30 or 90 days, the same window on every card (one request for 90 days, filtered on the phone).
- **Reading the cards:** the header shows the latest BP and sugar, and tapping it opens that person's Trends. Tapping or dragging on the chart shows the readings at that time.
- **Colors:** each person keeps their family color (`--member-1..4`; a neutral bar beyond four). Identity comes from the card's name, so color is only a cue.
- People with no readings in the period get no card; a person without sugar readings gets a BP-only card.

## Limits used for High / Low

| Reading | Normal | Source |
|---|---|---|
| Blood pressure | below 140/90 (High from 140 upper or 90 lower); Low below 90/60 | Indian guideline (ISH 2020 / ICMR) |
| Sugar, fasting | 70 to 99 mg/dL | ADA / ICMR |
| Sugar, after a meal (2 h) or random | under 140 mg/dL | ADA / ICMR |
| Any sugar | Low below 70 mg/dL | |

Every flag says "your doctor may set a different target". Not built yet: per-person targets (e.g. a diabetic's fasting target of 80 to 130), reading a BP monitor's screen from a photo, and a daily "log your BP" reminder.

## Validation

The server checks ranges (systolic 50 to 300, diastolic 30 to 200, pulse 20 to 250, sugar 10 to 1000), requires both BP numbers with the upper one higher, and clears the other kind's fields.
