// Types shared by the Worker API and the React app.

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
  condition_name?: string | null;
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
  condition_name?: string | null;
  med_count?: number;
  file_count?: number;
  cover_file_id?: string | null;
}

export interface PrescriptionDetail extends Prescription {
  medications: Medication[];
  files: FileMeta[];
}

export type ReportType = "blood" | "urine" | "imaging" | "scan" | "ecg" | "other";

export interface Report {
  id: ID;
  member_id: ID;
  condition_id: ID | null;
  doctor_id: ID | null;
  title: string;
  report_type: ReportType;
  report_date: string;
  lab_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  doctor_name?: string | null;
  condition_name?: string | null;
  file_count?: number;
  cover_file_id?: string | null;
}

export interface ReportDetail extends Report {
  files: FileMeta[];
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

export type MedicationInput = Partial<Omit<Medication, "id" | "created_at" | "updated_at">> & { name: string };

export interface PrescriptionCreateInput {
  member_id: ID;
  doctor_id?: ID | null;
  condition_id?: ID | null;
  prescribed_on: string;
  notes?: string | null;
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
