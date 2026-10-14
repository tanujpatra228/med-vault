// The backup format: data.json inside the backup ZIP. See docs/BACKUP.md.

import type { Allergy, Condition, Doctor, FileMeta, Medication, Member, Prescription, Report } from "./types";

export const BACKUP_FORMAT = "med-vault-backup";
export const BACKUP_VERSION = 1;

/** A file's record, plus where its bytes sit inside the ZIP (set by the app when it builds the ZIP). */
export interface BackupFile extends FileMeta {
  path?: string;
}

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  vault: { name: string; created_at: string };
  members: Member[];
  doctors: Doctor[];
  conditions: Condition[];
  allergies: Allergy[];
  prescriptions: Prescription[];
  medications: Medication[];
  reports: Report[];
  files: BackupFile[];
}

/** Record tables in the order a restore must insert them (parents before children). */
export const RESTORE_ORDER = ["doctors", "members", "conditions", "allergies", "prescriptions", "medications", "reports"] as const;
export type RestoreTable = (typeof RESTORE_ORDER)[number];

/** Old id → new id for each table, returned by a restore so the app can re-attach files. */
export type RestoreIdMap = Record<RestoreTable, Record<string, string>>;
