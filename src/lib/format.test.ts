import { describe, expect, it } from "vitest";
import { addDays, relativeDays, sameName } from "./format";

describe("addDays", () => {
  it("adds calendar days across month ends", () => {
    expect(addDays("2026-10-05", 5)).toBe("2026-10-10");
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });
});

describe("sameName", () => {
  it("matches doctors written differently", () => {
    expect(sameName("Dr. S. Rao", "Dr Rao")).toBe(true);
    expect(sameName("Dr. Suresh Rao", "S Rao")).toBe(true);
    expect(sameName("Arthritis", "rheumatoid arthritis")).toBe(true);
  });
  it("does not match different people", () => {
    expect(sameName("Dr. Iyer", "Dr. Rao")).toBe(false);
    expect(sameName("Dr. Anil Rao", "Dr. Meena Rao")).toBe(false);
    expect(sameName("", "Rao")).toBe(false);
  });
});

describe("relativeDays with timestamps", () => {
  it("treats any time today as today", () => {
    const late = new Date();
    late.setHours(23, 59, 0, 0);
    const early = new Date();
    early.setHours(0, 1, 0, 0);
    expect(relativeDays(late.toISOString())).toBe("today");
    expect(relativeDays(early.toISOString())).toBe("today");
  });
});
