import { describe, expect, it } from "vitest";
import { validEndpoint } from "./reminders";

describe("validEndpoint", () => {
  it("accepts the push services phones use", () => {
    expect(validEndpoint("https://fcm.googleapis.com/fcm/send/abc:def", false)).toBe(true);
    expect(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x", false)).toBe(true);
    expect(validEndpoint("https://web.push.apple.com/QG", false)).toBe(true);
  });
  it("refuses anything else, so the Worker never posts to arbitrary URLs", () => {
    expect(validEndpoint("https://evil.example/fcm.googleapis.com", false)).toBe(false);
    expect(validEndpoint("https://fcm.googleapis.com.evil.example/x", false)).toBe(false);
    expect(validEndpoint("http://fcm.googleapis.com/x", false)).toBe(false);
    expect(validEndpoint("http://localhost:9999/push", false)).toBe(false);
    expect(validEndpoint("not a url", false)).toBe(false);
    expect(validEndpoint(42, false)).toBe(false);
  });
  it("allows localhost only in local development", () => expect(validEndpoint("http://localhost:9999/push", true)).toBe(true));
});
