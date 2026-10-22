import { describe, expect, it } from "vitest";
import { queriesFor } from "./prefetch";

const keys = (path: string) => queriesFor(path).map((q) => q.queryKey);

describe("queriesFor: the screen behind a link", () => {
  it("loads a medicine with its photos, and other single records", () => {
    expect(keys("/medications/m1")).toEqual([["medication", "m1"], ["files", "medication", "m1"]]);
    expect(keys("/reports/r1")).toEqual([["report", "r1"]]);
    expect(keys("/conditions/c1")).toEqual([["condition-timeline", "c1"]]);
  });
  it("loads a member's tab lists", () => {
    expect(keys("/m/a")).toEqual([["summary", "a"]]);
    expect(keys("/m/a/reports")).toEqual([["reports", "a", "all"]]);
    expect(keys("/m/a/health")).toEqual([["allergies", "a"], ["conditions", "a"]]);
  });
  it("skips forms and unknown pages", () => {
    expect(keys("/doctors/new")).toEqual([]);
    expect(keys("/m/a/edit")).toEqual([]);
    expect(keys("/settings")).toEqual([]);
    expect(keys("/reports/r1/edit")).toEqual([]);
  });
});
