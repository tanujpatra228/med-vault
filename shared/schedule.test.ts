import { describe, expect, it } from "vitest";
import {
  describe as describeSchedule,
  doseSentence,
  endDateOf,
  formatDays,
  formatDose,
  isTaper,
  isWeekly,
  normalizeSchedule,
  parseDose,
  scheduleFromDosage,
  scheduleOf,
  summary,
  todayStatus,
  type Schedule,
} from "./schedule";

// The prescription that motivated this feature (docs/DOSAGE_SCHEDULES.md).
// 2026-10-10 is a Saturday.
const meditrex: Schedule = { phases: [{ days: null, pattern: { type: "weekly", days: { sat: [2, 0, 0], sun: [1, 0, 0] } } }] };
const homin: Schedule = {
  phases: [{ days: null, pattern: { type: "weekly", days: { mon: [1, 0, 0], tue: [1, 0, 0], wed: [1, 0, 0], thu: [1, 0, 0], fri: [1, 0, 0] } } }],
};
const omnacortil: Schedule = {
  phases: [
    { days: 4, pattern: { type: "daily", dose: [1, 1, 0] } },
    { days: 3, pattern: { type: "daily", dose: [1, 0.5, 0] } },
  ],
};
const afterMeal = { timing: "After meal", form: "tablet" };

describe("doses", () => {
  it("parses halves in every common way", () => {
    expect(parseDose("1-1/2-0")).toEqual([1, 0.5, 0]);
    expect(parseDose("1-½-0")).toEqual([1, 0.5, 0]);
    expect(parseDose("1½-0-1")).toEqual([1.5, 0, 1]);
    expect(parseDose([2, "0", 0])).toEqual([2, 0, 0]);
    expect(parseDose("0.5-0-0")).toEqual([0.5, 0, 0]);
  });
  it("rejects bad doses", () => {
    expect(parseDose("1-0")).toBeNull();
    expect(parseDose("1-1-1-1")).toBeNull();
    expect(parseDose("a-0-1")).toBeNull();
    expect(parseDose([-1, 0, 0])).toBeNull();
    expect(parseDose([20, 0, 0])).toBeNull();
  });
  it("formats halves", () => {
    expect(formatDose([1, 0.5, 0])).toBe("1-½-0");
    expect(formatDose([1.5, 0, 2])).toBe("1½-0-2");
  });
  it("uses meal words when the timing mentions food", () => {
    expect(doseSentence([1, 0.5, 0], afterMeal)).toBe("1 after breakfast, ½ after lunch");
    expect(doseSentence([1, 0, 1], { timing: "Before food" })).toBe("1 before breakfast, 1 before dinner");
    expect(doseSentence([1, 0, 1])).toBe("1 in the morning, 1 at night");
  });
});

describe("weekdays", () => {
  it("compresses runs", () => {
    expect(formatDays(["mon", "tue", "wed", "thu", "fri"])).toBe("Mon–Fri");
    expect(formatDays(["sat", "sun"])).toBe("Sat, Sun");
    expect(formatDays(["mon", "wed", "fri"])).toBe("Mon, Wed, Fri");
    expect(formatDays(["mon", "tue", "wed", "thu", "fri"], true)).toBe("Monday to Friday");
  });
});

describe("Meditrex: weekly, different dose on Saturday and Sunday", () => {
  it("summarizes and describes", () => {
    expect(summary(meditrex)).toBe("Sat 2-0-0 · Sun 1-0-0");
    expect(isWeekly(meditrex)).toBe(true);
    expect(describeSchedule(meditrex, "2026-10-10", afterMeal)).toEqual([
      {
        heading: null,
        lines: ["Saturday: 2 after breakfast.", "Sunday: 1 after breakfast.", "Nothing on Monday to Friday.", "3 tablets a week."],
      },
    ]);
  });
  it("knows what is due each day", () => {
    expect(todayStatus(meditrex, "2026-10-10", "2026-10-10", afterMeal)).toMatchObject({ kind: "due", text: "2 after breakfast" });
    expect(todayStatus(meditrex, "2026-10-10", "2026-10-11", afterMeal)).toMatchObject({ kind: "due", text: "1 after breakfast" });
    expect(todayStatus(meditrex, "2026-10-10", "2026-10-13", afterMeal)).toMatchObject({ kind: "rest", next: "2026-10-17" });
  });
});

describe("Homin: Monday to Friday", () => {
  it("summarizes", () => expect(summary(homin)).toBe("Mon–Fri 1-0-0"));
  it("is due on weekdays only", () => {
    expect(todayStatus(homin, "2026-10-10", "2026-10-13")).toMatchObject({ kind: "due" });
    expect(todayStatus(homin, "2026-10-10", "2026-10-10")).toMatchObject({ kind: "rest", next: "2026-10-12" });
  });
});

describe("Omnacortil: taper with a half tablet", () => {
  it("summarizes and describes each step with dates", () => {
    expect(summary(omnacortil)).toBe("1-1-0 (4 days) → 1-½-0 (3 days)");
    expect(isTaper(omnacortil)).toBe(true);
    expect(describeSchedule(omnacortil, "2026-10-06", afterMeal)).toEqual([
      { heading: "Days 1–4 (until 9 Oct)", lines: ["Every day: 1 after breakfast, 1 after lunch."] },
      { heading: "Days 5–7 (until 12 Oct)", lines: ["Every day: 1 after breakfast, ½ after lunch."] },
    ]);
  });
  it("moves through the steps and then finishes", () => {
    expect(todayStatus(omnacortil, "2026-10-06", "2026-10-09", afterMeal)).toMatchObject({ kind: "due", text: "1 after breakfast, 1 after lunch", phase: 0 });
    expect(todayStatus(omnacortil, "2026-10-06", "2026-10-10", afterMeal)).toMatchObject({ kind: "due", text: "1 after breakfast, ½ after lunch", phase: 1 });
    expect(todayStatus(omnacortil, "2026-10-06", "2026-10-12", afterMeal)).toMatchObject({ kind: "due", phase: 1 });
    expect(todayStatus(omnacortil, "2026-10-06", "2026-10-13", afterMeal)).toEqual({ kind: "finished", ended: "2026-10-12" });
    expect(endDateOf(omnacortil, "2026-10-06")).toBe("2026-10-12");
  });
  it("has not started before its start date", () => {
    expect(todayStatus(omnacortil, "2026-10-20", "2026-10-13")).toEqual({ kind: "not_started", starts: "2026-10-20" });
  });
});

describe("other patterns", () => {
  it("alternate days", () => {
    const s: Schedule = { phases: [{ days: null, pattern: { type: "interval", every: 2, dose: [1, 0, 0] } }] };
    expect(summary(s)).toBe("1-0-0 every 2 days");
    expect(todayStatus(s, "2026-10-10", "2026-10-12")).toMatchObject({ kind: "due" });
    expect(todayStatus(s, "2026-10-10", "2026-10-13")).toMatchObject({ kind: "rest", next: "2026-10-14" });
  });
  it("as needed", () => {
    const s = scheduleFromDosage("As needed")!;
    expect(summary(s)).toBe("When needed");
    expect(todayStatus(s, null, "2026-10-13")).toEqual({ kind: "as_needed", note: null });
  });
});

describe("normalizeSchedule (untrusted input)", () => {
  it("accepts a bare pattern and day names in any form", () => {
    expect(normalizeSchedule({ type: "weekly", days: { Saturday: "2-0-0", SUN: [1, 0, 0] } })).toEqual(meditrex);
  });
  it("accepts Hindi and Gujarati day names", () => {
    const s = normalizeSchedule({ type: "weekly", days: { "शनिवार": [2, 0, 0], "રવિવાર": [1, 0, 0] } });
    expect(s).toEqual(meditrex);
  });
  it("accepts JSON text", () => expect(normalizeSchedule(JSON.stringify(omnacortil))).toEqual(omnacortil));
  it("drops phases after an open-ended one", () => {
    const s = normalizeSchedule({ phases: [{ days: null, pattern: { type: "daily", dose: [1, 0, 0] } }, { days: 3, pattern: { type: "daily", dose: [1, 0, 1] } }] });
    expect(s?.phases).toHaveLength(1);
  });
  it("drops zero-dose weekdays and rejects empty or broken schedules", () => {
    expect(normalizeSchedule({ type: "weekly", days: { mon: [1, 0, 0], tue: [0, 0, 0] } })).toEqual({
      phases: [{ days: null, pattern: { type: "weekly", days: { mon: [1, 0, 0] } } }],
    });
    expect(normalizeSchedule({ type: "weekly", days: { funday: [1, 0, 0] } })).toBeNull();
    expect(normalizeSchedule({ type: "daily", dose: [0, 0, 0] })).toBeNull();
    expect(normalizeSchedule({ phases: [{ days: 0, pattern: { type: "daily", dose: [1, 0, 0] } }] })).toBeNull();
    expect(normalizeSchedule({ type: "interval", every: 1, dose: [1, 0, 0] })).toBeNull();
    expect(normalizeSchedule("not json")).toBeNull();
    expect(normalizeSchedule(null)).toBeNull();
  });
  it("falls back to the legacy dosage text", () => {
    expect(scheduleOf({ schedule: null, dosage: "1-0-1" })).toEqual({ phases: [{ days: null, pattern: { type: "daily", dose: [1, 0, 1] } }] });
    expect(scheduleOf({ schedule: null, dosage: "2 puffs" })).toBeNull();
    expect(scheduleOf({ schedule: JSON.stringify(meditrex), dosage: "old" })).toEqual(meditrex);
  });
});
