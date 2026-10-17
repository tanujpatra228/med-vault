// Types shared by the Worker API and the React app.

import type { Schedule } from "./schedule";

export type ID = string;

export interface Member {
  id: ID;
  name: string;
  relation: string | null;
  dob: string | null;
  sex: string | null;
  blood_group: string | null;
  notes: string | null;
  photo_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberListItem extends Member {
  active_med_count: number;
  allergy_count: number;
  active_condition_count: number;
  last_activity: string | null;
}

export interface Doctor {
  id: ID;
  name: string;
  specialty: string | null;
  clinic: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctorListItem extends Doctor {
  member_names: string | null;
  last_seen: string | null;
}

export type AllergyKind = "drug" | "food" | "other";
export type Severity = "mild" | "moderate" | "severe";

export interface Allergy {
  id: ID;
  member_id: ID;
  allergen: string;
  kind: AllergyKind;
  reaction: string | null;
  severity: Severity;
  noted_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConditionStatus = "active" | "resolved";

export interface Condition {
  id: ID;
  member_id: ID;
  name: string;
  status: ConditionStatus;
  diagnosed_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type MedStatus = "active" | "stopped";

export interface Medication {
  id: ID;
  member_id: ID;
  prescription_id: ID | null;
  doctor_id: ID | null;
  condition_id: ID | null;
  name: string;
  strength: string | null;
  form: string | null;
  dosage: string | null;
  /** JSON Schedule (shared/schedule.ts); read it with scheduleOf(). */
  schedule: string | null;
  timing: string | null;
  start_date: string | null;
  end_date: string | null;
  status: MedStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  doctor_name?: string | null;
  doctor_specialty?: string | null;
  /** All linked conditions' names, "Arthritis, Uveitis". */
  condition_name?: string | null;
  /** All linked condition ids, comma-separated. */
  condition_ids?: string | null;
}

export interface Prescription {
  id: ID;
  member_id: ID;
  doctor_id: ID | null;
  condition_id: ID | null;
  prescribed_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  doctor_name?: string | null;
  doctor_specialty?: string | null;
  /** All linked conditions' names, "Arthritis, Uveitis". */
  condition_name?: string | null;
  /** All linked condition ids, comma-separated. */
  condition_ids?: string | null;
  med_count?: number;
  file_count?: number;
  cover_file_id?: string | null;
}

export interface PrescriptionDetail extends Prescription {
  medications: Medication[];
  /** The visit this prescription was written at (holds the follow-up). */
  visit: Visit | null;
  files: FileMeta[];
}

export type ReportType = "blood" | "urine" | "imaging" | "scan" | "ecg" | "other";

export interface Report {
  id: ID;
  member_id: ID;
  condition_id: ID | null;
  doctor_id: ID | null;
  title: string;
  /** One or more types, comma-separated ("blood,urine"). See shared/reports.ts. */
  report_type: string;
  report_date: string;
  lab_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  doctor_name?: string | null;
  /** All linked conditions' names, "Arthritis, Uveitis". */
  condition_name?: string | null;
  /** All linked condition ids, comma-separated. */
  condition_ids?: string | null;
  file_count?: number;
  cover_file_id?: string | null;
}

export interface ReportDetail extends Report {
  files: FileMeta[];
  values: LabValue[];
}

export interface Visit {
  id: ID;
  member_id: ID;
  doctor_id: ID | null;
  condition_id: ID | null;
  prescription_id: ID | null;
  visit_date: string;
  reason: string | null;
  notes: string | null;
  follow_up_on: string | null;
  follow_up_note: string | null;
  /** 1 once the next visit was logged or the follow-up dismissed. */
  follow_up_done: number;
  created_at: string;
  updated_at: string;
  // joined
  doctor_name?: string | null;
  doctor_specialty?: string | null;
  /** All linked conditions' names, "Arthritis, Uveitis". */
  condition_name?: string | null;
  /** All linked condition ids, comma-separated. */
  condition_ids?: string | null;
}

/** An open follow-up, for the home screen and the member summary. */
export interface FollowUp {
  visit_id: ID;
  member_id: ID;
  member_name: string;
  doctor_id: ID | null;
  doctor_name: string | null;
  doctor_specialty: string | null;
  doctor_phone: string | null;
  follow_up_on: string;
  follow_up_note: string | null;
  visit_date: string;
}

/** One test result on a report. */
export interface LabValue {
  id: ID;
  member_id: ID;
  report_id: ID;
  test_key: string;
  test_name: string;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  flag: "high" | "low" | null;
  position: number;
  created_at: string;
  updated_at: string;
  // joined
  report_date?: string;
  report_title?: string;
}

/** A result as entered or read by AI, before the server works out the numbers. */
export interface LabDraft {
  test_name: string;
  value_text: string | null;
  unit: string | null;
  ref_text: string | null;
}

/** One event in a condition's care thread. */
export interface TimelineItem {
  type: "prescription" | "medication" | "report" | "visit";
  id: string;
  date: string | null;
  title: string;
  subtitle: string | null;
  href: string;
  /** Report: results out of range. */
  flags?: number;
  /** Open follow-up from this visit. */
  follow_up_on?: string | null;
}

export interface ConditionTimeline {
  condition: Condition;
  medications: Medication[];
  items: TimelineItem[];
  doctors: Array<{ id: string; name: string; specialty: string | null }>;
}

export type FileOwner = "member" | "prescription" | "report" | "medication";

export interface FileMeta {
  id: ID;
  member_id: ID | null;
  owner_type: FileOwner;
  owner_id: ID;
  name: string | null;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface MemberSummary {
  member: Member;
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  latest_report: Report | null;
  latest_prescription: Prescription | null;
  doctors: Array<Pick<Doctor, "id" | "name" | "specialty" | "phone"> & { med_count: number }>;
}

export type MedicationInput = Partial<Omit<Medication, "id" | "created_at" | "updated_at" | "schedule">> & { name: string; schedule?: Schedule | null };

export interface PrescriptionCreateInput {
  member_id: ID;
  doctor_id?: ID | null;
  /** Every condition this prescription is for; its medicines and visit get the same. */
  condition_ids?: ID[];
  prescribed_on: string;
  notes?: string | null;
  /** Logged on the visit created with the prescription. */
  follow_up_on?: string | null;
  follow_up_note?: string | null;
  medications?: MedicationInput[];
}

export const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: "blood", label: "Blood test" },
  { value: "urine", label: "Urine test" },
  { value: "imaging", label: "X-ray / imaging" },
  { value: "scan", label: "CT / MRI / Ultrasound" },
  { value: "ecg", label: "ECG / heart" },
  { value: "other", label: "Other" },
];

export const MED_FORMS = ["tablet", "capsule", "syrup", "drops", "ointment", "injection", "inhaler", "other"] as const;

export type AuthState =
  | { authenticated: false }
  | {
      authenticated: true;
      vault: { id: ID; name: string; consent_version: number | null; ai_consent: boolean };
      device: { id: ID; name: string };
    };

export interface DeviceInfo {
  id: ID;
  name: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface VaultInfo {
  id: ID;
  name: string;
  consent_version: number | null;
  consent_at: string | null;
  ai_consent_at: string | null;
  contact_email: string | null;
  created_at: string;
  devices: DeviceInfo[];
  storage: { bytes: number; files: number };
}

export interface LinkCode {
  code: string;
  expires_at: string;
}

// ---------- AI capture (Phase 2) ----------

export type ScanKind = "prescription" | "medicine" | "report";

export interface ScannedMedicine {
  name: string;
  strength: string | null;
  form: (typeof MED_FORMS)[number] | null;
  dosage: string | null;
  schedule: Schedule | null;
  timing: string | null;
  duration_days: number | null;
  /** Dose and frequency exactly as written, for the user to compare. */
  dose_text: string | null;
  /** Plausibility problems found after reading (e.g. weekly frequency read as daily). */
  warnings: string[];
}

export interface PrescriptionScan {
  doctor_name: string | null;
  doctor_specialty: string | null;
  prescribed_on: string | null;
  /** First diagnosis, linked to the prescription. */
  condition: string | null;
  /** Every diagnosis written, one per condition. */
  conditions: string[];
  notes: string | null;
  /** Follow-up advice exactly as written, e.g. "Review after 2 weeks". */
  follow_up_text: string | null;
  /** Next visit date worked out from the advice and the prescription date. */
  follow_up_on: string | null;
  medications: ScannedMedicine[];
}

export interface MedicineScan {
  name: string | null;
  strength: string | null;
  form: (typeof MED_FORMS)[number] | null;
  notes: string | null;
}

export interface ReportScan {
  title: string | null;
  /** "blood,urine" when the report has several tests. */
  report_type: string | null;
  report_date: string | null;
  lab_name: string | null;
  findings: string | null;
  /** Every result on the report, as printed. */
  values: LabDraft[];
}

export type ScanResult =
  | { kind: "prescription"; data: PrescriptionScan }
  | { kind: "medicine"; data: MedicineScan }
  | { kind: "report"; data: ReportScan };

/** Max data-URL length accepted by /api/ai/scan (~1.5 MB of base64). */
/** Today's Workers AI allowance for a vault, in neurons (Cloudflare's billing unit). */
export interface AiUsage {
  used: number;
  limit: number;
  left: number;
  /** About how many prescription scans the remaining allowance covers. */
  scans_left: number;
  /** Next reset (00:00 UTC, 5:30 AM in India). */
  resets_at: string;
}

export const SCAN_MAX_DATA_URL = 1_500_000;
/** Text read from a PDF for AI scanning: about 4,000 tokens, roughly 3 to 5 pages of a lab report. */
export const SCAN_MAX_TEXT = 15_000;
