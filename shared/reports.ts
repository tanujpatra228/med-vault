import { REPORT_TYPES, type ReportType } from "./types";

const ORDER = REPORT_TYPES.map((t) => t.value);

/**
 * A report can cover several tests (blood and urine from one lab visit). `reports.report_type`
 * holds them comma-separated, in the order of REPORT_TYPES: "blood", "blood,urine".
 */
export function reportTypes(value: string | null | undefined): ReportType[] {
  const set = new Set((value ?? "").split(",").map((s) => s.trim()));
  return ORDER.filter((t) => set.has(t));
}

/** Valid types, deduplicated and ordered; "other" when none. */
export function joinReportTypes(types: Iterable<string>): string {
  const list = reportTypes([...types].join(","));
  const real = list.length > 1 ? list.filter((t) => t !== "other") : list;
  return real.length ? real.join(",") : "other";
}

/** "Blood test", "Blood test + Urine test". */
export function reportTypeLabel(value: string | null | undefined): string {
  const labels = reportTypes(value).map((t) => REPORT_TYPES.find((r) => r.value === t)!.label);
  return labels.length ? labels.join(" + ") : "Report";
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  report_date: string;
  report_type: string;
  lab_name: string | null;
  /** Its results as `test_key|value_text` (lowercase, no spaces). */
  values: string[];
}

export interface DuplicateMatch {
  id: string;
  title: string;
  report_date: string;
  lab_name: string | null;
  /** Results that are the same in both. */
  matched: number;
  reason: "same-results" | "same-date";
}

export const resultKey = (testKey: string, valueText: string) => `${testKey}|${valueText.toLowerCase().replace(/\s+/g, "")}`;

/**
 * Saved reports that look like the one about to be saved (the same report scanned twice, or a
 * photo and the PDF of it). Strong match: most results identical (the date may have been misread).
 * Weak match: same date and type, when neither has results to compare (X-ray, ECG).
 */
export function findDuplicates(
  incoming: { report_date: string; report_type: string; values: string[] },
  saved: DuplicateCandidate[],
): DuplicateMatch[] {
  const mine = new Set(incoming.values);
  const myTypes = new Set(reportTypes(incoming.report_type));
  const out: DuplicateMatch[] = [];
  for (const r of saved) {
    const theirs = new Set(r.values);
    const matched = [...mine].filter((v) => theirs.has(v)).length;
    const smaller = Math.min(mine.size, theirs.size);
    const sameDate = r.report_date === incoming.report_date;
    const base = { id: r.id, title: r.title, report_date: r.report_date, lab_name: r.lab_name, matched };
    if (smaller > 0 && matched >= Math.max(1, Math.ceil(smaller * (sameDate ? 0.5 : 0.8))) && (sameDate || matched >= 3)) out.push({ ...base, reason: "same-results" });
    else if (sameDate && mine.size === 0 && theirs.size === 0 && reportTypes(r.report_type).some((t) => myTypes.has(t))) out.push({ ...base, reason: "same-date" });
  }
  return out.sort((a, b) => b.matched - a.matched);
}
