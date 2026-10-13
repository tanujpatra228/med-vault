import type { Medication } from "@shared/types";
import { isTaper, isWeekly, nextDayLabel, scheduleOf, summary, todayStatus, type Schedule, type TodayStatus } from "@shared/schedule";
import { formatDate, today } from "@/lib/format";

export interface MedView {
  schedule: Schedule | null;
  /** One-line dose: schedule summary, or the legacy free-text dosage. */
  doseLine: string | null;
  today: TodayStatus | null;
  /** Active in the database but its course has ended (taper done or end date passed). */
  finished: boolean;
  /** Currently being taken: active and not finished. */
  current: boolean;
  weekly: boolean;
  taper: boolean;
}

/** Everything the UI needs to show a medicine, computed for the local "today". */
export function medView(med: Medication, date = today()): MedView {
  const schedule = scheduleOf(med);
  const wording = { timing: med.timing, form: med.form };
  const status = schedule && med.status === "active" ? todayStatus(schedule, med.start_date, date, wording) : null;
  const ended = med.end_date ? med.end_date < date : false;
  const finished = med.status === "active" && (status?.kind === "finished" || ended);
  return {
    schedule,
    doseLine: schedule ? summary(schedule) : med.dosage,
    today: status,
    finished,
    current: med.status === "active" && !finished,
    weekly: !!schedule && isWeekly(schedule),
    taper: !!schedule && isTaper(schedule),
  };
}

/** "Today: 2 after breakfast", "Not today · next Saturday", "Starts 20 Oct", ... */
export function todayLine(v: MedView, date = today()): string | null {
  const t = v.today;
  if (!t) return null;
  switch (t.kind) {
    case "due":
      return `Today: ${t.text}`;
    case "rest":
      return t.next ? `Not today · next ${nextDayLabel(t.next, date)}` : "Not today";
    case "as_needed":
      return t.note ? `When needed · ${t.note}` : "When needed";
    case "not_started":
      return `Starts ${formatDate(t.starts)}`;
    case "finished":
      return `Course finished ${formatDate(t.ended)}`;
  }
}
