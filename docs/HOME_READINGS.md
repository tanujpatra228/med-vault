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

**Blood pressure & sugar** on the home screen (shown once anyone has a reading) puts the whole family on one chart per measure. BP and sugar are never on one chart: they have different units, and a chart has only one axis.

- Measures: **Blood pressure**, with an **Upper / Lower** switch so there is one line per person rather than two; and **Sugar** per timing (fasting, after a meal, random), for the timings that have readings.
- Periods: 30 or 90 days.
- Readout: tap or hover to see everyone's reading for that day.
- Below the chart: each person's latest reading with its High/Low flag; tap a name to open their Trends.
- Colors: one per person in family order, the same on every chart (`--member-1` to `--member-4`, in `src/styles.css`).
  - Validated with the dataviz palette checks, all pairs, light and dark. Four is the most that stays distinguishable.
  - A fifth person and beyond gets a neutral line, still with their name label.
  - Each person also has a marker shape (circle, square, triangle, diamond), a name at the line end and a legend entry, so identity never rests on color alone.

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
