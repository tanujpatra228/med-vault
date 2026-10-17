// Lab values: one row per test result on a report, so a test can be charted over time.
// See docs/LAB_TRENDS.md.

export interface LabTest {
  key: string;
  label: string;
  /** Names labs print for this test (matched case-insensitively, ignoring dots and spaces). */
  aliases: RegExp;
  unit?: string;
}

/**
 * Common tests, so "ESR", "E.S.R." and "Erythrocyte Sedimentation Rate" land on one chart.
 * Anything else is kept under its own name.
 */
export const LAB_TESTS: LabTest[] = [
  { key: "esr", label: "ESR", aliases: /^(esr|erythrocytesedimentationrate|sedrate|westergren)/, unit: "mm/hr" },
  { key: "crp", label: "CRP", aliases: /^(crp|creactiveprotein|hscrp|quantitativecrp|crpquantitative)/, unit: "mg/L" },
  { key: "hba1c", label: "HbA1c", aliases: /^(hba1c|glycatedhaemoglobin|glycatedhemoglobin|glycosylatedh(a)?emoglobin|a1c)/, unit: "%" },
  { key: "hb", label: "Haemoglobin", aliases: /^(hb|hgb|haemoglobin|hemoglobin)$/, unit: "g/dL" },
  { key: "wbc", label: "WBC (total count)", aliases: /^(wbc|tlc|totalleucocytecount|totalleukocytecount|totalwbccount|whitebloodcells?)/ },
  { key: "platelets", label: "Platelets", aliases: /^(platelets?|plateletcount|plt)/ },
  { key: "creatinine", label: "Creatinine", aliases: /^(s(erum)?creatinine|creatinine)/, unit: "mg/dL" },
  { key: "urea", label: "Urea", aliases: /^(bloodurea|s(erum)?urea|urea)$/, unit: "mg/dL" },
  { key: "alt", label: "ALT (SGPT)", aliases: /^(alt|sgpt|alanineaminotransferase|altsgpt|sgptalt)/, unit: "U/L" },
  { key: "ast", label: "AST (SGOT)", aliases: /^(ast|sgot|aspartateaminotransferase|astsgot|sgotast)/, unit: "U/L" },
  { key: "alp", label: "Alkaline phosphatase", aliases: /^(alp|alkalinephosphatase)/, unit: "U/L" },
  { key: "bilirubin", label: "Bilirubin (total)", aliases: /^(totalbilirubin|bilirubintotal|s(erum)?bilirubin)/, unit: "mg/dL" },
  { key: "glucose_fasting", label: "Glucose (fasting)", aliases: /^(fbs|fastingbloodsugar|fastingglucose|glucosefasting|bloodsugarfasting|fastingplasmaglucose|fpg)/, unit: "mg/dL" },
  { key: "glucose_pp", label: "Glucose (after meal)", aliases: /^(ppbs|postprandial|glucosepp|ppglucose|bloodsugarpp|plasmaglucosepp)/, unit: "mg/dL" },
  { key: "tsh", label: "TSH", aliases: /^(tsh|thyroidstimulatinghormone)/, unit: "µIU/mL" },
  { key: "vitd", label: "Vitamin D", aliases: /^(vitamind|25ohvitamind|25hydroxyvitamind|vitd|25ohd)/, unit: "ng/mL" },
  { key: "b12", label: "Vitamin B12", aliases: /^(vitaminb12|b12|cobalamin)/, unit: "pg/mL" },
  { key: "uric_acid", label: "Uric acid", aliases: /^(uricacid|s(erum)?uricacid)/, unit: "mg/dL" },
  { key: "cholesterol", label: "Cholesterol (total)", aliases: /^(totalcholesterol|cholesteroltotal|s(erum)?cholesterol)$/, unit: "mg/dL" },
  { key: "ldl", label: "LDL cholesterol", aliases: /^(ldl|ldlcholesterol|ldlc)/, unit: "mg/dL" },
  { key: "hdl", label: "HDL cholesterol", aliases: /^(hdl|hdlcholesterol|hdlc)/, unit: "mg/dL" },
  { key: "triglycerides", label: "Triglycerides", aliases: /^(triglycerides?|tg)$/, unit: "mg/dL" },
  { key: "sodium", label: "Sodium", aliases: /^(sodium|na|serumsodium)$/, unit: "mmol/L" },
  { key: "potassium", label: "Potassium", aliases: /^(potassium|k|serumpotassium)$/, unit: "mmol/L" },
  { key: "calcium", label: "Calcium", aliases: /^(calcium|ca|serumcalcium)$/, unit: "mg/dL" },
  { key: "ra_factor", label: "RA factor", aliases: /^(ra|rafactor|rheumatoidfactor|rf)$/, unit: "IU/mL" },
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The test a printed name stands for: a known test, or the name itself as its own key. */
export function canonicalTest(name: string): { key: string; label: string } {
  const plain = squash(name.replace(/\(.*?\)/g, ""));
  const full = squash(name);
  const known = LAB_TESTS.find((t) => t.aliases.test(plain) || t.aliases.test(full));
  if (known) return { key: known.key, label: known.label };
  const label = name.trim().replace(/\s+/g, " ").slice(0, 80);
  return { key: `x:${plain.slice(0, 60) || "test"}`, label };
}

/** A printed result as a number: "42", "4.5", "<0.5" (→ 0.5), "1,50,000". Null for text like "Negative". */
export function parseValue(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;
  const s = String(raw).replace(/,/g, "").trim();
  const m = s.match(/^[<>≤≥]?=?\s*(-?\d+(?:\.\d+)?)(?:\s*[a-zA-Zµ/%^0-9.\s]*)?$/);
  return m ? Number(m[1]) : null;
}

/** A printed normal range: "0-20", "0 – 20", "< 5", "Up to 6", "> 40", "13.0 - 17.0". */
export function parseRange(raw: string | null | undefined): { low: number | null; high: number | null } {
  const none = { low: null, high: null };
  if (!raw) return none;
  const s = raw.replace(/,/g, "").toLowerCase();
  const between = s.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const upper = s.match(/(?:<|≤|up\s*to|upto|less than|below)\s*=?\s*(\d+(?:\.\d+)?)/);
  if (upper) return { low: null, high: Number(upper[1]) };
  const lower = s.match(/(?:>|≥|more than|above|greater than)\s*=?\s*(\d+(?:\.\d+)?)/);
  if (lower) return { low: Number(lower[1]), high: null };
  return none;
}

/**
 * Multiplier a printed text implies: "1.5 - 4.0 lac/cmm" is ×100,000, "10^3/µL" ×1,000, "mill/cmm"
 * ×1,000,000. Null when it names none. migrations/0010 mirrors this in SQL for saved results.
 */
export function scaleOf(text: string | null | undefined): number | null {
  if (!text) return null;
  if (/\b(?:lacs?|lakhs?)\b/i.test(text)) return 100_000;
  if (/thousand|10\s*[\^*]\s*3\b|10³|\bk\s*\/\s*(?:µl|ul|cmm|mm3)/i.test(text)) return 1_000;
  if (/\bmill(?:ions?)?\b|10\s*[\^*]\s*6\b|10⁶/i.test(text)) return 1_000_000;
  return null;
}

/**
 * The normal range on the same scale as the result. Labs often print the result in one scale and the
 * range in another ("406000 /cmm" against "1.5 - 4.0 lac/cmm"). A range without its own multiplier
 * is taken to share the unit column's; the result's multiplier comes from its text, else the unit.
 */
export function rangeFor(refText: string | null | undefined, valueText: string | null | undefined, unit: string | null | undefined) {
  const { low, high } = parseRange(refText);
  const factor = (scaleOf(refText) ?? scaleOf(unit) ?? 1) / (scaleOf(valueText) ?? scaleOf(unit) ?? 1);
  const fix = (v: number | null) => (v === null || factor === 1 ? v : Math.round(v * factor * 1e6) / 1e6);
  return { low: fix(low), high: fix(high) };
}

export type LabFlag = "high" | "low" | null;

export function flagOf(value: number | null, low: number | null, high: number | null): LabFlag {
  if (value === null) return null;
  if (high !== null && value > high) return "high";
  if (low !== null && value < low) return "low";
  return null;
}

/** "42", "4.5", "1.5 L" style display without float noise. */
export const formatValue = (v: number) => {
  const r = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  // Big counts grouped the Indian way: 406000 → "4,06,000".
  return Math.abs(r) >= 10_000 ? r.toLocaleString("en-IN") : String(r);
};
