import { describe, expect, it } from "vitest";
import { coursesIn, medicineCourses, takingOn } from "./courses";
import type { Medication } from "./types";

const med = (over: Partial<Medication>): Medication => ({
  id: Math.random().toString(36).slice(2),
  member_id: "m1",
  prescription_id: null,
  doctor_id: null,
  condition_id: null,
  name: "X",
  strength: null,
  form: "tablet",
  dosage: null,
  schedule: null,
  timing: null,
  start_date: null,
  end_date: null,
  status: "active",
  notes: null,
  created_at: "",
  updated_at: "2026-10-16T10:00:00Z",
  ...over,
});
const TODAY = "2026-10-19";

describe("medicineCourses", () => {
  it("a dose change from a new prescription is one course with two segments", () => {
    const [c] = medicineCourses(
      [
        med({ id: "a", name: "Omnacortil 20 Tablet DT", strength: "20 mg", dosage: "1-1-0", start_date: "2026-09-30", end_date: "2026-10-16", status: "stopped" }),
        med({ id: "b", name: "Omnacortil 20", strength: "20 mg", dosage: "1-0-0", start_date: "2026-10-17" }),
      ],
      TODAY,
    );
    expect(c.name).toBe("Omnacortil");
    expect(c.segments).toEqual([
      { medId: "a", from: "2026-09-30", to: "2026-10-16", dose: "20 mg · 1-1-0" },
      { medId: "b", from: "2026-10-17", to: null, dose: "20 mg · 1-0-0" },
    ]);
  });
  it("a restart weeks later is a separate course", () => {
    const cs = medicineCourses(
      [med({ name: "Dolo 650", start_date: "2026-08-01", end_date: "2026-08-05" }), med({ name: "Dolo 650", start_date: "2026-10-01", end_date: "2026-10-03" })],
      TODAY,
    );
    expect(cs).toHaveLength(2);
  });
  it("ongoing, finished, stopped-without-date, and no start date", () => {
    const cs = medicineCourses(
      [
        med({ name: "Meditrex", start_date: "2026-10-17" }),
        med({ name: "Pan 40", start_date: "2026-09-01", end_date: "2026-09-10" }),
        med({ name: "Zerodol", start_date: "2026-09-01", status: "stopped" }),
        med({ name: "Old", start_date: null }),
      ],
      TODAY,
    );
    expect(cs.map((c) => [c.name, c.segments[0].to])).toEqual([
      ["Pan", "2026-09-10"],
      ["Zerodol", "2026-10-16"],
      ["Meditrex", null],
    ]);
  });
  it("finds what was taken on a day and in a window", () => {
    const cs = medicineCourses([med({ name: "Meditrex", start_date: "2026-10-17" }), med({ name: "Pan", start_date: "2026-09-01", end_date: "2026-09-10" })], TODAY);
    expect(takingOn(cs, "2026-10-18")).toEqual(["Meditrex"]);
    expect(takingOn(cs, "2026-09-05")).toEqual(["Pan"]);
    expect(coursesIn(cs, "2026-09-11", "2026-10-01")).toEqual([]);
  });
});
