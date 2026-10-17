import { describe, expect, it } from "vitest";
import { bpFlag, readingText, sugarFlag, summarize, type Reading } from "./readings";

const r = (over: Partial<Reading>): Reading => ({
  id: Math.random().toString(36),
  member_id: "m1",
  kind: "bp",
  taken_at: "2026-10-10T08:00",
  systolic: null,
  diastolic: null,
  pulse: null,
  sugar: null,
  context: null,
  notes: null,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("flags", () => {
  it("blood pressure: high from 140/90, low below 90/60", () => {
    expect(bpFlag(128, 82)).toBeNull();
    expect(bpFlag(140, 80)).toBe("high");
    expect(bpFlag(130, 90)).toBe("high");
    expect(bpFlag(88, 70)).toBe("low");
    expect(bpFlag(120, null)).toBeNull();
  });
  it("blood sugar depends on when it was taken", () => {
    expect(sugarFlag(95, "fasting")).toBeNull();
    expect(sugarFlag(110, "fasting")).toBe("high");
    expect(sugarFlag(130, "after_meal")).toBeNull();
    expect(sugarFlag(150, "after_meal")).toBe("high");
    expect(sugarFlag(65, "random")).toBe("low");
    expect(sugarFlag(120, null)).toBeNull();
  });
});

describe("summarize", () => {
  const readings = [
    r({ systolic: 138, diastolic: 86, taken_at: "2026-10-01T08:00" }),
    r({ systolic: 152, diastolic: 94, taken_at: "2026-10-05T08:00" }),
    r({ systolic: 126, diastolic: 80, taken_at: "2026-10-09T08:00" }),
    r({ kind: "sugar", sugar: 108, context: "fasting" }),
    r({ kind: "sugar", sugar: 96, context: "fasting" }),
    r({ kind: "sugar", sugar: 182, context: "after_meal" }),
  ];
  it("averages, extremes and out-of-range counts per series", () => {
    const [bp, fasting, after] = summarize(readings);
    expect(bp).toMatchObject({ key: "bp", count: 3, average: "139/87", highest: "152/94", lowest: "126/80", high: 1, low: 0 });
    expect(bp.latest.taken_at).toBe("2026-10-09T08:00");
    expect(fasting).toMatchObject({ key: "fasting", count: 2, average: "102 mg/dL", high: 1 });
    expect(after).toMatchObject({ key: "after_meal", count: 1, high: 1 });
    expect(summarize([])).toEqual([]);
  });
  it("formats readings", () => {
    expect(readingText(readings[0])).toBe("138/86");
    expect(readingText(readings[3])).toBe("108 mg/dL");
  });
});
