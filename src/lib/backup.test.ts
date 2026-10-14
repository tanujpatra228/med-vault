import { describe, expect, it } from "vitest";
import type { BackupData } from "@shared/backup";
import { assignPaths } from "./backup";
import { backupHtml } from "./backupHtml";

const at = "2026-10-14T00:00:00.000Z";
const data = {
  format: "med-vault-backup",
  version: 1,
  exported_at: at,
  vault: { name: "Patra family", created_at: at },
  members: [{ id: "m1", name: "Mom/Maa", relation: "Mother", dob: null, sex: null, blood_group: "B+", notes: null, photo_file_id: null, created_at: at, updated_at: at }],
  doctors: [{ id: "d1", name: "Dr Rao", specialty: "Rheumatology", clinic: null, phone: null, address: null, notes: null, created_at: at, updated_at: at }],
  conditions: [],
  allergies: [{ id: "a1", member_id: "m1", allergen: "Penicillin <b>", kind: "drug", reaction: null, severity: "severe", noted_on: null, notes: null, created_at: at, updated_at: at }],
  prescriptions: [{ id: "p1", member_id: "m1", doctor_id: "d1", condition_id: null, prescribed_on: "2026-10-10", notes: null, created_at: at, updated_at: at }],
  medications: [],
  reports: [{ id: "r1", member_id: "m1", doctor_id: null, condition_id: null, title: "CBC", report_type: "blood", report_date: "2026-10-01", lab_name: null, notes: null, created_at: at, updated_at: at }],
  files: [
    { id: "f1", member_id: "m1", owner_type: "prescription", owner_id: "p1", name: "IMG.jpg", mime_type: "image/jpeg", size: 1, created_at: at },
    { id: "f2", member_id: "m1", owner_type: "prescription", owner_id: "p1", name: "IMG2.jpg", mime_type: "image/jpeg", size: 1, created_at: at },
    { id: "f3", member_id: "m1", owner_type: "report", owner_id: "r1", name: "cbc.pdf", mime_type: "application/pdf", size: 1, created_at: at },
  ],
} as unknown as BackupData;

describe("backup", () => {
  it("gives every file a readable, unique, safe path", () => {
    expect(assignPaths(data).map((f) => f.path)).toEqual([
      "files/Mom_Maa/2026-10-10 Prescription Dr Rao 1.jpg",
      "files/Mom_Maa/2026-10-10 Prescription Dr Rao 2.jpg",
      "files/Mom_Maa/2026-10-01 CBC 1.pdf",
    ]);
  });

  it("builds a readable page with escaped text and links to the files", () => {
    const html = backupHtml({ ...data, files: assignPaths(data) });
    expect(html).toContain("Penicillin &lt;b&gt;");
    expect(html).not.toContain("Penicillin <b>");
    expect(html).toContain('src="files/Mom_Maa/2026-10-10%20Prescription%20Dr%20Rao%201.jpg"');
    expect(html).toContain("cbc.pdf (PDF)");
  });
});
