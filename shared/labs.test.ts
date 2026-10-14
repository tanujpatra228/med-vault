import { describe, expect, it } from "vitest";
import { canonicalTest, flagOf, formatValue, parseRange, parseValue } from "./labs";

describe("canonicalTest", () => {
  it("maps the many ways labs print a test to one key", () => {
    for (const n of ["ESR", "E.S.R.", "Erythrocyte Sedimentation Rate", "ESR (Westergren)", "esr - 1st hour"]) expect(canonicalTest(n).key).toBe("esr");
    for (const n of ["CRP", "C-Reactive Protein", "CRP (Quantitative)", "hs-CRP"]) expect(canonicalTest(n).key).toBe("crp");
    expect(canonicalTest("SGPT").key).toBe("alt");
    expect(canonicalTest("S.G.O.T").key).toBe("ast");
    expect(canonicalTest("Glycated Haemoglobin (HbA1c)").key).toBe("hba1c");
    expect(canonicalTest("Haemoglobin").key).toBe("hb");
    expect(canonicalTest("Serum Creatinine").key).toBe("creatinine");
    expect(canonicalTest("25-OH Vitamin D").key).toBe("vitd");
  });
  it("keeps unknown tests under their own name", () => {
    expect(canonicalTest("HLA B27")).toEqual({ key: "x:hlab27", label: "HLA B27" });
    expect(canonicalTest("Anti-CCP").key).toBe("x:anticcp");
  });
});

describe("parseValue / parseRange / flagOf", () => {
  it("reads printed results", () => {
    expect(parseValue("42")).toBe(42);
    expect(parseValue("4.5 mg/dL")).toBe(4.5);
    expect(parseValue("<0.5")).toBe(0.5);
    expect(parseValue("1,50,000")).toBe(150000);
    expect(parseValue("Negative")).toBeNull();
    expect(parseValue("")).toBeNull();
  });
  it("reads normal ranges", () => {
    expect(parseRange("0-20")).toEqual({ low: 0, high: 20 });
    expect(parseRange("13.0 – 17.0 g/dL")).toEqual({ low: 13, high: 17 });
    expect(parseRange("< 5")).toEqual({ low: null, high: 5 });
    expect(parseRange("Up to 6")).toEqual({ low: null, high: 6 });
    expect(parseRange("> 40")).toEqual({ low: 40, high: null });
    expect(parseRange("1,50,000 - 4,10,000")).toEqual({ low: 150000, high: 410000 });
    expect(parseRange("Negative")).toEqual({ low: null, high: null });
  });
  it("flags out-of-range values", () => {
    expect(flagOf(42, 0, 20)).toBe("high");
    expect(flagOf(11, 13, 17)).toBe("low");
    expect(flagOf(15, 13, 17)).toBeNull();
    expect(flagOf(3, null, 5)).toBeNull();
    expect(flagOf(null, 0, 1)).toBeNull();
  });
  it("formats without float noise", () => expect(formatValue(0.1 + 0.2)).toBe("0.3"));
});
