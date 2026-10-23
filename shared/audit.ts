/**
 * The security log (audit_log): which phone did what, and when. Kept one year, also after a vault is
 * deleted. Holds no medical content. What it can answer: docs/AUDIT_LOG.md.
 */

/** How long a log entry is kept. DPDP Rules 2025, Rule 6: logs for at least one year. */
export const AUDIT_DAYS = 365;

export type AuditAction =
  | "vault.create"
  | "vault.update"
  | "vault.delete"
  | "device.link"
  | "device.recover"
  | "device.logout"
  | "device.remove"
  | "device.link_code"
  | "recovery_key.rotate"
  | "consent.privacy"
  | "consent.ai"
  | "backup.export"
  | "backup.restore"
  | "record.create"
  | "record.update"
  | "record.delete"
  | "file.upload"
  | "file.delete"
  | "ai.scan"
  | "ai.review"
  | "reminders.set"
  | "reminders.off";

/** One entry as the Activity screen shows it. */
export interface AuditEntry {
  id: number;
  at: string;
  device_id: string | null;
  device_name: string | null;
  client: string | null;
  country: string | null;
  action: AuditAction;
  record_type: string | null;
  record_id: string | null;
  member_id: string | null;
  member_name: string | null;
  detail: Record<string, unknown> | null;
  /** The phone is still linked to the vault. */
  linked: boolean;
}

/** Record types in plain words, singular. */
export const RECORD_WORDS: Record<string, string> = {
  member: "family member",
  doctor: "doctor",
  allergy: "allergy",
  condition: "condition",
  medication: "medicine",
  prescription: "prescription",
  report: "report",
  visit: "visit",
  reading: "BP or sugar reading",
  lab_results: "report results",
  file: "photo or PDF",
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

/** "added a medicine", "removed the phone Pixel"... */
export function describeAudit(e: Pick<AuditEntry, "action" | "record_type" | "detail">): string {
  const thing = article(RECORD_WORDS[e.record_type ?? ""] ?? "record");
  const d = e.detail ?? {};
  switch (e.action) {
    case "vault.create":
      return "created the vault";
    case "vault.update":
      return Array.isArray(d.fields) && d.fields.includes("contact_email") ? "changed the security contact email" : "renamed the vault";
    case "vault.delete":
      return "deleted the vault";
    case "device.link":
      return "joined the vault with a link code";
    case "device.recover":
      return "joined the vault with the recovery key";
    case "device.logout":
      return "logged out";
    case "device.remove":
      return `removed the phone ${typeof d.device_name === "string" ? `"${d.device_name}"` : ""}`.trim();
    case "device.link_code":
      return "made a link code for another phone";
    case "recovery_key.rotate":
      return "made a new recovery key (the old one stopped working)";
    case "consent.privacy":
      return "agreed to the privacy notice";
    case "consent.ai":
      return d.allow ? "turned AI reading on" : "turned AI reading off";
    case "backup.export":
      return "downloaded a backup";
    case "backup.restore":
      return "restored a backup";
    case "record.create":
      return `added ${thing}`;
    case "record.update":
      return `edited ${thing}`;
    case "record.delete":
      return `deleted ${thing}`;
    case "file.upload":
      return "added a photo or PDF";
    case "file.delete":
      return "deleted a photo or PDF";
    case "ai.scan":
      return `read ${article(typeof d.kind === "string" ? d.kind : "photo")} with AI`;
    case "ai.review":
      return "ran a medicine check";
    case "reminders.set":
      return "set up reminders on this phone";
    case "reminders.off":
      return "turned off reminders";
    default:
      return "did something";
  }
}
