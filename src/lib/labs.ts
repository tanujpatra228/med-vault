import type { LabValue, Medication } from "@shared/types";
import { formatValue, LAB_TESTS } from "@shared/labs";
import type { ChartMarker, ChartPoint } from "@/components/LabChart";

export interface Trend {
  key: string;
  label: string;
  unit: string | null;
  points: ChartPoint[];
  results: LabValue[];
  latest: LabValue;
  previous: LabValue | null;
  /** Normal range from the latest result that printed one. */
  low: number | null;
  high: number | null;
}

/** Groups a member's results (oldest first) by test. Tests with a numeric value get points. */
export function groupTrends(values: LabValue[]): Trend[] {
  const by = new Map<string, LabValue[]>();
  for (const v of values) by.set(v.test_key, [...(by.get(v.test_key) ?? []), v]);
  const trends: Trend[] = [];
  for (const [key, results] of by) {
    const sorted = [...results].sort((a, b) => (a.report_date ?? "").localeCompare(b.report_date ?? "") || a.created_at.localeCompare(b.created_at));
    const latest = sorted[sorted.length - 1];
    const ranged = [...sorted].reverse().find((r) => r.ref_low !== null || r.ref_high !== null);
    trends.push({
      key,
      label: LAB_TESTS.find((t) => t.key === key)?.label ?? latest.test_name,
      unit: latest.unit ?? [...sorted].reverse().find((r) => r.unit)?.unit ?? null,
      points: sorted.filter((r) => r.value !== null && r.report_date).map((r) => ({ date: r.report_date!, value: r.value!, flag: r.flag })),
      results: sorted,
      latest,
      previous: sorted.length > 1 ? sorted[sorted.length - 2] : null,
      low: ranged?.ref_low ?? null,
      high: ranged?.ref_high ?? null,
    });
  }
  // Out of range first, then most recently tested.
  return trends.sort((a, b) => Number(!!b.latest.flag) - Number(!!a.latest.flag) || (b.latest.report_date ?? "").localeCompare(a.latest.report_date ?? ""));
}

/** "Down from 58 to 42" / "Up from 4 to 6" / "Same as last time", for the latest two numeric results. */
export function changeText(tr: Trend): string | null {
  const n = tr.points.length;
  if (n < 2) return null;
  const [a, b] = [tr.points[n - 2].value, tr.points[n - 1].value];
  if (a === b) return "Same as last time";
  const back = tr.points[n - 2].flag && !tr.points[n - 1].flag ? " · back in normal range" : "";
  return `${b < a ? "Down" : "Up"} from ${formatValue(a)} to ${formatValue(b)}${back}`;
}

/** Medicine start/stop dates as chart annotations. */
export function medicineMarkers(meds: Medication[]): ChartMarker[] {
  const out: ChartMarker[] = [];
  for (const m of meds) {
    const name = m.name.split(" ")[0];
    if (m.start_date) out.push({ date: m.start_date, label: `${name} started` });
    if (m.end_date && (m.status === "stopped" || m.end_date < new Date().toISOString().slice(0, 10))) out.push({ date: m.end_date, label: `${name} stopped` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
