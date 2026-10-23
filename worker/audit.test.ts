import { describe, expect, it } from "vitest";
import { auditFor, clientOf, fieldNames } from "./audit";
import { describeAudit } from "../shared/audit";

describe("auditFor: which requests go in the security log", () => {
  it("logs record changes with ids and field names only", () => {
    expect(auditFor("POST", "/api/medications", 201, { name: "Meditrex", member_id: "m1" }, { id: "x1", member_id: "m1", name: "Meditrex" })).toEqual({
      action: "record.create",
      record_type: "medication",
      record_id: "x1",
      member_id: "m1",
    });
    const edit = auditFor("PATCH", "/api/medications/x1", 200, { dosage: "1-0-1", notes: "after food" }, { id: "x1", member_id: "m1" });
    expect(edit).toEqual({ action: "record.update", record_type: "medication", record_id: "x1", member_id: "m1", detail: { fields: ["dosage", "notes"] } });
    expect(JSON.stringify(edit)).not.toContain("after food");
    expect(auditFor("DELETE", "/api/reports/r1", 200, null, { ok: true })).toEqual({ action: "record.delete", record_type: "report", record_id: "r1" });
  });
  it("a new member is its own member", () => {
    expect(auditFor("POST", "/api/members", 201, { name: "Maa" }, { id: "m9", name: "Maa" })?.member_id).toBe("m9");
  });
  it("skips reads, failures, checks and a reading sent twice", () => {
    expect(auditFor("GET", "/api/medications", 200, null, null)).toBeNull();
    expect(auditFor("PATCH", "/api/medications/x1", 400, {}, null)).toBeNull();
    expect(auditFor("POST", "/api/labs/duplicates", 200, {}, null)).toBeNull();
    expect(auditFor("POST", "/api/push/subscription/find", 200, {}, null)).toBeNull();
    expect(auditFor("POST", "/api/readings", 200, { id: "u1" }, { id: "u1" })).toBeNull();
  });
  it("logs device, backup, consent and AI events", () => {
    expect(auditFor("DELETE", "/api/vault/devices/d2", 200, null, null)).toEqual({ action: "device.remove", record_type: "device", record_id: "d2" });
    expect(auditFor("GET", "/api/vault/export", 200, null, null)?.action).toBe("backup.export");
    expect(auditFor("PUT", "/api/vault/ai-consent", 200, { allow: false }, null)).toEqual({ action: "consent.ai", detail: { allow: false } });
    expect(auditFor("POST", "/api/ai/scan", 200, { kind: "report", image: "data:..." }, null)).toEqual({ action: "ai.scan", detail: { kind: "report" } });
    expect(auditFor("PUT", "/api/labs/report/r1", 200, { values: [] }, null)).toMatchObject({ action: "record.update", record_type: "lab_results", record_id: "r1" });
    expect(auditFor("POST", "/api/vault/recovery-key", 200, null, null)?.action).toBe("recovery_key.rotate");
  });
});

describe("helpers", () => {
  it("names the kind of phone", () => {
    expect(clientOf("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Android");
    expect(clientOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(clientOf(undefined)).toBe("Other");
  });
  it("keeps field names, not odd keys", () => {
    expect(fieldNames({ id: "1", dosage: "x", "Bad Key": 1 })).toEqual(["dosage"]);
  });
  it("describes entries in plain words", () => {
    expect(describeAudit({ action: "record.create", record_type: "allergy", detail: null })).toBe("added an allergy");
    expect(describeAudit({ action: "device.remove", record_type: "device", detail: { device_name: "Pixel" } })).toBe('removed the phone "Pixel"');
    expect(describeAudit({ action: "ai.scan", record_type: null, detail: { kind: "prescription" } })).toBe("read a prescription with AI");
  });
});
