import { describe, expect, it } from "vitest";
import type { LabValue, Medication } from "@shared/types";
import { changeText, groupTrends, medicineMarkers } from "./labs";

let n = 0;
const v = (test_key: string, date: string, value: number | null, extra: Partial<LabValue> = {}): LabValue => ({
  id: `v${++n}`, member_id: "m", report_id: `r-${date}`, test_key, test_name: test_key.toUpperCase(), value, value_text: value === null ? "Positive" : String(value),
  unit: "mm/hr", ref_low: 0, ref_high: 20, ref_text: "0-20", flag: value !== null && value > 20 ? "high" : null, position: 0,
  created_at: `${date}T00:00:00Z`, updated_at: "", report_date: date, report_title: "Report", ...extra,
});

describe("groupTrends", () => {
  const trends = groupTrends([
    v("esr", "2026-08-01", 58), v("esr", "2026-10-03", 18), v("esr", "2026-09-01", 42),
    v("crp", "2026-10-03", 12, { ref_high: 5, ref_text: "<5", flag: "high", unit: "mg/L" }),
    v("x:hlab27", "2026-08-01", null, { ref_low: null, ref_high: null }),
  ]);
  it("groups by test, oldest first, out-of-range latest first", () => {
    expect(trends.map((t) => t.key)).toEqual(["crp", "esr", "x:hlab27"]);
    expect(trends[1].points.map((p) => p.value)).toEqual([58, 42, 18]);
    expect(trends[1].label).toBe("ESR");
    expect(trends[2].points).toEqual([]);
  });
  it("describes the latest change", () => {
    expect(changeText(trends[1])).toBe("Down from 42 to 18 · back in normal range");
    expect(changeText(trends[0])).toBeNull();
  });
});

describe("medicineMarkers", () => {
  it("marks starts and ended courses", () => {
    const meds = [
      { name: "Meditrex 5", start_date: "2026-08-10", end_date: null, status: "active" },
      { name: "Omnacortil 20", start_date: "2026-08-10", end_date: "2026-08-16", status: "active" },
    ] as Medication[];
    expect(medicineMarkers(meds).map((m) => m.label)).toEqual(["Meditrex started", "Omnacortil started", "Omnacortil stopped"]);
  });
});
