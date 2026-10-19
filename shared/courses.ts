import { scheduleOf } from "./schedule";
import type { Medication } from "./types";

/** One stretch of a medicine at one dose. `to` is null while still being taken. */
export interface CourseSegment {
  medId: string;
  from: string;
  to: string | null;
  /** "20 mg · After meal", for the readout. */
  dose: string;
  /** Strength, dosage and schedule together: segments with the same key are the same dose. */
  doseKey: string;
}

/** A medicine over time: one or more segments; a new segment means the dose changed. */
export interface MedicineCourse {
  key: string;
  name: string;
  segments: CourseSegment[];
  conditionIds: string[];
}

const dayMs = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
/** "Omnacortil 20 Tablet DT" and "omnacortil" are the same medicine for the timeline. */
const keyOf = (name: string) => name.trim().toLowerCase().split(/\s+/)[0];

/** Last day taken: the end date, or for a stopped medicine without one, its last update. Null if ongoing. */
function lastDay(m: Medication, today: string): string | null {
  if (m.end_date && m.end_date < today) return m.end_date;
  if (m.status === "stopped") return m.end_date ?? m.updated_at.slice(0, 10);
  return null;
}

/**
 * Medicines as courses for the trend timeline. The same medicine ending and starting again within a
 * day (a dose change from a new prescription) becomes one course with two segments, not a stop and a
 * start. Medicines without a start date are left out (they cannot be placed on the date line).
 */
export function medicineCourses(meds: Medication[], today: string): MedicineCourse[] {
  const byKey = new Map<string, MedicineCourse>();
  const sorted = meds.filter((m) => m.start_date).sort((a, b) => a.start_date!.localeCompare(b.start_date!));
  for (const m of sorted) {
    const key = keyOf(m.name);
    const seg: CourseSegment = {
      medId: m.id,
      from: m.start_date!,
      to: lastDay(m, today),
      dose: [m.strength, m.dosage ?? m.timing].filter(Boolean).join(" · "),
      doseKey: doseKey(m),
    };
    const course = byKey.get(key);
    const prev = course?.segments[course.segments.length - 1];
    if (course && prev?.to && seg.from <= addDays(prev.to, 1)) {
      // Picked up again right away: a new prescription. Same dose continues the bar; a different dose starts a new segment.
      if (seg.doseKey === prev.doseKey) Object.assign(prev, { to: seg.to, medId: seg.medId });
      else course.segments.push(seg);
    } else if (course && !prev?.to) {
      // Two open entries of the same medicine: keep the later one as the current dose.
      prev!.to = addDays(seg.from, -1) < prev!.from ? prev!.from : addDays(seg.from, -1);
      course.segments.push(seg);
    } else if (course) {
      // A later, separate course of the same medicine: its own row.
      byKey.set(`${key}#${m.id}`, { key: `${key}#${m.id}`, name: m.name.split(" ")[0], segments: [seg], conditionIds: splitIds(m.condition_ids) });
      continue;
    } else {
      byKey.set(key, { key, name: m.name.split(" ")[0], segments: [seg], conditionIds: [] });
    }
    const c = byKey.get(key)!;
    c.conditionIds = [...new Set([...c.conditionIds, ...splitIds(m.condition_ids)])];
  }
  return [...byKey.values()];
}

const squash = (v: string | null) => (v ?? "").toLowerCase().replace(/\s+/g, "");
/**
 * Strength plus the schedule when there is one (wording of the dose text can differ between scans of
 * the same dose), else the dose text; case and spacing ignored ("5mg" equals "5 mg").
 */
const doseKey = (m: Medication) => {
  const schedule = scheduleOf(m);
  return `${squash(m.strength)}|${schedule ? JSON.stringify(schedule) : squash(m.dosage)}`;
};

const splitIds = (s: string | null | undefined) => (s ? s.split(",").filter(Boolean) : []);

/** Courses taken at any time between `from` and `to` (inclusive). */
export const coursesIn = (courses: MedicineCourse[], from: string, to: string) =>
  courses.filter((c) => c.segments.some((s) => s.from <= to && (s.to === null || s.to >= from)));

/** Names of the medicines being taken on `date`. */
export const takingOn = (courses: MedicineCourse[], date: string) =>
  courses.filter((c) => c.segments.some((s) => s.from <= date && (s.to === null || s.to >= date))).map((c) => c.name);
