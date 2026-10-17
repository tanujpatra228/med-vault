/**
 * Home readings: blood pressure and blood sugar measured at home. Flags use general adult limits
 * (Indian hypertension guideline ISH 2020 / ICMR; ADA and ICMR for sugar). A doctor may set a
 * different target for a patient, and the app says so wherever a flag is shown.
 */

export type ReadingKind = "bp" | "sugar";
export type SugarContext = "fasting" | "after_meal" | "random";
export type ReadingFlag = "high" | "low" | null;

export interface Reading {
  id: string;
  member_id: string;
  kind: ReadingKind;
  /** Local time the reading was taken, "2026-10-17T08:30". */
  taken_at: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  /** mg/dL. */
  sugar: number | null;
  context: SugarContext | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SUGAR_CONTEXTS: Array<{ value: SugarContext; label: string; hint: string }> = [
  { value: "fasting", label: "Fasting", hint: "Before breakfast, 8+ hours without food" },
  { value: "after_meal", label: "After a meal", hint: "About 2 hours after eating" },
  { value: "random", label: "Random", hint: "Any other time" },
];

/** Hypertension from 140/90; low below 90/60. */
export const BP_LIMITS = { systolicHigh: 140, diastolicHigh: 90, systolicLow: 90, diastolicLow: 60 } as const;

/** mg/dL. Below 70 is low at any time. */
export const SUGAR_LIMITS: Record<SugarContext, { low: number; high: number; text: string }> = {
  fasting: { low: 70, high: 100, text: "70 to 99 mg/dL fasting" },
  after_meal: { low: 70, high: 140, text: "under 140 mg/dL 2 hours after a meal" },
  random: { low: 70, high: 140, text: "under 140 mg/dL" },
};

export function bpFlag(systolic: number | null, diastolic: number | null): ReadingFlag {
  if (systolic === null || diastolic === null) return null;
  if (systolic >= BP_LIMITS.systolicHigh || diastolic >= BP_LIMITS.diastolicHigh) return "high";
  if (systolic < BP_LIMITS.systolicLow || diastolic < BP_LIMITS.diastolicLow) return "low";
  return null;
}

export function sugarFlag(sugar: number | null, context: SugarContext | null): ReadingFlag {
  if (sugar === null) return null;
  const l = SUGAR_LIMITS[context ?? "random"];
  if (sugar < l.low) return "low";
  if (sugar >= l.high) return "high";
  return null;
}

export const readingFlag = (r: Pick<Reading, "kind" | "systolic" | "diastolic" | "sugar" | "context">): ReadingFlag =>
  r.kind === "bp" ? bpFlag(r.systolic, r.diastolic) : sugarFlag(r.sugar, r.context);

/** "138/86", "112 mg/dL". */
export const readingText = (r: Pick<Reading, "kind" | "systolic" | "diastolic" | "sugar">) =>
  r.kind === "bp" ? `${r.systolic}/${r.diastolic}` : `${r.sugar} mg/dL`;

export interface ReadingSummary {
  key: "bp" | SugarContext;
  label: string;
  count: number;
  /** Rounded averages. "138/86" for BP. */
  average: string;
  highest: string;
  lowest: string;
  /** Readings flagged high / low. */
  high: number;
  low: number;
  latest: Reading;
}

const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Per series (BP, and sugar per timing) over the readings given: count, average, highest, lowest
 * and how many were out of range. For the Visit brief ("last 30 days").
 */
export function summarize(readings: Reading[]): ReadingSummary[] {
  const out: ReadingSummary[] = [];
  const sorted = [...readings].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const bp = sorted.filter((r) => r.kind === "bp" && r.systolic !== null && r.diastolic !== null);
  if (bp.length) {
    const bySys = [...bp].sort((a, b) => a.systolic! - b.systolic! || a.diastolic! - b.diastolic!);
    out.push({
      key: "bp",
      label: "Blood pressure",
      count: bp.length,
      average: `${avg(bp.map((r) => r.systolic!))}/${avg(bp.map((r) => r.diastolic!))}`,
      highest: readingText(bySys[bySys.length - 1]),
      lowest: readingText(bySys[0]),
      high: bp.filter((r) => readingFlag(r) === "high").length,
      low: bp.filter((r) => readingFlag(r) === "low").length,
      latest: bp[bp.length - 1],
    });
  }
  for (const c of SUGAR_CONTEXTS) {
    const s = sorted.filter((r) => r.kind === "sugar" && r.sugar !== null && (r.context ?? "random") === c.value);
    if (!s.length) continue;
    const vals = s.map((r) => r.sugar!);
    out.push({
      key: c.value,
      label: `Blood sugar, ${c.label.toLowerCase()}`,
      count: s.length,
      average: `${avg(vals)} mg/dL`,
      highest: `${Math.max(...vals)} mg/dL`,
      lowest: `${Math.min(...vals)} mg/dL`,
      high: s.filter((r) => readingFlag(r) === "high").length,
      low: s.filter((r) => readingFlag(r) === "low").length,
      latest: s[s.length - 1],
    });
  }
  return out;
}
