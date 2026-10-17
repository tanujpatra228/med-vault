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
