import { describe, expect, it } from "vitest";
import { ESTIMATE, neuronsFor } from "./aiBudget";

const SCOUT = "@cf/meta/llama-4-scout-17b-16e-instruct";

describe("neuronsFor", () => {
  it("prices input and output tokens separately", () => {
    // 1M input tokens = 24,545 neurons; 1M output = 77,273.
    expect(neuronsFor(SCOUT, "prescription", { prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(24_545);
    expect(neuronsFor(SCOUT, "review", { prompt_tokens: 0, completion_tokens: 1_000_000 })).toBe(77_273);
    expect(neuronsFor(SCOUT, "review", { prompt_tokens: 900, completion_tokens: 300 })).toBe(45.27);
  });
  it("falls back to the measured estimate without token counts or for unknown models", () => {
    expect(neuronsFor(SCOUT, "prescription", undefined)).toBe(ESTIMATE.prescription);
    expect(neuronsFor("mock", "review", { prompt_tokens: 10, completion_tokens: 10 })).toBe(ESTIMATE.review);
  });
});
