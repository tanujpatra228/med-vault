import { endDateOf, normalizeSchedule, summary } from "../shared/schedule";
import { badRequest } from "./http";

/**
 * Runs before validation on every medication write. Turns `schedule` (object or JSON) into
 * validated JSON text and keeps the derived fields in sync:
 * - `dosage` becomes the schedule's one-line summary (what lists and older screens show)
 * - `end_date` is filled from fixed-length schedules (tapers) when not given
 */
export function prepareMedication(input: Record<string, unknown>): Record<string, unknown> {
  if (!("schedule" in input)) return input;
  const out = { ...input };
  if (input.schedule === null || input.schedule === "") {
    out.schedule = null;
    return out;
  }
  const schedule = normalizeSchedule(input.schedule);
  if (!schedule) throw badRequest("schedule is invalid");
  out.schedule = JSON.stringify(schedule);
  out.dosage = summary(schedule).slice(0, 200);
  const start = typeof input.start_date === "string" && input.start_date ? input.start_date : null;
  if (start && !input.end_date) {
    const end = endDateOf(schedule, start);
    if (end) out.end_date = end;
  }
  return out;
}
