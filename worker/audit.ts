import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";
import { AUDIT_DAYS, type AuditAction } from "../shared/audit";

/** What a log entry says about a request, apart from who and where. */
export interface AuditFacts {
  action: AuditAction;
  record_type?: string | null;
  record_id?: string | null;
  member_id?: string | null;
  detail?: Record<string, unknown> | null;
}

/** Who sent a request and from where, without the IP address. */
export interface AuditWho {
  vault_id: string;
  device_id: string | null;
  device_name: string | null;
  client: string | null;
  country: string | null;
}

/** The kind of phone or computer, from the user agent. */
export function clientOf(ua: string | undefined): string {
  if (!ua) return "Other";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  return "Other";
}

export function whoOf(c: Context<AppEnv>, vaultId: string, deviceId: string | null, deviceName: string | null): AuditWho {
  const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf;
  return {
    vault_id: vaultId,
    device_id: deviceId,
    device_name: deviceName,
    client: clientOf(c.req.header("user-agent")),
    country: cf?.country ?? c.req.header("cf-ipcountry") ?? null,
  };
}

export const auditStmt = (db: D1Database, who: AuditWho, f: AuditFacts) =>
  db
    .prepare(
      "INSERT INTO audit_log (vault_id, device_id, device_name, client, country, action, record_type, record_id, member_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      who.vault_id,
      who.device_id,
      who.device_name,
      who.client,
      who.country,
      f.action,
      f.record_type ?? null,
      f.record_id ?? null,
      f.member_id ?? null,
      f.detail ? JSON.stringify(f.detail) : null,
    );

const RECORDS: Record<string, string> = {
  members: "member",
  doctors: "doctor",
  allergies: "allergy",
  conditions: "condition",
  medications: "medication",
  prescriptions: "prescription",
  reports: "report",
  visits: "visit",
  readings: "reading",
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Names of the fields a request changed (never their values), for "edited a medicine: dosage, notes". */
export const fieldNames = (body: Record<string, unknown> | null) =>
  body
    ? Object.keys(body)
        .filter((k) => k !== "id" && /^[a-z_]{1,40}$/.test(k))
        .slice(0, 20)
    : [];

/**
 * Maps a successful request that changed something to a log entry; null for reads and checks that
 * change nothing. `req` is the JSON body sent, `res` the JSON reply. Only ids and field names are
 * taken from them, never values.
 */
export function auditFor(method: string, path: string, status: number, req: Record<string, unknown> | null, res: Record<string, unknown> | null): AuditFacts | null {
  if (status < 200 || status >= 300) return null;
  const p = path.replace(/^\/api/, "").replace(/\/$/, "");
  const record = p.match(/^\/([a-z]+)(?:\/([\w-]+))?$/);
  if (record && RECORDS[record[1]]) {
    const type = RECORDS[record[1]];
    const memberId = (type === "member" ? str(res?.id) : null) ?? str(res?.member_id) ?? str(req?.member_id);
    if (method === "POST" && !record[2])
      // 200 is a reading sent again after a lost reply: it was saved the first time.
      return status === 201 ? { action: "record.create", record_type: type, record_id: str(res?.id), member_id: memberId } : null;
    if (method === "PATCH" && record[2]) return { action: "record.update", record_type: type, record_id: record[2], member_id: memberId, detail: { fields: fieldNames(req) } };
    if (method === "DELETE" && record[2]) return { action: "record.delete", record_type: type, record_id: record[2] };
    return null;
  }
  const key = `${method} ${p.replace(/^\/(labs\/report|files|vault\/devices)\/[\w-]+$/, "/$1/:id")}`;
  const id = p.split("/").pop() ?? null;
  switch (key) {
    case "PUT /labs/report/:id":
      return { action: "record.update", record_type: "lab_results", record_id: id, member_id: str(res?.member_id) };
    case "POST /files":
      return { action: "file.upload", record_type: "file", record_id: str(res?.id), detail: { owner_type: str(res?.owner_type) } };
    case "DELETE /files/:id":
      return { action: "file.delete", record_type: "file", record_id: id };
    case "POST /ai/scan":
      return { action: "ai.scan", detail: { kind: str(req?.kind) } };
    case "POST /ai/review":
      return { action: "ai.review", member_id: str(req?.member_id) };
    case "PATCH /vault":
      return { action: "vault.update", detail: { fields: fieldNames(req) } };
    case "DELETE /vault":
      return { action: "vault.delete" };
    case "POST /vault/consent":
      return { action: "consent.privacy", detail: { version: res?.consent_version ?? null } };
    case "PUT /vault/ai-consent":
      return { action: "consent.ai", detail: { allow: req?.allow === true } };
    case "GET /vault/export":
      return { action: "backup.export" };
    case "POST /vault/restore":
      return { action: "backup.restore" };
    case "POST /vault/link-code":
      return { action: "device.link_code" };
    case "POST /vault/recovery-key":
      return { action: "recovery_key.rotate" };
    case "DELETE /vault/devices/:id":
      return { action: "device.remove", record_type: "device", record_id: id };
    case "PUT /push/subscription":
      return { action: "reminders.set" };
    case "DELETE /push/subscription":
      return { action: "reminders.off" };
    default:
      return null;
  }
}

async function jsonOf(get: () => Promise<unknown>): Promise<Record<string, unknown> | null> {
  try {
    const v = await get();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Logs every change a signed-in phone makes, after the reply is sent. Runs after requireDevice.
 * A route can add facts the request does not carry (a removed phone's name) with c.set("auditDetail").
 */
export const auditTrail: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const method = c.req.method;
  if (method === "GET" && c.req.path !== "/api/vault/export") return;
  const isJson = (h: string | null | undefined) => !!h?.includes("application/json");
  const req = isJson(c.req.header("content-type")) ? await jsonOf(() => c.req.json()) : null;
  const res = isJson(c.res.headers.get("content-type")) && method !== "GET" ? await jsonOf(() => c.res.clone().json()) : null;
  const facts = auditFor(method, c.req.path, c.res.status, req, res);
  if (!facts) return;
  const extra = c.get("auditDetail");
  if (extra) facts.detail = { ...facts.detail, ...extra };
  const write = auditStmt(c.env.DB, whoOf(c, c.get("vaultId"), c.get("deviceId"), c.get("deviceName")), facts)
    .run()
    .catch((e) => console.error("audit log write failed", e));
  c.executionCtx.waitUntil(write);
};

/** Deletes entries older than a year. Run once a day from the cron. */
export const purgeAudit = (db: D1Database, now = new Date()) =>
  db.prepare("DELETE FROM audit_log WHERE at < ?").bind(new Date(now.getTime() - AUDIT_DAYS * 86_400_000).toISOString()).run();
