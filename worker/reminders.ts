import { Hono } from "hono";
import {
  backupMessage,
  doseMessage,
  dueEvents,
  followUpMessage,
  localNow,
  normalizePrefs,
  type ReminderFollowUp,
  type ReminderMed,
  type ReminderMessage,
} from "../shared/reminders";
import type { AppEnv, Env } from "./env";
import { badRequest, HttpError, notFound, readJson } from "./http";
import { b64url, generateVapidKeys, sendPush, type PushResult, type VapidKeys } from "./webpush";

/** Pushes per cron run. Each costs ~1-2 ms of CPU; the free plan allows 10 ms per run. */
const MAX_PER_RUN = 4;

/** Push services phones actually use. Anything else is refused (no sending to arbitrary URLs). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function validEndpoint(endpoint: unknown, allowLocal: boolean): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (allowLocal && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

/**
 * The VAPID key pair, generated on first use and kept in D1. Anyone who can read the database can
 * already read every record, so a separate secret would not add protection; it would only add setup.
 */
async function vapidKeys(db: D1Database): Promise<VapidKeys> {
  const row = await db.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first<string>("value");
  if (row) return JSON.parse(row) as VapidKeys;
  const keys = await generateVapidKeys();
  await db.prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  return JSON.parse((await db.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first<string>("value"))!) as VapidKeys;
}

/** VAPID "sub": the app's own URL (push services use it to contact the operator about abuse). */
async function subject(db: D1Database): Promise<string> {
  return (await db.prepare("SELECT value FROM app_keys WHERE name = 'origin'").first<string>("value")) ?? "https://med-vault.workers.dev";
}

interface SubRow {
  id: string;
  vault_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  prefs: string;
  last_export_at: string | null;
}

interface Sender {
  keys: VapidKeys;
  subject: string;
}

const sender = async (db: D1Database): Promise<Sender> => ({ keys: await vapidKeys(db), subject: await subject(db) });

async function send(db: D1Database, from: Sender, sub: SubRow, message: ReminderMessage): Promise<PushResult> {
  const result = await sendPush(sub, message, from.keys, from.subject);
  if (result === "gone") await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
  return result;
}

/**
 * Runs from the cron trigger every 5 minutes: for each phone, works out which reminders are due in
 * its own time zone, skips ones already sent, and sends at most MAX_PER_RUN (the rest go next run,
 * within the 90-minute late limit).
 */
export async function runReminders(env: Env, now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = env.DB;
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const [subs, logged] = await db.batch([
    db.prepare(
      "SELECT s.id, s.vault_id, s.endpoint, s.p256dh, s.auth, s.tz, s.prefs, v.last_export_at FROM push_subscriptions s JOIN vaults v ON v.id = s.vault_id",
    ),
    db.prepare("SELECT subscription_id || '|' || key AS k FROM reminder_log WHERE sent_at > ?").bind(since),
  ]);
  const done = new Set((logged.results as Array<{ k: string }>).map((r) => r.k));
  const queue = (subs.results as unknown as SubRow[]).flatMap((sub) => {
    const prefs = normalizePrefs(JSON.parse(sub.prefs));
    const local = localNow(sub.tz, now);
    return dueEvents(prefs, local)
      .filter((e) => !done.has(`${sub.id}|${e.key}`))
      .map((event) => ({ sub, prefs, local, event }));
  });

  const vaultData = new Map<string, Promise<{ meds: ReminderMed[]; followUps: Array<ReminderFollowUp & { member_id: string }> }>>();
  const load = (vaultId: string, date: string) => {
    if (!vaultData.has(vaultId))
      vaultData.set(
        vaultId,
        db
          .batch([
            db
              .prepare(
                `SELECT t.member_id, m.name AS member_name, t.name, t.strength, t.form, t.timing, t.schedule, t.dosage, t.start_date, t.end_date, t.status
                 FROM medications t JOIN members m ON m.id = t.member_id WHERE t.vault_id = ? AND t.status = 'active'`,
              )
              .bind(vaultId),
            db
              .prepare(
                `SELECT t.id AS visit_id, t.member_id, m.name AS member_name, d.name AS doctor_name, t.follow_up_on, t.follow_up_note
                 FROM visits t JOIN members m ON m.id = t.member_id LEFT JOIN doctors d ON d.id = t.doctor_id
                 WHERE t.vault_id = ? AND t.follow_up_done = 0 AND t.follow_up_on BETWEEN ? AND date(?, '+1 day')`,
              )
              .bind(vaultId, date, date),
          ])
          .then(([m, f]) => ({ meds: m.results as unknown as ReminderMed[], followUps: f.results as unknown as Array<ReminderFollowUp & { member_id: string }> })),
      );
    return vaultData.get(vaultId)!;
  };

  let from: Sender | null = null;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const logs: D1PreparedStatement[] = [];
  for (const { sub, prefs, local, event } of queue) {
    const data = await load(sub.vault_id, local.date);
    const wanted = <T extends { member_id: string }>(rows: T[]) => (prefs.members ? rows.filter((r) => prefs.members!.includes(r.member_id)) : rows);
    const message =
      event.kind === "dose"
        ? doseMessage(event.slot, wanted(data.meds), local.date, prefs.details)
        : event.kind === "followup"
          ? followUpMessage(wanted(data.followUps), local.date, prefs.details)
          : backupMessage(sub.last_export_at, now);
    if (message) {
      if (sent + failed >= MAX_PER_RUN) continue; // next run
      from ??= await sender(db);
      const result = await send(db, from, sub, message);
      if (result === "failed") {
        failed++;
        continue; // retried next run
      }
      if (result === "gone") continue;
      sent++;
    } else skipped++;
    logs.push(db.prepare("INSERT OR IGNORE INTO reminder_log (subscription_id, key) VALUES (?, ?)").bind(sub.id, event.key));
  }
  logs.push(db.prepare("DELETE FROM reminder_log WHERE sent_at < ?").bind(new Date(now.getTime() - 3 * 86_400_000).toISOString()));
  if (sent) logs.push(db.prepare("UPDATE push_subscriptions SET last_sent_at = ? WHERE id IN (SELECT subscription_id FROM reminder_log WHERE sent_at > ?)").bind(now.toISOString(), new Date(now.getTime() - 60_000).toISOString()));
  await db.batch(logs);
  return { sent, skipped, failed };
}

export const pushApi = new Hono<AppEnv>();

/** The public key a phone subscribes with. */
pushApi.get("/key", async (c) => {
  // Remember the app's URL for the VAPID subject (cron runs have no request to read it from).
  await c.env.DB.prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('origin', ?)").bind(new URL(c.req.url).origin).run();
  return c.json({ publicKey: (await vapidKeys(c.env.DB)).publicKey });
});

/** Turn reminders on for this phone, or update its settings. */
pushApi.put("/subscription", async (c) => {
  const body = await readJson(c);
  const keys = (body.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
  if (!validEndpoint(body.endpoint, c.env.PUSH_ALLOW_LOCAL === "1")) throw badRequest("This browser's push service is not supported");
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  try {
    if (b64url.decode(p256dh).length !== 65 || b64url.decode(auth).length !== 16) throw new Error();
  } catch {
    throw badRequest("Push keys are invalid");
  }
  const tz = typeof body.tz === "string" && body.tz.length <= 64 ? body.tz : "Asia/Kolkata";
  const prefs = normalizePrefs(body.prefs);
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, vault_id, device_id, endpoint, p256dh, auth, tz, prefs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET vault_id = excluded.vault_id, device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, prefs = excluded.prefs`,
  )
    .bind(crypto.randomUUID(), c.get("vaultId"), c.get("deviceId"), body.endpoint, p256dh, auth, tz, JSON.stringify(prefs))
    .run();
  return c.json({ prefs, tz });
});

/** This phone's reminder settings (by its push endpoint), if it is subscribed to this vault. */
pushApi.post("/subscription/find", async (c) => {
  const body = await readJson(c);
  const row = await c.env.DB.prepare("SELECT prefs, tz FROM push_subscriptions WHERE endpoint = ? AND vault_id = ?")
    .bind(String(body.endpoint ?? ""), c.get("vaultId"))
    .first<{ prefs: string; tz: string }>();
  if (!row) throw notFound("Reminders are off on this phone");
  return c.json({ prefs: normalizePrefs(JSON.parse(row.prefs)), tz: row.tz });
});

pushApi.delete("/subscription", async (c) => {
  const body = await readJson(c);
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND vault_id = ?").bind(String(body.endpoint ?? ""), c.get("vaultId")).run();
  return c.json({ ok: true });
});

/** Sends a test notification to this phone now. */
pushApi.post("/test", async (c) => {
  const body = await readJson(c);
  const sub = await c.env.DB.prepare(
    "SELECT s.id, s.vault_id, s.endpoint, s.p256dh, s.auth, s.tz, s.prefs, NULL AS last_export_at FROM push_subscriptions s WHERE s.endpoint = ? AND s.vault_id = ?",
  )
    .bind(String(body.endpoint ?? ""), c.get("vaultId"))
    .first<SubRow>();
  if (!sub) throw notFound("Reminders are off on this phone");
  const result = await send(c.env.DB, await sender(c.env.DB), sub, { title: "Med Vault reminders are on", body: "Medicine and follow-up reminders will appear like this.", url: "/settings", tag: "test" });
  if (result !== "sent") throw new HttpError(502, result === "gone" ? "This phone stopped accepting notifications. Turn reminders on again." : "The push service did not accept the message. Try again later.");
  return c.json({ ok: true });
});

/** Local development only: run the reminder job now (the cron trigger does this in production). */
pushApi.post("/run", async (c) => {
  if (c.env.PUSH_ALLOW_LOCAL !== "1") throw notFound();
  const body = await readJson(c).catch(() => ({}) as Record<string, unknown>);
  return c.json(await runReminders(c.env, typeof body.at === "string" ? new Date(body.at) : new Date()));
});
