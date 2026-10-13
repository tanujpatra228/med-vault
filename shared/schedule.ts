// Dosage schedules: how often and how much, beyond a single "1-0-1".
// Shared by the Worker (validation) and the app (display, "today").
// See docs/DOSAGE_SCHEDULES.md.

/** Morning, afternoon, night (or breakfast, lunch, dinner). Halves allowed. */
export type Dose = [number, number, number];

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Pattern =
  | { type: "daily"; dose: Dose }
  | { type: "weekly"; days: Partial<Record<Weekday, Dose>> }
  | { type: "interval"; every: number; dose: Dose }
  | { type: "as_needed"; note: string | null };

export interface Phase {
  /** Length in days; null = until stopped (only allowed on the last phase). */
  days: number | null;
  pattern: Pattern;
}

export interface Schedule {
  phases: Phase[];
}

const WEEKDAY_NAMES: Record<Weekday, [short: string, long: string]> = {
  mon: ["Mon", "Monday"],
  tue: ["Tue", "Tuesday"],
  wed: ["Wed", "Wednesday"],
  thu: ["Thu", "Thursday"],
  fri: ["Fri", "Friday"],
  sat: ["Sat", "Saturday"],
  sun: ["Sun", "Sunday"],
};

// ---------- doses ----------

/** "½", "1½", "2" */
export function formatQty(n: number): string {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
}

/** [1, 0.5, 0] -> "1-½-0" */
export const formatDose = (d: Dose) => d.map(formatQty).join("-");

const doseTotal = (d: Dose) => d[0] + d[1] + d[2];
const sameDose = (a: Dose, b: Dose) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Parses one quantity: "1", "0.5", "1/2", "½", "1½", "1 1/2". */
function parseQty(raw: string): number | null {
  const s = raw.trim().replace("½", " 1/2").trim();
  const m = s.match(/^(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const n = (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  return Number.isFinite(n) ? n : null;
}

/** Rounds to the nearest half and rejects nonsense. */
function cleanQty(n: unknown): number | null {
  const v = typeof n === "string" ? parseQty(n) : typeof n === "number" ? n : null;
  if (v === null || !Number.isFinite(v) || v < 0 || v > 10) return null;
  return Math.round(v * 2) / 2;
}

/** Accepts [1, 0.5, 0], ["1", "1/2", "0"] or "1-1/2-0" / "1-½-0". */
export function parseDose(raw: unknown): Dose | null {
  const parts = typeof raw === "string" ? raw.split("-") : Array.isArray(raw) ? raw : null;
  if (!parts || parts.length !== 3) return null;
  const nums = parts.map(cleanQty);
  return nums.every((n): n is number => n !== null) ? (nums as Dose) : null;
}

// ---------- validation ----------

// Day names as written on Indian prescriptions (Hindi / Gujarati), matched by prefix.
const INDIC_DAYS: Array<[string, Weekday]> = [
  ["सोम", "mon"], ["સોમ", "mon"],
  ["मंगल", "tue"], ["મંગળ", "tue"],
  ["बुध", "wed"], ["બુધ", "wed"],
  ["गुरु", "thu"], ["बृहस्पति", "thu"], ["ગુરુ", "thu"],
  ["शुक्र", "fri"], ["શુક્ર", "fri"],
  ["शनि", "sat"], ["શનિ", "sat"],
  ["रवि", "sun"], ["ravi", "sun"], ["રવિ", "sun"],
];

function weekdayKey(raw: string): Weekday | null {
  const t = raw.trim().toLowerCase();
  const s = t.slice(0, 3);
  if ((WEEKDAYS as readonly string[]).includes(s)) return s as Weekday;
  return INDIC_DAYS.find(([word]) => t.startsWith(word))?.[1] ?? null;
}

function cleanPattern(raw: unknown): Pattern | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case "daily": {
      const dose = parseDose(r.dose);
      return dose && doseTotal(dose) > 0 ? { type: "daily", dose } : null;
    }
    case "weekly": {
      if (!r.days || typeof r.days !== "object") return null;
      const days: Partial<Record<Weekday, Dose>> = {};
      for (const [k, v] of Object.entries(r.days as Record<string, unknown>)) {
        const key = weekdayKey(k);
        const dose = parseDose(v);
        if (key && dose && doseTotal(dose) > 0) days[key] = dose;
      }
      return Object.keys(days).length ? { type: "weekly", days } : null;
    }
    case "interval": {
      const every = Number(r.every);
      const dose = parseDose(r.dose);
      if (!Number.isInteger(every) || every < 2 || every > 30 || !dose || doseTotal(dose) === 0) return null;
      return { type: "interval", every, dose };
    }
    case "as_needed": {
      const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 200) : null;
      return { type: "as_needed", note };
    }
    default:
      return null;
  }
}

/**
 * Validates untrusted input (API body, AI output) into a Schedule, or null.
 * Accepts a full schedule or a bare pattern. Phases after an open-ended one are dropped.
 */
export function normalizeSchedule(raw: unknown): Schedule | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawPhases = Array.isArray(r.phases) ? r.phases : "type" in r ? [{ days: null, pattern: r }] : null;
  if (!rawPhases || rawPhases.length === 0 || rawPhases.length > 10) return null;

  const phases: Phase[] = [];
  for (const p of rawPhases) {
    if (!p || typeof p !== "object") return null;
    const pr = p as Record<string, unknown>;
    const pattern = cleanPattern(pr.pattern);
    if (!pattern) return null;
    const days = pr.days === null || pr.days === undefined ? null : Number(pr.days);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return null;
    phases.push({ days, pattern });
    if (days === null) break; // nothing after "until stopped" can ever happen
  }
  return { phases };
}

/** Old free-text dosages ("1-0-1", "As needed") as a schedule, so existing medicines get the new display. */
export function scheduleFromDosage(dosage: string | null | undefined): Schedule | null {
  if (!dosage) return null;
  if (/^(as needed|sos|prn)$/i.test(dosage.trim())) return { phases: [{ days: null, pattern: { type: "as_needed", note: null } }] };
  const dose = parseDose(dosage);
  return dose && doseTotal(dose) > 0 ? { phases: [{ days: null, pattern: { type: "daily", dose } }] } : null;
}

/** The schedule stored on a medicine (JSON text), falling back to its legacy dosage text. */
export function scheduleOf(med: { schedule?: string | null; dosage?: string | null }): Schedule | null {
  return normalizeSchedule(med.schedule ?? null) ?? scheduleFromDosage(med.dosage);
}

// ---------- dates ----------

const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY_MS));
const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
const weekdayOf = (iso: string): Weekday => WEEKDAYS[(toDate(iso).getUTCDay() + 6) % 7];

/** Total length in days if every phase has a fixed length, else null. */
export function totalDays(s: Schedule): number | null {
  let n = 0;
  for (const p of s.phases) {
    if (p.days === null) return null;
    n += p.days;
  }
  return n;
}

/** Last day of the course (inclusive), when the schedule has a fixed length. */
export function endDateOf(s: Schedule, start: string): string | null {
  const n = totalDays(s);
  return n === null ? null : addDays(start, n - 1);
}

// ---------- wording ----------

export interface Wording {
  /** "after food", "before breakfast", ... (the medicine's timing field) */
  timing?: string | null;
  /** "tablet", "capsule", ... for weekly totals */
  form?: string | null;
}

function slotNames(timing: string | null | undefined): [string, string, string] {
  const t = (timing ?? "").toLowerCase();
  if (/food|meal|breakfast|lunch|dinner|khana|bhojan/.test(t)) {
    const when = /before|empty/.test(t) ? "before" : "after";
    return [`${when} breakfast`, `${when} lunch`, `${when} dinner`];
  }
  return ["in the morning", "in the afternoon", "at night"];
}

/** [1, 0.5, 0] -> "1 after breakfast, ½ after lunch" */
export function doseSentence(d: Dose, w: Wording = {}): string {
  const names = slotNames(w.timing);
  const parts = d.flatMap((q, i) => (q > 0 ? [`${formatQty(q)} ${names[i]}`] : []));
  return parts.length ? parts.join(", ") : "nothing";
}

/** Groups weekdays that share a dose, in week order: [[["mon".."fri"], dose], [["sat"], dose]] */
function weekdayGroups(days: Partial<Record<Weekday, Dose>>): Array<[Weekday[], Dose]> {
  const groups: Array<[Weekday[], Dose]> = [];
  for (const day of WEEKDAYS) {
    const dose = days[day];
    if (!dose) continue;
    const g = groups.find(([, d]) => sameDose(d, dose));
    if (g) g[0].push(day);
    else groups.push([[day], dose]);
  }
  return groups;
}

/** ["mon".."fri"] -> "Mon–Fri"; ["sat","sun"] -> "Sat, Sun"; long=true uses full names and "to". */
export function formatDays(days: Weekday[], long = false): string {
  const idx = days.map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs.at(-1);
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else runs.push([i]);
  }
  const name = (i: number) => WEEKDAY_NAMES[WEEKDAYS[i]][long ? 1 : 0];
  return runs
    .flatMap((r) => (r.length >= 3 ? [`${name(r[0])}${long ? " to " : "–"}${name(r[r.length - 1])}`] : r.map(name)))
    .join(long ? " and " : ", ");
}

function patternSummary(p: Pattern): string {
  switch (p.type) {
    case "daily":
      return formatDose(p.dose);
    case "weekly":
      return weekdayGroups(p.days)
        .map(([days, dose]) => `${formatDays(days)} ${formatDose(dose)}`)
        .join(" · ");
    case "interval":
      return `${formatDose(p.dose)} every ${p.every} days`;
    case "as_needed":
      return "When needed";
  }
}

/** Compact one-line form for lists: "Sat 2-0-0 · Sun 1-0-0", "1-1-0 (4 days) → 1-½-0 (3 days)". */
export function summary(s: Schedule): string {
  if (s.phases.length === 1) return patternSummary(s.phases[0].pattern);
  return s.phases.map((p) => (p.days ? `${patternSummary(p.pattern)} (${p.days} ${p.days === 1 ? "day" : "days"})` : `then ${patternSummary(p.pattern)}`)).join(" → ");
}

function unitWord(form: string | null | undefined, n: number): string {
  const base = form === "tablet" || form === "capsule" ? form : "dose";
  return n === 1 ? base : `${base}s`;
}

/** Per-week total for weekly patterns: "3 tablets a week". */
export function weeklyTotal(p: Pattern, w: Wording = {}): string | null {
  if (p.type !== "weekly") return null;
  const n = Object.values(p.days).reduce((sum, d) => sum + doseTotal(d!), 0);
  return `${formatQty(n)} ${unitWord(w.form, n)} a week`;
}

function patternSentences(p: Pattern, w: Wording): string[] {
  switch (p.type) {
    case "daily":
      return [`Every day: ${doseSentence(p.dose, w)}.`];
    case "weekly": {
      const lines = weekdayGroups(p.days).map(([days, dose]) => `${formatDays(days, true)}: ${doseSentence(dose, w)}.`);
      const off = WEEKDAYS.filter((d) => !p.days[d]);
      if (off.length) lines.push(`Nothing on ${formatDays(off, true)}.`);
      lines.push(`${weeklyTotal(p, w)}.`.replace(/^./, (c) => c.toUpperCase()));
      return lines;
    }
    case "interval":
      return [`Every ${p.every} days: ${doseSentence(p.dose, w)}.`];
    case "as_needed":
      return [p.note ? `When needed: ${p.note}.` : "When needed."];
  }
}

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(toDate(iso));

/** Full explanation, one entry per phase: { heading, lines }. */
export function describe(s: Schedule, start: string | null, w: Wording = {}): Array<{ heading: string | null; lines: string[] }> {
  if (s.phases.length === 1 && s.phases[0].days === null) return [{ heading: null, lines: patternSentences(s.phases[0].pattern, w) }];
  let day = 1;
  return s.phases.map((p) => {
    const from = day;
    let heading: string;
    if (p.days === null) heading = `From day ${from}${start ? ` (${shortDate(addDays(start, from - 1))})` : ""}`;
    else {
      const to = from + p.days - 1;
      heading = `${from === to ? `Day ${from}` : `Days ${from}–${to}`}${start ? ` (until ${shortDate(addDays(start, to - 1))})` : ""}`;
      day = to + 1;
    }
    return { heading, lines: patternSentences(p.pattern, w) };
  });
}

// ---------- today ----------

export type TodayStatus =
  | { kind: "due"; dose: Dose; text: string; phase: number }
  | { kind: "rest"; next: string | null; phase: number }
  | { kind: "as_needed"; note: string | null }
  | { kind: "not_started"; starts: string }
  | { kind: "finished"; ended: string };

/** Which phase covers `date`, and the day number within it (0-based). */
function phaseAt(s: Schedule, start: string, date: string): { index: number; dayInPhase: number } | null {
  let offset = daysBetween(start, date);
  for (let i = 0; i < s.phases.length; i++) {
    const len = s.phases[i].days;
    if (len === null || offset < len) return { index: i, dayInPhase: offset };
    offset -= len;
  }
  return null;
}

function doseOn(s: Schedule, start: string, date: string): { dose: Dose | null; phase: number } | null {
  const at = phaseAt(s, start, date);
  if (!at) return null;
  const p = s.phases[at.index].pattern;
  switch (p.type) {
    case "daily":
      return { dose: p.dose, phase: at.index };
    case "weekly":
      return { dose: p.days[weekdayOf(date)] ?? null, phase: at.index };
    case "interval":
      return { dose: at.dayInPhase % p.every === 0 ? p.dose : null, phase: at.index };
    case "as_needed":
      return { dose: null, phase: at.index };
  }
}

/**
 * What to take on `date` (YYYY-MM-DD, local). Without a start date, phases are counted from
 * `date` itself, which is right for ongoing single-phase schedules.
 */
export function todayStatus(s: Schedule, start: string | null, date: string, w: Wording = {}): TodayStatus {
  const from = start ?? date;
  if (daysBetween(from, date) < 0) return { kind: "not_started", starts: from };
  const end = endDateOf(s, from);
  if (end && daysBetween(end, date) > 0) return { kind: "finished", ended: end };

  const at = phaseAt(s, from, date)!;
  const pattern = s.phases[at.index].pattern;
  if (pattern.type === "as_needed") return { kind: "as_needed", note: pattern.note };

  const today = doseOn(s, from, date)!;
  if (today.dose) return { kind: "due", dose: today.dose, text: doseSentence(today.dose, w), phase: today.phase };

  for (let i = 1; i <= 31; i++) {
    const d = addDays(date, i);
    if (end && daysBetween(end, d) > 0) break;
    if (doseOn(s, from, d)?.dose) return { kind: "rest", next: d, phase: at.index };
  }
  return { kind: "rest", next: null, phase: at.index };
}

/** "Saturday" for a date within the next week, else "12 Oct". */
export function nextDayLabel(next: string, today: string): string {
  const diff = daysBetween(today, next);
  if (diff === 1) return "tomorrow";
  return diff < 7 ? WEEKDAY_NAMES[weekdayOf(next)][1] : shortDate(next);
}

export const isWeekly = (s: Schedule) => s.phases.some((p) => p.pattern.type === "weekly");
export const isTaper = (s: Schedule) => s.phases.length > 1;
