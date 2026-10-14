// Reminders: what is due when, and what the notification says. Pure functions shared by the
// Worker's cron job and the app's settings. See docs/REMINDERS.md.

import { formatQty, scheduleOf, todayStatus } from "./schedule";

export interface ReminderPrefs {
  /** Dose reminders at the three times below. */
  dose: boolean;
  /** Morning, afternoon, night as "HH:MM" in the phone's time zone. */
  times: [string, string, string];
  /** Family members to remind about; null = everyone. */
  members: string[] | null;
  /** The morning before (and of) a follow-up. */
  followups: boolean;
  followup_time: string;
  /** Monthly nudge when no backup was made in 30 days. */
  backup: boolean;
  /** Medicine and doctor names in the notification (they show on the lock screen). */
  details: boolean;
}

export const DEFAULT_PREFS: ReminderPrefs = {
  dose: true,
  times: ["08:00", "14:00", "21:00"],
  members: null,
  followups: true,
  followup_time: "09:00",
  backup: true,
  details: true,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (v: unknown, fallback: string) => (typeof v === "string" && TIME_RE.test(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Untrusted prefs (request body or stored JSON) to valid prefs, falling back to the defaults. */
export function normalizePrefs(raw: unknown): ReminderPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = Array.isArray(o.times) ? o.times : [];
  const members = Array.isArray(o.members) ? o.members.filter((m): m is string => typeof m === "string" && m.length <= 64).slice(0, 50) : null;
  return {
    dose: bool(o.dose, DEFAULT_PREFS.dose),
    times: [time(t[0], DEFAULT_PREFS.times[0]), time(t[1], DEFAULT_PREFS.times[1]), time(t[2], DEFAULT_PREFS.times[2])],
    members,
    followups: bool(o.followups, DEFAULT_PREFS.followups),
    followup_time: time(o.followup_time, DEFAULT_PREFS.followup_time),
    backup: bool(o.backup, DEFAULT_PREFS.backup),
    details: bool(o.details, DEFAULT_PREFS.details),
  };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The phone's local date and minute of day, for an IANA time zone (falls back to India). */
export function localNow(tz: string | null | undefined, now: Date): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return localNow("Asia/Kolkata", now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type DueEvent = { key: string; kind: "dose"; slot: 0 | 1 | 2 } | { key: string; kind: "followup" } | { key: string; kind: "backup" };

/** A reminder this late is dropped rather than sent (the cron runs every 5 minutes). */
export const LATE_LIMIT_MINUTES = 90;

/** Reminders whose time has come today (and are not too late). Keys make each one send once. */
export function dueEvents(prefs: ReminderPrefs, local: { date: string; minutes: number }): DueEvent[] {
  const out: DueEvent[] = [];
  const due = (hhmm: string) => {
    const diff = local.minutes - toMinutes(hhmm);
    return diff >= 0 && diff < LATE_LIMIT_MINUTES;
  };
  if (prefs.dose) prefs.times.forEach((t, slot) => due(t) && out.push({ key: `dose:${local.date}:${slot}`, kind: "dose", slot: slot as 0 | 1 | 2 }));
  if (prefs.followups && due(prefs.followup_time)) out.push({ key: `followup:${local.date}`, kind: "followup" });
  // Backup: checked once a day at the follow-up time; the sender decides if 30 days have passed.
  if (prefs.backup && due(prefs.followup_time)) out.push({ key: `backup:${local.date}`, kind: "backup" });
  return out;
}

export interface ReminderMessage {
  title: string;
  body: string;
  /** Where tapping the notification goes. */
  url: string;
  /** Replaces an earlier notification with the same tag. */
  tag: string;
}

export interface ReminderMed {
  member_id: string;
  member_name: string;
  name: string;
  strength: string | null;
  form: string | null;
  timing: string | null;
  schedule: string | null;
  dosage: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

const SLOT_TITLE = ["Morning medicines", "Afternoon medicines", "Night medicines"];
const MEAL = ["breakfast", "lunch", "dinner"];

/** "Morning medicines" with what is due in that slot today, per family member. Null when nothing is due. */
export function doseMessage(slot: 0 | 1 | 2, meds: ReminderMed[], date: string, details: boolean): ReminderMessage | null {
  const byMember = new Map<string, { name: string; items: string[] }>();
  for (const m of meds) {
    if (m.status !== "active" || (m.end_date && m.end_date < date)) continue;
    const s = scheduleOf(m);
    if (!s) continue;
    const t = todayStatus(s, m.start_date, date, { timing: m.timing, form: m.form });
    if (t.kind !== "due" || !(t.dose[slot] > 0)) continue;
    const meal = /food|meal|breakfast|lunch|dinner/i.test(m.timing ?? "") ? ` ${/before|empty/i.test(m.timing ?? "") ? "before" : "after"} ${MEAL[slot]}` : "";
    const entry = byMember.get(m.member_id) ?? { name: m.member_name, items: [] };
    entry.items.push(`${m.name}${m.strength ? ` ${m.strength}` : ""}: ${formatQty(t.dose[slot])}${meal}`);
    byMember.set(m.member_id, entry);
  }
  if (!byMember.size) return null;
  const members = [...byMember.entries()];
  const count = members.reduce((n, [, e]) => n + e.items.length, 0);
  const body = details
    ? members.map(([, e]) => `${e.name}: ${e.items.join(" · ")}`).join("\n")
    : members.map(([, e]) => `${e.name}: ${e.items.length} ${e.items.length === 1 ? "medicine" : "medicines"}`).join(" · ");
  return {
    title: count === 1 && members.length === 1 ? `${SLOT_TITLE[slot]}: ${members[0][1].name}` : SLOT_TITLE[slot],
    body,
    url: members.length === 1 ? `/m/${members[0][0]}` : "/",
    tag: `dose-${slot}`,
  };
}

export interface ReminderFollowUp {
  visit_id: string;
  member_name: string;
  doctor_name: string | null;
  follow_up_on: string;
  follow_up_note: string | null;
}

/** Follow-ups due today or tomorrow. Null when there are none. */
export function followUpMessage(followUps: ReminderFollowUp[], date: string, details: boolean): ReminderMessage | null {
  const tomorrow = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const due = followUps.filter((f) => f.follow_up_on === date || f.follow_up_on === tomorrow);
  if (!due.length) return null;
  const line = (f: ReminderFollowUp) =>
    `${f.follow_up_on === date ? "Today" : "Tomorrow"}: ${f.member_name}${details && f.doctor_name ? ` with ${f.doctor_name}` : ""}${details && f.follow_up_note ? ` (${f.follow_up_note})` : ""}`;
  return {
    title: due.length === 1 ? "Follow-up visit" : `${due.length} follow-up visits`,
    body: due.map(line).join("\n"),
    url: due.length === 1 ? `/visits/${due[0].visit_id}` : "/",
    tag: "follow-up",
  };
}

export const BACKUP_DAYS = 30;

export function backupMessage(lastExport: string | null, now: Date): ReminderMessage | null {
  if (lastExport && now.getTime() - Date.parse(lastExport) < BACKUP_DAYS * 86_400_000) return null;
  return {
    title: "Time for a backup",
    body: lastExport ? `Your last Med Vault backup was over ${BACKUP_DAYS} days ago. It takes a minute: Settings → Backup.` : "Keep a copy of your family's records on Google Drive: Settings → Backup.",
    url: "/settings",
    tag: "backup",
  };
}
