import { describe, expect, it } from "vitest";
import { prepareValues } from "./labs";
import { normalize } from "./ai";

describe("prepareValues", () => {
  it("works out the test, number, range and flag; keeps text results", () => {
    const out = prepareValues([
      { test_name: "E.S.R.", value_text: "42", unit: "mm/hr", ref_text: "0 - 20" },
      { test_name: "HLA B27", value_text: "Positive", unit: null, ref_text: "Negative" },
      { test_name: "", value_text: "1" },
      { test_name: "No value", value_text: "" },
      "junk",
    ]);
    expect(out).toEqual([
      { test_key: "esr", test_name: "E.S.R.", value: 42, value_text: "42", unit: "mm/hr", ref_low: 0, ref_high: 20, ref_text: "0 - 20", flag: "high", position: 0 },
      { test_key: "x:hlab27", test_name: "HLA B27", value: null, value_text: "Positive", unit: null, ref_low: null, ref_high: null, ref_text: "Negative", flag: null, position: 1 },
    ]);
  });
  it("ignores anything that is not a list", () => expect(prepareValues({ a: 1 })).toEqual([]));
});

describe("report scan values", () => {
  it("keeps each printed row and drops rows without a name or value", () => {
    const r = normalize("report", { title: "CBC", values: [{ name: "Hb", value: 11.2, unit: "g/dL", range: "12-15" }, { name: "MCV" }, null] });
    expect(r.kind === "report" && r.data.values).toEqual([{ test_name: "Hb", value_text: "11.2", unit: "g/dL", ref_text: "12-15" }]);
  });
});
