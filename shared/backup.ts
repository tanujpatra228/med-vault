// The backup format: data.json inside the backup ZIP. See docs/BACKUP.md.

import type { Allergy, Condition, Doctor, FileMeta, Medication, Member, Prescription, Report, Visit } from "./types";

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
  /** Added in app version with visits; older backups have none. */
  visits?: Visit[];
  /** Records linked to several conditions; older backups only have each record's condition_id. */
  record_conditions?: ConditionLink[];
  files: BackupFile[];
}

export interface ConditionLink {
  owner_type: "prescription" | "medication" | "report" | "visit";
  owner_id: string;
  condition_id: string;
}

/** Record tables in the order a restore must insert them (parents before children). */
export const RESTORE_ORDER = ["doctors", "members", "conditions", "allergies", "prescriptions", "medications", "reports", "visits"] as const;
export type RestoreTable = (typeof RESTORE_ORDER)[number];

/** Rows per restore request: about 150 × 20 µs of validation stays well inside 10 ms of CPU. */
export const RESTORE_CHUNK = 150;

/** Old id → new id for each table, returned by a restore so the app can re-attach files. */
export type RestoreIdMap = Record<RestoreTable, Record<string, string>>;
