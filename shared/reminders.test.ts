import { describe, expect, it } from "vitest";
import { backupMessage, DEFAULT_PREFS, doseMessage, dueEvents, followUpMessage, localNow, normalizePrefs, type ReminderMed } from "./reminders";

const med = (over: Partial<ReminderMed>): ReminderMed => ({
  member_id: "m1",
  member_name: "Maa",
  name: "X",
  strength: null,
  form: "tablet",
  timing: null,
  schedule: null,
  dosage: null,
  start_date: "2026-10-01",
  end_date: null,
  status: "active",
  ...over,
});

const meditrex = med({ name: "Meditrex", strength: "5 mg", timing: "After breakfast", schedule: JSON.stringify({ phases: [{ days: null, pattern: { type: "weekly", days: { sat: [2, 0, 0], sun: [1, 0, 0] } } }] }) });
const homin = med({ name: "Homin", schedule: JSON.stringify({ phases: [{ days: null, pattern: { type: "weekly", days: { mon: [1, 0, 0], tue: [1, 0, 0], wed: [1, 0, 0], thu: [1, 0, 0], fri: [1, 0, 0] } } }] }) });
const omnacortil = med({
  name: "Omnacortil",
  strength: "20",
  timing: "After meal",
  start_date: "2026-10-06",
  schedule: JSON.stringify({ phases: [{ days: 4, pattern: { type: "daily", dose: [1, 1, 0] } }, { days: 3, pattern: { type: "daily", dose: [1, 0.5, 0] } }] }),
});
const metformin = med({ member_id: "m2", member_name: "Papa", name: "Metformin", dosage: "1-0-1" });

describe("localNow", () => {
  it("uses the phone's time zone", () => {
    // 02:45 UTC is 08:15 in India.
    expect(localNow("Asia/Kolkata", new Date("2026-10-10T02:45:00Z"))).toEqual({ date: "2026-10-10", minutes: 8 * 60 + 15 });
    // 20:00 UTC on the 9th is already the 10th in India.
    expect(localNow("Asia/Kolkata", new Date("2026-10-09T20:00:00Z")).date).toBe("2026-10-10");
    expect(localNow("Not/AZone", new Date("2026-10-10T02:45:00Z")).minutes).toBe(8 * 60 + 15);
  });
});

describe("dueEvents", () => {
  it("fires each reminder from its time until 90 minutes late", () => {
    expect(dueEvents(DEFAULT_PREFS, { date: "2026-10-10", minutes: 7 * 60 + 59 })).toEqual([]);
    expect(dueEvents(DEFAULT_PREFS, { date: "2026-10-10", minutes: 8 * 60 + 2 }).map((e) => e.key)).toEqual(["dose:2026-10-10:0"]);
    expect(dueEvents(DEFAULT_PREFS, { date: "2026-10-10", minutes: 9 * 60 + 5 }).map((e) => e.key)).toEqual(["dose:2026-10-10:0", "followup:2026-10-10", "backup:2026-10-10"]);
    expect(dueEvents(DEFAULT_PREFS, { date: "2026-10-10", minutes: 9 * 60 + 31 }).map((e) => e.key)).toEqual(["followup:2026-10-10", "backup:2026-10-10"]);
  });
  it("respects switched-off reminders", () => {
    expect(dueEvents({ ...DEFAULT_PREFS, dose: false, followups: false, backup: false }, { date: "2026-10-10", minutes: 9 * 60 + 5 })).toEqual([]);
  });
});

describe("doseMessage", () => {
  const all = [meditrex, homin, omnacortil, metformin];
  it("Saturday morning: weekly methotrexate, the taper, and Papa's metformin; no Homin", () => {
    // 2026-10-10 is a Saturday, day 5 of the Omnacortil taper (second step).
    expect(doseMessage(0, all, "2026-10-10", true)).toEqual({
      title: "Morning medicines",
      body: "Maa: Meditrex 5 mg: 2 after breakfast · Omnacortil 20: 1 after breakfast\nPapa: Metformin: 1",
      url: "/",
      tag: "dose-0",
    });
  });
  it("afternoon shows the taper's half tablet", () => {
    expect(doseMessage(1, all, "2026-10-10", true)?.body).toBe("Maa: Omnacortil 20: ½ after lunch");
  });
  it("hides names when asked, and is null when nothing is due", () => {
    expect(doseMessage(0, all, "2026-10-10", false)?.body).toBe("Maa: 2 medicines · Papa: 1 medicine");
    expect(doseMessage(2, [meditrex, homin], "2026-10-10", true)).toBeNull();
  });
  it("a single medicine names the person in the title and opens their profile", () => {
    expect(doseMessage(0, [homin], "2026-10-12", true)).toMatchObject({ title: "Morning medicines: Maa", url: "/m/m1" });
  });
  it("skips stopped and finished medicines", () => {
    expect(doseMessage(0, [med({ ...metformin, status: "stopped" }), med({ ...metformin, end_date: "2026-10-01" })], "2026-10-10", true)).toBeNull();
  });
});

describe("followUpMessage", () => {
  const f = { visit_id: "v1", member_name: "Maa", doctor_name: "Dr Shah", follow_up_on: "2026-10-11", follow_up_note: "Bring CBC" };
  it("reminds the day before and on the day", () => {
    expect(followUpMessage([f], "2026-10-10", true)).toEqual({ title: "Follow-up visit", body: "Tomorrow: Maa with Dr Shah (Bring CBC)", url: "/visits/v1", tag: "follow-up" });
    expect(followUpMessage([f], "2026-10-11", false)?.body).toBe("Today: Maa");
    expect(followUpMessage([f], "2026-10-09", true)).toBeNull();
  });
});

describe("backupMessage", () => {
  const now = new Date("2026-10-10T04:00:00Z");
  it("nudges only after 30 days without a backup", () => {
    expect(backupMessage("2026-10-01T00:00:00Z", now)).toBeNull();
    expect(backupMessage("2026-08-01T00:00:00Z", now)?.title).toBe("Time for a backup");
    expect(backupMessage(null, now)?.url).toBe("/settings");
  });
});

describe("normalizePrefs", () => {
  it("keeps valid values and falls back for the rest", () => {
    expect(normalizePrefs({ dose: false, times: ["07:30", "25:00"], members: ["a", 3], details: false })).toEqual({
      ...DEFAULT_PREFS,
      dose: false,
      times: ["07:30", "14:00", "21:00"],
      members: ["a"],
      details: false,
    });
    expect(normalizePrefs("junk")).toEqual(DEFAULT_PREFS);
  });
});
