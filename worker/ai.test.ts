import { describe, expect, it } from "vitest";
import { dosage, followUp, normalize, parseJsonObject, splitDiagnoses } from "./ai";
import { normalizeReview } from "./review";

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
    expect(r).toEqual({ kind: "report", data: { title: "CBC", report_type: "blood", report_date: "2026-10-03", lab_name: null, findings: null, values: [] } });
    const both = normalize("report", { report_types: ["urine", "Blood", "xray"] });
    expect(both.kind === "report" && both.data.report_type).toBe("blood,urine");
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

describe("prescription schedules", () => {
  const scan = (raw: Record<string, unknown>) => {
    const r = normalize("prescription", raw);
    if (r.kind !== "prescription") throw new Error("wrong kind");
    return r.data.medications;
  };

  it("keeps a weekly schedule with Hindi day names and string doses", () => {
    const [m] = scan({ medications: [{ name: "Meditrex", schedule: { type: "weekly", days: { "शनिवार": "2-0-0", sunday: [1, 0, 0] } } }] });
    expect(m.schedule).toEqual({ phases: [{ days: null, pattern: { type: "weekly", days: { sat: [2, 0, 0], sun: [1, 0, 0] } } }] });
  });

  it("keeps a taper with a half tablet", () => {
    const [m] = scan({
      medications: [{ name: "Omnacortil", schedule: { phases: [{ days: 4, pattern: { type: "daily", dose: [1, 1, 0] } }, { days: 3, pattern: { type: "daily", dose: "1-1/2-0" } }] } }],
    });
    expect(m.schedule?.phases.map((p) => p.days)).toEqual([4, 3]);
    expect(m.schedule?.phases[1].pattern).toEqual({ type: "daily", dose: [1, 0.5, 0] });
  });

  it("falls back to the dosage when the schedule is missing or broken", () => {
    const [a, b] = scan({ medications: [{ name: "A", dosage: "BD" }, { name: "B", dosage: "1-0-0", schedule: { type: "weekly", days: { funday: [1, 0, 0] } } }] });
    expect(a.schedule).toEqual({ phases: [{ days: null, pattern: { type: "daily", dose: [1, 0, 1] } }] });
    expect(b.schedule).toEqual({ phases: [{ days: null, pattern: { type: "daily", dose: [1, 0, 0] } }] });
  });
});

// What Llama 4 Scout actually returned for the methotrexate prescription (docs/DOSAGE_SCHEDULES.md):
// wrong weekdays for Meditrex, Homin as daily, Omnacortil split into two concurrent medicines.
const realScan = {
  medications: [
    {
      name: "Meditrex 5mg Tablet (Methotrexate)", strength: "5mg", form: "tablet", timing: "After breakfast", duration_days: 7,
      schedule: { type: "weekly", days: { fri: [1, 0, 0], sat: [2, 0, 0] } },
      dose_text: "हर शनिवार 2-0-0 हर रविवार 1-0-0", frequency_text: "3 tablet per week After breakfast",
    },
    {
      name: "Homin (B6+B9+B12)", form: "tablet", timing: "After Meal", duration_days: 7, dosage: "1-0-0",
      schedule: { type: "daily", dose: [1, 0, 0] }, dose_text: "हर सोम से शुक्र 1-0-0", frequency_text: "5 days a week After Meal",
    },
    { name: "Omnacortil 20 Tablet DT (Prednisolone)", strength: "20mg", form: "tablet", timing: "After Meal", duration_days: 4,
      schedule: { type: "daily", dose: [1, 1, 0] }, dose_text: "1 tablet", frequency_text: "1-1-0 After Meal" },
    { name: "Omnacortil 20 Tablet DT (Prednisolone)", strength: "20mg", form: "tablet", timing: "After Meal", duration_days: 3,
      schedule: { type: "daily", dose: [1, 0.5, 0] }, dose_text: null, frequency_text: "1-1/2-0 After Meal" },
  ],
};

describe("real scan of the methotrexate prescription", () => {
  const r = normalize("prescription", realScan);
  const meds = r.kind === "prescription" ? r.data.medications : [];

  it("corrects Meditrex weekdays from the written Hindi text", () => {
    expect(meds[0].schedule).toEqual({ phases: [{ days: null, pattern: { type: "weekly", days: { sat: [2, 0, 0], sun: [1, 0, 0] } } }] });
    expect(meds[0].warnings).toEqual([]);
  });

  it("corrects Homin to Monday to Friday", () => {
    const p = meds[1].schedule?.phases[0].pattern;
    expect(p?.type === "weekly" && Object.keys(p.days)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(meds[1].warnings).toEqual([]);
  });

  it("joins the two Omnacortil rows into one changing dose", () => {
    expect(meds).toHaveLength(3);
    expect(meds[2].schedule).toEqual({
      phases: [
        { days: 4, pattern: { type: "daily", dose: [1, 1, 0] } },
        { days: 3, pattern: { type: "daily", dose: [1, 0.5, 0] } },
      ],
    });
    expect(meds[2].duration_days).toBe(7);
  });
});

describe("continuation rows", () => {
  it("joins a nameless follow-on row to the medicine above", () => {
    const r = normalize("prescription", {
      medications: [
        { name: "Wysolone 10", duration_days: 5, schedule: { type: "daily", dose: [2, 0, 0] } },
        { name: null, duration_days: 5, schedule: { type: "daily", dose: [1, 0, 0] } },
      ],
    });
    const meds = r.kind === "prescription" ? r.data.medications : [];
    expect(meds).toHaveLength(1);
    expect(meds[0].schedule?.phases.map((p) => p.days)).toEqual([5, 5]);
  });

  it("does not join different medicines or rows without a known first duration", () => {
    const r = normalize("prescription", {
      medications: [
        { name: "Pan 40", schedule: { type: "daily", dose: [1, 0, 0] } },
        { name: "Pan 40", schedule: { type: "daily", dose: [1, 0, 0] } },
        { name: "Dolo 650", duration_days: 3, schedule: { type: "daily", dose: [1, 1, 1] } },
      ],
    });
    expect(r.kind === "prescription" && r.data.medications).toHaveLength(3);
  });
});

describe("sanity checks", () => {
  const check = (m: Record<string, unknown>) => {
    const r = normalize("prescription", { medications: [m] });
    return r.kind === "prescription" ? r.data.medications[0].warnings : [];
  };
  it("flags methotrexate that is not weekly", () => {
    expect(check({ name: "Folitrax 7.5", schedule: { type: "daily", dose: [1, 0, 0] } })[0]).toMatch(/once a week/);
  });
  it("flags a weekly frequency read as daily", () => {
    expect(check({ name: "Homin", schedule: { type: "daily", dose: [1, 0, 0] }, frequency_text: "5 days a week" })[0]).toMatch(/every day/);
  });
  it("flags weekly totals and day counts that disagree with the frequency", () => {
    const w = check({ name: "X", schedule: { type: "weekly", days: { sat: [2, 0, 0] } }, frequency_text: "3 tablet per week" });
    expect(w[0]).toMatch(/3 per week, but these days add up to 2/);
    expect(check({ name: "Y", schedule: { type: "weekly", days: { mon: [1, 0, 0] } }, frequency_text: "5 days a week" })[0]).toMatch(/5 days a week, but 1 day is selected/);
  });
});

describe("splitDiagnoses", () => {
  it("splits the prescription's diagnosis line and drops ICD codes", () => {
    expect(splitDiagnoses(["ANKYLOSING SPONDYLITIS - M45.9 | PERIPHERAL SPONDYLOARTHRITIS - M46.90 | PRIMARY HYPERTENSION - I10"])).toEqual([
      "Ankylosing Spondylitis",
      "Peripheral Spondyloarthritis",
      "Primary Hypertension",
    ]);
  });
  it("accepts a list, commas and 'and', keeps normal casing, removes duplicates", () => {
    expect(splitDiagnoses([["Type 2 diabetes", "Hypertension"], "hypertension and Acute left eye uveitis"].flat())).toEqual([
      "Type 2 diabetes",
      "Hypertension",
      "Acute left eye uveitis",
    ]);
    expect(splitDiagnoses([null, "", "  "])).toEqual([]);
  });
  it("does not mistake vitamin names for ICD codes", () => {
    expect(splitDiagnoses(["Vitamin B12 deficiency - E53.8", "Hypertension (I10)"])).toEqual(["Vitamin B12 deficiency", "Hypertension"]);
  });
  it("fills condition and conditions on a prescription scan", () => {
    const r = normalize("prescription", { conditions: ["Uveitis, Arthritis"] });
    expect(r.kind === "prescription" && [r.data.condition, r.data.conditions]).toEqual(["Uveitis", ["Uveitis", "Arthritis"]]);
  });
});

describe("normalizeReview (medicine review reply)", () => {
  const names = ["Meditrex", "Nexito 10", "Zerodol-P"];
  it("keeps valid items, maps names case-insensitively and drops unknown medicines", () => {
    const out = normalizeReview(
      {
        generics: { meditrex: "Methotrexate", "Nexito 10": "escitalopram", Unknown: "x" },
        items: [
          { level: "note", medicines: ["nexito 10"], title: "Sleep", question: "Take it at night?", why: "Can cause drowsiness." },
          { level: "talk_soon", medicines: ["Meditrex", "Ibuprofen"], title: "MTX + NSAID", question: "Is this safe?" },
          { level: "weird", medicines: ["Zerodol-P"], title: "Level falls back", question: "Q?" },
          { level: "ask", medicines: ["Nope"], title: "Unknown medicine only", question: "Q?" },
          { level: "ask", medicines: ["Meditrex"], title: "", question: "No title" },
        ],
      },
      names,
    );
    expect(out.generics).toEqual({ Meditrex: "methotrexate", "Nexito 10": "escitalopram" });
    expect(out.items.map((i) => [i.level, i.title, i.medicines.join()])).toEqual([
      ["talk_soon", "MTX + NSAID", "Meditrex"],
      ["ask", "Level falls back", "Zerodol-P"],
      ["note", "Sleep", "Nexito 10"],
    ]);
  });
  it("survives junk", () => expect(normalizeReview({ items: "no" }, names)).toEqual({ generics: {}, items: [] }));
});

describe("followUp (next visit from a prescription)", () => {
  it("reads the interval from the advice text, not the model's day count", () => {
    expect(followUp({ follow_up: "Review after 2 weeks", follow_up_days: 10 }, "2026-10-05")).toEqual({ follow_up_text: "Review after 2 weeks", follow_up_on: "2026-10-19" });
  });
  it("falls back to the model's days, then the notes", () => {
    expect(followUp({ follow_up: "Next visit as advised", follow_up_days: 30 }, "2026-10-05").follow_up_on).toBe("2026-11-04");
    expect(followUp({ notes: "Avoid NSAIDs. 15 दिन बाद दिखाएं" }, "2026-10-05").follow_up_on).toBe("2026-10-20");
  });
  it("ignores a made-up day count without any advice text", () => {
    expect(followUp({ follow_up_days: 7 }, "2026-10-05")).toEqual({ follow_up_text: null, follow_up_on: null });
  });
});
