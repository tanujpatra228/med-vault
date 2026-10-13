import { describe, expect, it } from "vitest";
import type { Schedule } from "@shared/schedule";
import { fromEditor, toEditor } from "./ScheduleEditor";

const roundTrip = (s: Schedule) => fromEditor(toEditor(s));

describe("schedule editor conversion", () => {
  it("round-trips the prescription's three medicines", () => {
    const meditrex: Schedule = { phases: [{ days: null, pattern: { type: "weekly", days: { sat: [2, 0, 0], sun: [1, 0, 0] } } }] };
    const homin: Schedule = { phases: [{ days: null, pattern: { type: "weekly", days: { mon: [1, 0, 0], tue: [1, 0, 0], wed: [1, 0, 0], thu: [1, 0, 0], fri: [1, 0, 0] } } }] };
    const omnacortil: Schedule = { phases: [{ days: 4, pattern: { type: "daily", dose: [1, 1, 0] } }, { days: 3, pattern: { type: "daily", dose: [1, 0.5, 0] } }] };
    expect(roundTrip(meditrex)).toEqual(meditrex);
    expect(roundTrip(homin)).toEqual(homin);
    expect(roundTrip(omnacortil)).toEqual(omnacortil);
  });

  it("groups weekdays with the same dose into one row", () => {
    const e = toEditor({ phases: [{ days: null, pattern: { type: "weekly", days: { mon: [1, 0, 0], wed: [1, 0, 0], sun: [2, 0, 0] } } }] });
    expect(e).toEqual({ mode: "days", rows: [{ days: ["mon", "wed"], dose: [1, 0, 0] }, { days: ["sun"], dose: [2, 0, 0] }] });
  });

  it("keeps schedules it cannot edit untouched", () => {
    const odd: Schedule = { phases: [{ days: 14, pattern: { type: "weekly", days: { mon: [1, 0, 0] } } }, { days: null, pattern: { type: "daily", dose: [1, 0, 0] } }] };
    expect(toEditor(odd)).toEqual({ mode: "custom", schedule: odd });
    expect(roundTrip(odd)).toEqual(odd);
  });

  it("keeps unparseable legacy text as text", () => {
    expect(toEditor(null, "2 puffs")).toEqual({ mode: "text", text: "2 puffs" });
    expect(fromEditor({ mode: "text", text: "2 puffs" })).toBeNull();
  });

  it("returns null until a dose is set", () => {
    expect(fromEditor(toEditor(null))).toBeNull();
    expect(fromEditor({ mode: "days", rows: [{ days: [], dose: [1, 0, 0] }] })).toBeNull();
  });
});
