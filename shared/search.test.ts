import { describe, expect, it } from "vitest";
import { likePattern, searchTerms } from "./search";

describe("searchTerms", () => {
  it("splits, lowercases and de-duplicates words", () => {
    expect(searchTerms("  Dr  SHAH eye dr ")).toEqual(["dr", "shah", "eye"]);
    expect(searchTerms("मेथोट्रेक्सेट")).toEqual(["मेथोट्रेक्सेट"]);
  });
  it("ignores queries that are too short and caps the word count", () => {
    expect(searchTerms("a")).toEqual([]);
    expect(searchTerms(" ")).toEqual([]);
    expect(searchTerms("a b c d e f g h")).toHaveLength(6);
  });
});

describe("likePattern", () => {
  it("escapes LIKE wildcards", () => {
    expect(likePattern("50%")).toBe("%50\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("c:\\x")).toBe("%c:\\\\x%");
  });
});
