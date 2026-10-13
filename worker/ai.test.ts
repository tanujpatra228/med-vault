import { describe, expect, it } from "vitest";
import { dosage, normalize, parseJsonObject } from "./ai";

describe("parseJsonObject", () => {
  it("reads plain JSON", () => expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 }));
  it("reads JSON wrapped in prose and fences", () => expect(parseJsonObject('Sure:\n```json\n{"name":"Dolo"}\n```')).toEqual({ name: "Dolo" }));
  it("passes through an object reply", () => expect(parseJsonObject({ name: "x" })).toEqual({ name: "x" }));
  it("rejects garbage", () => {
    expect(parseJsonObject("no json here")).toBeNull();
    expect(parseJsonObject("{broken")).toBeNull();
    expect(parseJsonObject("[1,2]")).toBeNull();
    expect(parseJsonObject(42)).toBeNull();
  });
});

describe("normalize prescription", () => {
  const scan = (raw: Record<string, unknown>) => {
    const r = normalize("prescription", raw);
    if (r.kind !== "prescription") throw new Error("wrong kind");
    return r.data;
  };

  it("converts Indian DD/MM/YYYY dates", () => {
    expect(scan({ prescribed_on: "05/10/2026" }).prescribed_on).toBe("2026-10-05");
    expect(scan({ prescribed_on: "5-3-26" }).prescribed_on).toBe("2026-03-05");
    expect(scan({ prescribed_on: "2026-01-09" }).prescribed_on).toBe("2026-01-09");
  });

  it("drops impossible, future and unreadable dates", () => {
    expect(scan({ prescribed_on: "31/02/2026" }).prescribed_on).toBeNull();
    expect(scan({ prescribed_on: "2099-01-01" }).prescribed_on).toBeNull();
    expect(scan({ prescribed_on: "yesterday" }).prescribed_on).toBeNull();
  });

  it("cleans medicines and skips nameless ones", () => {
    const d = scan({
      medications: [
        { name: "Tab. Moxicip", strength: "400 mg", form: "Tablet", dosage: "1-0-1", duration_days: 5 },
        { name: "", strength: "10 mg" },
        { name: "Refresh", form: "spray", duration_days: -3 },
        "not an object",
      ],
    });
    expect(d.medications).toHaveLength(2);
    expect(d.medications[0]).toMatchObject({ name: "Moxicip", form: "tablet", dosage: "1-0-1", duration_days: 5 });
    expect(d.medications[1]).toMatchObject({ name: "Refresh", form: null, duration_days: null });
  });

  it("turns 'null' / 'unknown' strings into null", () => {
    const d = scan({ doctor_name: "null", doctor_specialty: "Unknown", notes: "  " });
    expect(d).toMatchObject({ doctor_name: null, doctor_specialty: null, notes: null, medications: [] });
  });
});

describe("normalize report and medicine", () => {
  it("keeps only known report types", () => {
    const r = normalize("report", { title: "CBC", report_type: "Blood", report_date: "03.10.2026" });
    expect(r).toEqual({ kind: "report", data: { title: "CBC", report_type: "blood", report_date: "2026-10-03", lab_name: null, findings: null } });
    const bad = normalize("report", { report_type: "xray" });
    expect(bad.kind === "report" && bad.data.report_type).toBeNull();
  });

  it("normalizes a medicine strip", () => {
    expect(normalize("medicine", { name: "Dolo 650", strength: 650, form: "TABLET" })).toEqual({
      kind: "medicine",
      data: { name: "Dolo 650", strength: "650", form: "tablet", notes: null },
    });
  });
});

describe("dosage", () => {
  it("expands prescription shorthand", () => {
    expect(dosage("BD")).toBe("1-0-1");
    expect(dosage("t.d.s.")).toBe("1-1-1");
    expect(dosage("HS")).toBe("0-0-1");
    expect(dosage("sos")).toBe("As needed");
  });
  it("keeps explicit patterns and unknown text", () => {
    expect(dosage("1-0-1")).toBe("1-0-1");
    expect(dosage("2 puffs")).toBe("2 puffs");
    expect(dosage(null)).toBeNull();
  });
});
