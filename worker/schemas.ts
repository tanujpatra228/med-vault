import { MED_FORMS } from "../shared/types";
import type { Schema } from "./validate";

const short = { type: "text", max: 200 } as const;
const long = { type: "text", max: 4000 } as const;

export const memberSchema: Schema = {
  name: { type: "text", required: true, max: 120 },
  relation: short,
  dob: { type: "date" },
  sex: { type: "enum", values: ["female", "male", "other"] },
  blood_group: { type: "enum", values: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  notes: long,
};

export const doctorSchema: Schema = {
  name: { type: "text", required: true, max: 120 },
  specialty: short,
  clinic: short,
  phone: { type: "text", max: 40 },
  address: { type: "text", max: 500 },
  notes: long,
};

export const allergySchema: Schema = {
  member_id: { type: "id", ref: "members", required: true },
  allergen: { type: "text", required: true, max: 200 },
  kind: { type: "enum", values: ["drug", "food", "other"] },
  reaction: { type: "text", max: 500 },
  severity: { type: "enum", values: ["mild", "moderate", "severe"] },
  noted_on: { type: "date" },
  notes: long,
};

export const conditionSchema: Schema = {
  member_id: { type: "id", ref: "members", required: true },
  name: { type: "text", required: true, max: 200 },
  status: { type: "enum", values: ["active", "resolved"] },
  diagnosed_on: { type: "date" },
  notes: long,
};

export const medicationSchema: Schema = {
  member_id: { type: "id", ref: "members", required: true },
  prescription_id: { type: "id", ref: "prescriptions" },
  doctor_id: { type: "id", ref: "doctors" },
  condition_id: { type: "id", ref: "conditions" },
  name: { type: "text", required: true, max: 200 },
  strength: { type: "text", max: 80 },
  form: { type: "enum", values: MED_FORMS },
  dosage: { type: "text", max: 200 },
  schedule: { type: "text", max: 4000 },
  timing: { type: "text", max: 120 },
  start_date: { type: "date" },
  end_date: { type: "date" },
  status: { type: "enum", values: ["active", "stopped"] },
  notes: long,
};

export const prescriptionSchema: Schema = {
  member_id: { type: "id", ref: "members", required: true },
  doctor_id: { type: "id", ref: "doctors" },
  condition_id: { type: "id", ref: "conditions" },
  prescribed_on: { type: "date", required: true },
  notes: long,
};

export const reportSchema: Schema = {
  member_id: { type: "id", ref: "members", required: true },
  doctor_id: { type: "id", ref: "doctors" },
  condition_id: { type: "id", ref: "conditions" },
  title: { type: "text", required: true, max: 200 },
  report_type: { type: "enum", values: ["blood", "urine", "imaging", "scan", "ecg", "other"] },
  report_date: { type: "date", required: true },
  lab_name: short,
  notes: long,
};

export const visitSchema: Schema = {
  member_id: { type: "id", ref: "members", required: true },
  doctor_id: { type: "id", ref: "doctors" },
  condition_id: { type: "id", ref: "conditions" },
  prescription_id: { type: "id", ref: "prescriptions" },
  visit_date: { type: "date", required: true },
  reason: { type: "text", max: 300 },
  notes: long,
  follow_up_on: { type: "date" },
  follow_up_note: { type: "text", max: 300 },
  follow_up_done: { type: "enum", values: ["0", "1"] },
};
