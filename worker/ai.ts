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
import { normalizeSchedule, scheduleFromDosage } from "../shared/schedule";
import type { AppEnv } from "./env";
import { badRequest, HttpError, readJson } from "./http";

// Tried in order: if a model is unavailable or returns nothing usable, the next one is used.
const MODELS = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/mistralai/mistral-small-3.1-24b-instruct"];

/** Per-vault daily cap so one family cannot use up the shared Workers AI free allowance. */
const DAILY_SCANS_PER_VAULT = 30;

const REPORT_TYPES: ReportType[] = ["blood", "urine", "imaging", "scan", "ecg", "other"];

const COMMON = `You read photos of Indian medical documents. Handwriting may be hard to read.
Reply with ONLY one JSON object, no markdown, no explanation.
Use null for anything you cannot read with reasonable confidence. Never invent values.
Dates must be YYYY-MM-DD (Indian documents usually write DD/MM/YYYY).`;

const PROMPTS: Record<ScanKind, string> = {
  prescription: `${COMMON}
This is a doctor's prescription. Return:
{"doctor_name": string|null, "doctor_specialty": string|null, "prescribed_on": "YYYY-MM-DD"|null,
 "condition": string|null (diagnosis if written), "notes": string|null (advice, follow-up, tests advised),
 "medications": [{"name": string (brand or generic as written, without the Tab/Cap prefix),
   "strength": string|null (e.g. "500 mg"), "form": one of ${JSON.stringify(MED_FORMS)} or null,
   "dosage": string|null (morning-afternoon-night like "1-0-1"; convert OD="1-0-0", BD="1-0-1", TDS="1-1-1", HS="0-0-1", SOS="As needed"),
   "schedule": SCHEDULE|null, "timing": string|null (e.g. "After food"), "duration_days": number|null}]}

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

function medicine(raw: unknown): ScannedMedicine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name)?.replace(/^(tab|cap|syp|inj|oint|gtt)\.?\s+/i, "") ?? null;
  if (!name) return null;
  const days = Number(r.duration_days);
  return {
    name,
    strength: str(r.strength, 80),
    form: oneOf(r.form, MED_FORMS),
    dosage: dosage(r.dosage),
    schedule: normalizeSchedule(r.schedule) ?? scheduleFromDosage(dosage(r.dosage)),
    timing: str(r.timing, 120),
    duration_days: Number.isInteger(days) && days > 0 && days <= 365 ? days : null,
  };
}

export function normalize(kind: ScanKind, raw: Record<string, unknown>): ScanResult {
  switch (kind) {
    case "prescription": {
      const meds = Array.isArray(raw.medications) ? raw.medications.map(medicine).filter((m): m is ScannedMedicine => !!m).slice(0, 30) : [];
      const data: PrescriptionScan = {
        doctor_name: str(raw.doctor_name, 120),
        doctor_specialty: str(raw.doctor_specialty, 120),
        prescribed_on: date(raw.prescribed_on),
        condition: str(raw.condition),
        notes: str(raw.notes, 2000),
        medications: meds,
      };
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
    condition: "Ankylosing spondylitis",
    notes: "To start MTX 15 mg/week.",
    medications: [
      { name: "Meditrex 5mg Tablet", strength: "5 mg", form: "tablet", dosage: null, timing: "After breakfast", duration_days: 7,
        schedule: { type: "weekly", days: { "शनिवार": "2-0-0", sunday: [1, 0, 0] } } },
      { name: "Homin", strength: null, form: "tablet", dosage: "1-0-0", timing: "After meal", duration_days: 7,
        schedule: { type: "weekly", days: { mon: [1, 0, 0], tue: [1, 0, 0], wed: [1, 0, 0], thu: [1, 0, 0], fri: [1, 0, 0] } } },
      { name: "Omnacortil 20 Tablet DT", strength: "20 mg", form: "tablet", dosage: "1-1-0", timing: "After meal", duration_days: 7,
        schedule: { phases: [{ days: 4, pattern: { type: "daily", dose: [1, 1, 0] } }, { days: 3, pattern: { type: "daily", dose: "1-1/2-0" } }] } },
      { name: "Tab. Moxicip", strength: "400 mg", form: "tablet", dosage: "BD", timing: "After food", duration_days: 5 },
    ],
  },
  medicine: { name: "Dolo 650", strength: "650 mg", form: "tablet", notes: "Paracetamol, Micro Labs" },
  report: { title: "ESR and CRP", report_type: "blood", report_date: "2026-10-03", lab_name: "Thyrocare", findings: "ESR high (42 mm/hr), CRP high (12 mg/L)" },
};

type AiRunner = { run(model: string, input: unknown): Promise<unknown> };

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
  const key = `vault:${c.get("vaultId")}`;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const used = await db.prepare("SELECT COUNT(*) AS n FROM rate_events WHERE ip = ? AND kind = 'ai_scan' AND at > ?").bind(key, since).first<number>("n");
  if ((used ?? 0) >= DAILY_SCANS_PER_VAULT)
    throw new HttpError(429, `Daily limit of ${DAILY_SCANS_PER_VAULT} AI scans reached. Fill the form by hand or try again tomorrow.`);

  const { obj, model } = c.env.AI_MOCK === "1" ? { obj: MOCKS[kind], model: "mock" } : await runModels(c.env.AI as unknown as AiRunner, kind, image);
  await db.prepare("INSERT INTO rate_events (ip, kind) VALUES (?, 'ai_scan')").bind(key).run();
  return c.json({ ...normalize(kind, obj), model, scans_left: DAILY_SCANS_PER_VAULT - (used ?? 0) - 1 });
});
