import { describe, expect, it } from "vitest";
import { findDuplicates, joinReportTypes, reportTypeLabel, reportTypes, resultKey, type DuplicateCandidate } from "./reports";

describe("report types", () => {
  it("keeps several, in a fixed order, and drops unknown ones", () => {
    expect(reportTypes("urine,blood,xray")).toEqual(["blood", "urine"]);
    expect(joinReportTypes(["urine", "blood", "blood"])).toBe("blood,urine");
    expect(joinReportTypes(["other", "urine"])).toBe("urine");
    expect(joinReportTypes([])).toBe("other");
    expect(reportTypeLabel("blood,urine")).toBe("Blood test + Urine test");
    expect(reportTypeLabel("blood")).toBe("Blood test");
    expect(reportTypeLabel(null)).toBe("Report");
  });
});

describe("findDuplicates", () => {
  const cbc = ["hb|11.2", "esr|42", "crp|12", "wbc|8600", "x:sugar|negative"];
  const saved: DuplicateCandidate[] = [
    { id: "r1", title: "CBC", report_date: "2026-10-12", report_type: "blood,urine", lab_name: "City Lab", values: cbc },
    { id: "r2", title: "Older CBC", report_date: "2026-08-01", report_type: "blood", lab_name: null, values: ["hb|10.9", "esr|30", "crp|8"] },
    { id: "r3", title: "Knee X-ray", report_date: "2026-10-12", report_type: "imaging", lab_name: null, values: [] },
  ];

  it("finds the same report scanned again", () => {
    expect(findDuplicates({ report_date: "2026-10-12", report_type: "blood", values: cbc }, saved).map((d) => [d.id, d.reason, d.matched])).toEqual([["r1", "same-results", 5]]);
  });
  it("finds it even when the date was read differently, if most results match", () => {
    expect(findDuplicates({ report_date: "2026-12-10", report_type: "blood", values: cbc.slice(0, 4) }, saved).map((d) => d.id)).toEqual(["r1"]);
  });
  it("a new report with some equal values is not a duplicate", () => {
    expect(findDuplicates({ report_date: "2026-10-20", report_type: "blood", values: ["hb|11.2", "esr|20", "crp|3", "wbc|7000"] }, saved)).toEqual([]);
  });
  it("same date and type, no results on either: possible duplicate", () => {
    expect(findDuplicates({ report_date: "2026-10-12", report_type: "imaging", values: [] }, saved).map((d) => [d.id, d.reason])).toEqual([["r3", "same-date"]]);
    expect(findDuplicates({ report_date: "2026-10-12", report_type: "ecg", values: [] }, saved)).toEqual([]);
  });
  it("normalises values", () => {
    expect(resultKey("esr", " 42 MM ")).toBe("esr|42mm");
  });
});
