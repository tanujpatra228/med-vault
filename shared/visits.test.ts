import { describe, expect, it } from "vitest";
import { addDaysIso, parseFollowUpDays } from "./visits";

describe("parseFollowUpDays", () => {
  it("reads English follow-up advice", () => {
    expect(parseFollowUpDays("Review after 2 weeks")).toBe(14);
    expect(parseFollowUpDays("Follow up after 15 days with reports")).toBe(15);
    expect(parseFollowUpDays("F/U 1 month")).toBe(30);
    expect(parseFollowUpDays("Review after 3 months, CBC LFT before visit")).toBe(90);
    expect(parseFollowUpDays("review after 10 days")).toBe(10);
    expect(parseFollowUpDays("Come back next week")).toBe(7);
    expect(parseFollowUpDays("review after one week")).toBe(7);
  });
  it("reads Hindi and Gujarati, including native digits", () => {
    expect(parseFollowUpDays("15 दिन बाद दिखाएं")).toBe(15);
    expect(parseFollowUpDays("1 महीने बाद")).toBe(30);
    expect(parseFollowUpDays("२ हफ्ते बाद")).toBe(14);
    expect(parseFollowUpDays("15 દિવસ પછી બતાવવું")).toBe(15);
    expect(parseFollowUpDays("૧ મહિને")).toBe(30);
  });
  it("ignores doses, strengths and text without an interval", () => {
    expect(parseFollowUpDays("Tab Meditrex 5 mg")).toBeNull();
    expect(parseFollowUpDays("Avoid oily food")).toBeNull();
    expect(parseFollowUpDays("SOS")).toBeNull();
    expect(parseFollowUpDays(null)).toBeNull();
  });
});

describe("addDaysIso", () => {
  it("crosses month ends", () => expect(addDaysIso("2026-10-20", 14)).toBe("2026-11-03"));
});
