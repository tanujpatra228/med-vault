# Lab Trends

Status: **built**. Code: `shared/labs.ts` (test names, parsing), `worker/labs.ts`, `src/lib/labs.ts`, `src/components/LabChart.tsx`, `src/pages/member/TrendsTab.tsx`, migration `0007`.

## Why

Is the arthritis treatment working? ESR and CRP across reports answer that, but only if the numbers are side by side.

## How results get in

- **Scan a report:** the AI copies every result row as printed (name, result, unit, normal range) into the report form's **Results** list. Every cell is editable, and rows can be added by hand.
- **Several tests in one report:** a report can have more than one type (blood and urine from one lab visit). It stays one report with one file and shows under each type's filter. The AI picks every type it sees. Stored comma-separated in `reports.report_type` ("blood,urine"); see `shared/reports.ts`.
- **Same report saved twice:** before a new report is saved, `POST /api/labs/duplicates` compares it with the member's saved reports. Most results identical (half on the same date, 80% and at least 3 on another date, in case the date was misread) or, without results, the same date and type → "This report looks already saved" with **Open saved** or **Save anyway**. A duplicate would otherwise show every result twice in the trends.
- **PDF reports** work too, read in the browser with pdf.js (loaded only then, legacy build for older Android Chrome). A PDF with real text (most lab-system PDFs) sends its text, up to 15,000 characters (about 3 to 5 pages): more accurate than a photo and every page is read. A scanned PDF (only images inside) sends page 1 as an image, and the app says when later pages were skipped.
- The server works out the rest in code, not the model:
  - **Canonical test:** "ESR", "E.S.R. (Westergren)" and "Erythrocyte Sedimentation Rate" are one test, so they share a chart. Unknown tests keep their own name.
  - **Number:** "42", "<0.5" and "1,50,000" are read as numbers. Text results like "Positive" are kept as text.
  - **Range:** "0-20", "< 5", "Up to 6" and "> 40" are all understood.
  - **High/Low flag:** set by comparing the number with the range.
- A result's date is its report's date, so editing the report date moves its results too.

## Where it shows

| Place | Shows |
|---|---|
| Member → **Trends** | One row per test: latest value, High/Low, "Down from 58 to 42 · back in normal range", sparkline. Out-of-range tests first. Tap one to open its chart, the medicines taken over that period and the readings table. |
| Report screen | The report's results table, with High/Low |
| **Visit brief** | The latest result per test from the last year (up to 8), with direction. Also included in the shared text. |

Text-only results (e.g. HLA B27 Positive) are listed under "Other results".

## The chart

Built on the dataviz method:
- one 2px line with ringed points
- the normal range as a 10% band with dotted lines at its limits; an axis starts at 0 when the range has only an upper limit
- **Scales:** labs often print the result and the range in different scales (406,000 /cmm against "1.5 - 4.0 lac/cmm"). `rangeFor` in `shared/labs.ts` puts the range on the result's scale (lakh, thousand / 10^3, million / 10^6) before flagging; migration 0010 fixed results saved earlier.
- out-of-range points in the status color, always paired with "High"/"Low" text, never color alone
- **medicine timeline** under the chart, on the same dates (`shared/courses.ts`, `MedicineLanes` in `LabChart.tsx`):
  - One row per medicine, with a bar while it was taken and an arrow when it runs past either edge.
  - The chart runs to today, so medicines started after the last report still show.
  - **Dose changes stay one row:** the same medicine ending and starting again within a day (a new prescription changing the dose) becomes one bar with a tick, not "stopped" and "started".
  - **Default rows:** medicines linked to the same condition as this test's reports; with no links, the 3 most recently changed. **Show all medicines** reveals the rest.
  - **Tapping:** a bar shows its dose and dates. A result's readout lists what was being taken that day.
  - Replaced the earlier vertical start/stop lines (Oct 2026, on trial: `medicineMarkers` is kept so a revert is clean).
- a crosshair readout on hover or tap
- a readings table under every chart, so no value lives only in the chart

Colors are validated for light and dark mode (see DESIGN_SYSTEM.md, "Charts").

## Limits

- Units aren't converted. If a lab switches units, the chart mixes them, and the table shows each unit.
- Batch scanning of old reports isn't built. Scan them one by one; each adds to the trends.
