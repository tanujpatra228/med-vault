import { Hono } from "hono";
import {
  MED_FORMS,
  SCAN_MAX_DATA_URL,
  type MedicineScan,
  type PrescriptionScan,
  type ReportScan,
  type ReportType,
  type ScanKind,
  type ScanResult,
  type ScannedMedicine,
} from "../shared/types";
import { isWeekly, normalizeSchedule, parseDoseText, scheduleFromDosage, totalDays, type Pattern, type Schedule } from "../shared/schedule";
import type { AppEnv } from "./env";
import { badRequest, HttpError, readJson } from "./http";

// Tried in order: if a model is unavailable or returns nothing usable, the next one is used.
export const MODELS = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/mistralai/mistral-small-3.1-24b-instruct"];

/** Per-vault daily cap so one family cannot use up the shared Workers AI free allowance. */
export const DAILY_SCANS_PER_VAULT = 30;

/** AI calls this vault made in the last 24 hours (scans and medicine reviews share the cap). */
export async function aiUsedToday(db: D1Database, vaultId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  return (await db.prepare("SELECT COUNT(*) AS n FROM rate_events WHERE ip = ? AND kind = 'ai_scan' AND at > ?").bind(`vault:${vaultId}`, since).first<number>("n")) ?? 0;
}

export const recordAiUse = (db: D1Database, vaultId: string) => db.prepare("INSERT INTO rate_events (ip, kind) VALUES (?, 'ai_scan')").bind(`vault:${vaultId}`).run();

const REPORT_TYPES: ReportType[] = ["blood", "urine", "imaging", "scan", "ecg", "other"];

const COMMON = `You read photos of Indian medical documents. Handwriting may be hard to read.
Reply with ONLY one JSON object, no markdown, no explanation.
Use null for anything you cannot read with reasonable confidence. Never invent values.
Dates must be YYYY-MM-DD (Indian documents usually write DD/MM/YYYY).`;

const PROMPTS: Record<ScanKind, string> = {
  prescription: `${COMMON}
This is a doctor's prescription. Return:
{"doctor_name": string|null, "doctor_specialty": string|null, "prescribed_on": "YYYY-MM-DD"|null,
 "conditions": string[] (each diagnosis separately, as written; [] if none), "notes": string|null (advice, follow-up, tests advised),
 "medications": [{"name": string (brand or generic as written, without the Tab/Cap prefix),
   "strength": string|null (e.g. "500 mg"), "form": one of ${JSON.stringify(MED_FORMS)} or null,
   "dosage": string|null (morning-afternoon-night like "1-0-1"; convert OD="1-0-0", BD="1-0-1", TDS="1-1-1", HS="0-0-1", SOS="As needed"),
   "schedule": SCHEDULE|null, "timing": string|null (e.g. "After food"), "duration_days": number|null,
   "dose_text": string|null (copy the Dose cell EXACTLY as written, in its original script, e.g. "हर शनिवार 2-0-0 हर रविवार 1-0-0"),
   "frequency_text": string|null (copy the Frequency cell exactly, e.g. "3 tablet per week After breakfast")}]}

Table rows: one entry per medicine. A row with an empty medicine cell, or an arrow from the row above, CONTINUES the medicine above:
put both rows into that ONE medicine as a changing-dose schedule (phases), using each row's Duration as the phase length. Never list the same medicine twice.

SCHEDULE describes how often and how much. A dose is [morning, afternoon, night] (or breakfast, lunch, dinner); halves allowed, e.g. "1-1/2-0" = [1, 0.5, 0].
- Every day: {"type":"daily","dose":[1,0,1]}
- Only on some weekdays: {"type":"weekly","days":{"sat":[2,0,0],"sun":[1,0,0]}} (keys: mon tue wed thu fri sat sun; leave out days with nothing)
- Every N days ("alternate days" = 2): {"type":"interval","every":2,"dose":[1,0,0]}
- When needed (SOS): {"type":"as_needed","note":string|null}
- Dose that changes over time (taper; an arrow or "then" between lines of the same medicine, often in the next table row):
  {"phases":[{"days":4,"pattern":{"type":"daily","dose":[1,1,0]}},{"days":3,"pattern":{"type":"daily","dose":[1,0.5,0]}}]}
Weekday words may be in Hindi or Gujarati: सोम/સોમ=mon, मंगल/મંગળ=tue, बुध/બુધ=wed, गुरु/ગુરુ=thu, शुक्र/શુક્ર=fri, शनि/शनिवार/શનિ=sat, रवि/रविवार/રવિ=sun.
"हर"/"દર" = every; "से"/"થી" between two days = that range (हर सोम से शुक्र = mon, tue, wed, thu, fri).
Use the Frequency column ("3 tablet per week", "5 days a week") to check your schedule. Methotrexate is normally weekly: never make it daily unless clearly written.
For a simple course ("1-0-1 for 5 days") use a daily schedule plus duration_days, not phases.`,
  medicine: `${COMMON}
This is a photo of a medicine strip, bottle or box. Return:
{"name": string|null (brand name as printed), "strength": string|null (e.g. "10 mg"),
 "form": one of ${JSON.stringify(MED_FORMS)} or null, "notes": string|null (generic/salt name and manufacturer if printed)}`,
  report: `${COMMON}
This is a medical test report. Return:
{"title": string|null (test name, e.g. "Complete Blood Count"), "report_type": one of ${JSON.stringify(REPORT_TYPES)} or null,
 "report_date": "YYYY-MM-DD"|null (collection or report date), "lab_name": string|null,
 "findings": string|null (short plain-language summary of values outside the normal range, each with its value; or "All values in normal range")}`,
};

// ---------- normalisation: the model's output is a suggestion, never trusted as-is ----------

const str = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "unknown" ? s.slice(0, max) : null;
};

function date(v: unknown): string | null {
  const s = str(v, 20);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // Indian DD/MM/YYYY
    if (dmy) m = [s, dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3], dmy[2], dmy[1]];
  }
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !d.toISOString().startsWith(iso)) return null;
  // Medical documents are not from the future (allow 1 day for time zones), nor ancient.
  if (d.getTime() > Date.now() + 86_400_000 || d.getUTCFullYear() < 1950) return null;
  return iso;
}

const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null => {
  const s = str(v, 40)?.toLowerCase();
  return s && (values as readonly string[]).includes(s) ? (s as T) : null;
};

// Common Indian prescription shorthand, mapped to morning-afternoon-night.
const DOSAGE_CODES: Record<string, string> = {
  OD: "1-0-0", QD: "1-0-0", BD: "1-0-1", BID: "1-0-1", TDS: "1-1-1", TID: "1-1-1",
  QID: "1-1-1-1", HS: "0-0-1", SOS: "As needed", PRN: "As needed",
};

export function dosage(v: unknown): string | null {
  const s = str(v, 80);
  if (!s) return null;
  return DOSAGE_CODES[s.toUpperCase().replace(/[^A-Z]/g, "")] ?? s;
}

interface RawMed extends Omit<ScannedMedicine, "name" | "warnings"> {
  name: string | null;
  frequency_text: string | null;
}

function medicine(raw: unknown): RawMed | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name)?.replace(/^(tab|cap|syp|inj|oint|gtt)\.?\s+/i, "") ?? null;
  const days = Number(r.duration_days);
  const dose_text = str(r.dose_text, 300);
  const frequency_text = str(r.frequency_text, 300);
  // Weekdays are parsed from the written text in code: the model's own weekday mapping is unreliable.
  const schedule = parseDoseText(dose_text) ?? parseDoseText(frequency_text) ?? normalizeSchedule(r.schedule) ?? scheduleFromDosage(dosage(r.dosage));
  return {
    name,
    strength: str(r.strength, 80),
    form: oneOf(r.form, MED_FORMS),
    dosage: dosage(r.dosage),
    schedule,
    timing: str(r.timing, 120),
    duration_days: Number.isInteger(days) && days > 0 && days <= 365 ? days : null,
    dose_text,
    frequency_text,
  };
}

const sameMedicine = (a: string, b: string) => {
  const key = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
  return key(a) === key(b);
};

/** A single-phase schedule's pattern, so two rows can become two phases. */
const onlyPattern = (s: Schedule | null): Pattern | null => (s && s.phases.length === 1 ? s.phases[0].pattern : null);

/**
 * Joins a medicine with the row(s) that continue it (same name, or no name) into one
 * changing-dose schedule, phase lengths taken from each row's duration.
 */
export function mergeContinuations(rows: RawMed[]): RawMed[] {
  const out: RawMed[] = [];
  for (const row of rows) {
    const prev = out.at(-1);
    const continues = prev && (!row.name || (prev.name && sameMedicine(prev.name, row.name)));
    const prevPhases = prev?.schedule?.phases;
    const nextPattern = onlyPattern(row.schedule);
    const lastPhase = prevPhases?.at(-1);
    if (prev && continues && prevPhases && nextPattern && lastPhase && (lastPhase.days ?? prev.duration_days)) {
      const fixed = prevPhases.map((p, i) => (i === prevPhases.length - 1 ? { ...p, days: p.days ?? prev.duration_days } : p));
      prev.schedule = normalizeSchedule({ phases: [...fixed, { days: row.duration_days, pattern: nextPattern }] }) ?? prev.schedule;
      prev.duration_days = prev.schedule ? totalDays(prev.schedule) : null;
      prev.dose_text = [prev.dose_text, row.dose_text].filter(Boolean).join(" → ") || null;
      prev.frequency_text = [prev.frequency_text, row.frequency_text].filter(Boolean).join(" → ") || null;
      prev.dosage = null;
      continue;
    }
    if (row.name) out.push({ ...row });
  }
  return out;
}

const METHOTREXATE = /methotrex|\bmtx\b|meditrex|folitrax|imutrex|oncotrex/i;

/** Cross-checks the schedule against the written frequency. Returns human-readable warnings. */
export function checkMedicine(m: RawMed & { name: string }): string[] {
  const warnings: string[] = [];
  const s = m.schedule;
  const freq = (m.frequency_text ?? "").toLowerCase();
  const weeklyWords = /(per|a|\/)\s*week|weekly|days? a week|हफ्त|સપ્તાહ|અઠવાડ/.test(freq);
  const pattern = onlyPattern(s);
  if (s && METHOTREXATE.test(m.name) && !isWeekly(s)) warnings.push("Methotrexate is usually taken once a week. Check that this schedule is right.");
  if (pattern?.type === "daily" && weeklyWords) warnings.push(`The prescription says "${m.frequency_text}" but this was read as every day. Check the days.`);
  if (pattern?.type === "weekly") {
    const perWeek = freq.match(/(\d+(?:\.\d+)?)\s*(?:tab|tablet|tablets|cap|capsule|capsules|dose|doses)?\s*(?:per|a|\/)\s*week/);
    const total = Object.values(pattern.days).reduce((n, d) => n + d![0] + d![1] + d![2], 0);
    if (perWeek && Number(perWeek[1]) !== total) warnings.push(`The prescription says ${perWeek[1]} per week, but these days add up to ${total}. Check the doses.`);
    const daysWeek = freq.match(/(\d)\s*days?\s*(?:a|per|\/)\s*week/);
    const count = Object.keys(pattern.days).length;
    if (daysWeek && Number(daysWeek[1]) !== count) warnings.push(`The prescription says ${daysWeek[1]} days a week, but ${count} ${count === 1 ? "day is" : "days are"} selected. Check the days.`);
  }
  return warnings;
}

// Only a trailing code after a dash/colon/bracket ("... - M45.9", "(I10)"), so "Vitamin B12 deficiency" keeps "B12".
const ICD_CODE = /\s*[-–:(]\s*[A-Z]\d{2}(?:\.\d{1,3})?\)?\s*$/i;

/** "ANKYLOSING SPONDYLITIS - M45.9 | PRIMARY HYPERTENSION - I10" -> ["Ankylosing Spondylitis", "Primary Hypertension"] */
export function splitDiagnoses(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    const text = str(item, 500);
    if (!text) continue;
    for (const part of text.split(/\s*(?:[|,;\n]|\band\b|\s\+\s)\s*/i)) {
      let name = part.replace(ICD_CODE, "").replace(/^[-–:.\s]+|[-–:.\s]+$/g, "").trim();
      if (name.length < 3) continue;
      if (name === name.toUpperCase()) name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name.slice(0, 200));
    }
  }
  return out.slice(0, 8);
}

export function normalize(kind: ScanKind, raw: Record<string, unknown>): ScanResult {
  switch (kind) {
    case "prescription": {
      const rows = Array.isArray(raw.medications) ? raw.medications.map(medicine).filter((m): m is RawMed => !!m) : [];
      const meds: ScannedMedicine[] = mergeContinuations(rows)
        .slice(0, 30)
        .map(({ frequency_text: _f, ...m }) => ({ ...m, name: m.name!, warnings: checkMedicine({ ...m, frequency_text: _f, name: m.name! }) }));
      const data: PrescriptionScan = {
        doctor_name: str(raw.doctor_name, 120),
        doctor_specialty: str(raw.doctor_specialty, 120),
        prescribed_on: date(raw.prescribed_on),
        condition: null,
        conditions: [],
        notes: str(raw.notes, 2000),
        medications: meds,
      };
      data.conditions = splitDiagnoses([...(Array.isArray(raw.conditions) ? raw.conditions : []), raw.condition]);
      data.condition = data.conditions[0] ?? null;
      return { kind, data };
    }
    case "medicine": {
      const data: MedicineScan = { name: str(raw.name), strength: str(raw.strength, 80), form: oneOf(raw.form, MED_FORMS), notes: str(raw.notes, 500) };
      return { kind, data };
    }
    case "report": {
      const data: ReportScan = {
        title: str(raw.title),
        report_type: oneOf(raw.report_type, REPORT_TYPES),
        report_date: date(raw.report_date),
        lab_name: str(raw.lab_name),
        findings: str(raw.findings, 2000),
      };
      return { kind, data };
    }
  }
}

/** Pulls the first JSON object out of a model reply (models sometimes wrap it in prose or ``` fences). */
export function parseJsonObject(reply: unknown): Record<string, unknown> | null {
  if (reply && typeof reply === "object" && !Array.isArray(reply)) return reply as Record<string, unknown>;
  if (typeof reply !== "string") return null;
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(reply.slice(start, end + 1));
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

const MOCKS: Record<ScanKind, Record<string, unknown>> = {
  prescription: {
    doctor_name: "Dr. Hetal Vyas",
    doctor_specialty: "Rheumatologist",
    prescribed_on: "05/10/2026",
    conditions: ["ANKYLOSING SPONDYLITIS - M45.9 | PERIPHERAL SPONDYLOARTHRITIS - M46.90 | PRIMARY HYPERTENSION - I10"],
    notes: "To start MTX 15 mg/week.",
    // Replays what the real model returned for this prescription, so the corrections can be checked locally.
    medications: [
      { name: "Meditrex 5mg Tablet (Methotrexate)", strength: "5mg", form: "tablet", timing: "After breakfast", duration_days: null,
        schedule: { type: "weekly", days: { fri: [1, 0, 0], sat: [2, 0, 0] } },
        dose_text: "हर शनिवार 2-0-0 हर रविवार 1-0-0", frequency_text: "3 tablet per week After breakfast" },
      { name: "Homin (B6+B9+B12)", form: "tablet", timing: "After Meal", dosage: "1-0-0",
        schedule: { type: "daily", dose: [1, 0, 0] }, dose_text: "हर सोम से शुक्र 1-0-0", frequency_text: "5 days a week After Meal" },
      { name: "Omnacortil 20 Tablet DT (Prednisolone)", strength: "20mg", form: "tablet", timing: "After Meal", duration_days: 4,
        schedule: { type: "daily", dose: [1, 1, 0] }, dose_text: "1 tablet", frequency_text: "1-1-0 After Meal" },
      { name: "Omnacortil 20 Tablet DT (Prednisolone)", strength: "20mg", form: "tablet", timing: "After Meal", duration_days: 3,
        schedule: { type: "daily", dose: [1, 0.5, 0] }, dose_text: null, frequency_text: "1-1/2-0 After Meal" },
      { name: "Folitrax 7.5", form: "tablet", schedule: { type: "daily", dose: [1, 0, 0] }, dose_text: "1-0-0", frequency_text: "Daily" },
    ],
  },
  medicine: { name: "Dolo 650", strength: "650 mg", form: "tablet", notes: "Paracetamol, Micro Labs" },
  report: { title: "ESR and CRP", report_type: "blood", report_date: "2026-10-03", lab_name: "Thyrocare", findings: "ESR high (42 mm/hr), CRP high (12 mg/L)" },
};

export type AiRunner = { run(model: string, input: unknown): Promise<unknown> };

async function runModels(ai: AiRunner, kind: ScanKind, image: string) {
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const out = (await ai.run(model, {
        messages: [
          { role: "system", content: PROMPTS[kind] },
          {
            role: "user",
            content: [
              { type: "text", text: "Read this image and return the JSON object." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0,
      })) as { response?: unknown };
      const obj = parseJsonObject(out?.response ?? out);
      if (obj) return { obj, model };
      lastError = new Error(`${model} returned no JSON`);
    } catch (err) {
      lastError = err;
    }
  }
  console.error("AI scan failed on all models", lastError);
  throw new HttpError(502, "Could not read this photo. Try a sharper, well-lit photo, or fill the form by hand.");
}

export const aiApi = new Hono<AppEnv>();

aiApi.post("/scan", async (c) => {
  const body = await readJson(c);
  const kind = body.kind as ScanKind;
  const image = typeof body.image === "string" ? body.image : "";
  if (!(kind in PROMPTS)) throw badRequest("kind must be prescription, medicine or report");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw badRequest("image must be a JPEG, PNG or WebP data URL");
  if (image.length > SCAN_MAX_DATA_URL) throw new HttpError(413, "Photo is too large to scan");

  const db = c.env.DB;
  const used = await aiUsedToday(db, c.get("vaultId"));
  if (used >= DAILY_SCANS_PER_VAULT)
    throw new HttpError(429, `Daily limit of ${DAILY_SCANS_PER_VAULT} AI scans reached. Fill the form by hand or try again tomorrow.`);

  const { obj, model } = c.env.AI_MOCK === "1" ? { obj: MOCKS[kind], model: "mock" } : await runModels(c.env.AI as unknown as AiRunner, kind, image);
  await recordAiUse(db, c.get("vaultId"));
  return c.json({ ...normalize(kind, obj), model, scans_left: DAILY_SCANS_PER_VAULT - used - 1 });
});
