import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import { normalizeCode, randomCode, randomToken, recoveryKey, sha256Hex } from "./crypto";
import { badRequest, HttpError, readJson } from "./http";
import { PRIVACY_UPDATED, PRIVACY_VERSION, type PrivacyMeta } from "../shared/privacy";

const COOKIE = "mv_device";
const DEVICE_DAYS = 400; // browsers cap cookie lifetime at ~400 days; refreshed on use
const LINK_CODE_MINUTES = 10;
const LIMITS = {
  create: { max: 5, minutes: 24 * 60 }, // new vaults per IP per day
  join_fail: { max: 10, minutes: 15 }, // wrong link codes / recovery keys per IP
};

type RateKind = keyof typeof LIMITS;

const ip = (c: Context) => c.req.header("cf-connecting-ip") ?? "local";

async function checkRate(c: Context<AppEnv>, kind: RateKind) {
  const { max, minutes } = LIMITS[kind];
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM rate_events WHERE ip = ? AND kind = ? AND at > ?")
    .bind(ip(c), kind, since)
    .first<number>("n");
  if ((n ?? 0) >= max) throw new HttpError(429, "Too many attempts. Please try again later.");
}

const recordRate = (c: Context<AppEnv>, kind: RateKind) =>
  c.env.DB.prepare("INSERT INTO rate_events (ip, kind) VALUES (?, ?)").bind(ip(c), kind);

function deviceName(c: Context, raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
  if (name) return name;
  const ua = c.req.header("user-agent") ?? "";
  return /Android/i.test(ua) ? "Android phone" : /iPhone|iPad/i.test(ua) ? "iPhone" : "Browser";
}

function setDeviceCookie(c: Context, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: DEVICE_DAYS * 86_400,
  });
}

/** Adds a device to a vault and logs this browser in as it. Returns the statements to batch. */
async function newDevice(c: Context<AppEnv>, vaultId: string, name: string) {
  const token = randomToken();
  setDeviceCookie(c, token);
  return c.env.DB.prepare("INSERT INTO devices (id, vault_id, name, token_hash) VALUES (?, ?, ?, ?)").bind(
    crypto.randomUUID(),
    vaultId,
    name,
    await sha256Hex(token),
  );
}

export const auth = new Hono<AppEnv>();

auth.get("/me", async (c) => {
  const token = getCookie(c, COOKIE);
  const row = token
    ? await c.env.DB.prepare(
        `SELECT d.id AS device_id, d.name AS device_name, v.id AS vault_id, v.name AS vault_name, v.consent_version, v.ai_consent_at
         FROM devices d JOIN vaults v ON v.id = d.vault_id WHERE d.token_hash = ?`,
      )
        .bind(await sha256Hex(token))
        .first<{ device_id: string; device_name: string; vault_id: string; vault_name: string; consent_version: number | null; ai_consent_at: string | null }>()
    : null;
  if (!row) return c.json({ authenticated: false });
  return c.json({
    authenticated: true,
    vault: { id: row.vault_id, name: row.vault_name, consent_version: row.consent_version, ai_consent: !!row.ai_consent_at },
    device: { id: row.device_id, name: row.device_name },
  });
});

// Create a new vault. No signup: this browser becomes its first device.
// Public: what the privacy notice needs to show before anyone has a vault.
auth.get("/privacy", (c) =>
  c.json({
    version: PRIVACY_VERSION,
    updated: PRIVACY_UPDATED,
    operator: c.env.OPERATOR_NAME?.trim() || null,
    contact: c.env.GRIEVANCE_EMAIL?.trim() || null,
  } satisfies PrivacyMeta),
);

/** Consent must name the current notice version and include the guardian confirmation. */
export function assertConsent(body: Record<string, unknown>) {
  const consent = body.consent as { version?: unknown; guardian?: unknown } | undefined;
  if (!consent || consent.version !== PRIVACY_VERSION || consent.guardian !== true)
    throw badRequest("Please read the privacy notice and tick both boxes to continue");
}

auth.post("/vault", async (c) => {
  await checkRate(c, "create");
  const body = await readJson(c);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) throw badRequest("Give your vault a name");
  assertConsent(body);
  const vaultId = crypto.randomUUID();
  const key = recoveryKey();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO vaults (id, name, recovery_hash, consent_version, consent_at) VALUES (?, ?, ?, ?, ?)").bind(
      vaultId,
      name,
      await sha256Hex(normalizeCode(key)),
      PRIVACY_VERSION,
      new Date().toISOString(),
    ),
    // Rate-limit records hold IP addresses: keep them only as long as the longest limit (1 day).
    c.env.DB.prepare("DELETE FROM rate_events WHERE at < ? AND ip NOT LIKE 'vault:%'").bind(new Date(Date.now() - 2 * 86_400_000).toISOString()),
    await newDevice(c, vaultId, deviceName(c, body.device_name)),
    recordRate(c, "create"),
  ]);
  return c.json({ vault: { id: vaultId, name }, recovery_key: key }, 201);
});

// Join a vault with a one-time link code from an already linked device.
auth.post("/link", async (c) => {
  await checkRate(c, "join_fail");
  const body = await readJson(c);
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  const hash = await sha256Hex(code);
  const row = await c.env.DB.prepare("SELECT vault_id FROM link_codes WHERE code_hash = ? AND expires_at > ?")
    .bind(hash, new Date().toISOString())
    .first<{ vault_id: string }>();
  if (!row) {
    await recordRate(c, "join_fail").run();
    throw new HttpError(400, "That code is wrong or has expired. Create a new one on your other phone.");
  }
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM link_codes WHERE code_hash = ? OR expires_at < ?").bind(hash, new Date().toISOString()),
    await newDevice(c, row.vault_id, deviceName(c, body.device_name)),
  ]);
  return c.json({ ok: true });
});

// Join a vault with its recovery key (all devices lost).
auth.post("/recover", async (c) => {
  await checkRate(c, "join_fail");
  const body = await readJson(c);
  const key = normalizeCode(typeof body.recovery_key === "string" ? body.recovery_key : "");
  const row = key
    ? await c.env.DB.prepare("SELECT id FROM vaults WHERE recovery_hash = ?").bind(await sha256Hex(key)).first<{ id: string }>()
    : null;
  if (!row) {
    await recordRate(c, "join_fail").run();
    throw new HttpError(400, "That recovery key does not match any vault");
  }
  await (await newDevice(c, row.id, deviceName(c, body.device_name))).run();
  return c.json({ ok: true });
});

// Unlink this device. Other devices keep access.
auth.post("/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM devices WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export async function createLinkCode(db: D1Database, vaultId: string) {
  const code = randomCode(8);
  const expires = new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString();
  await db.prepare("INSERT INTO link_codes (code_hash, vault_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(code), vaultId, expires).run();
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expires_at: expires };
}

export async function rotateRecoveryKey(db: D1Database, vaultId: string) {
  const key = recoveryKey();
  await db.prepare("UPDATE vaults SET recovery_hash = ?, updated_at = ? WHERE id = ?").bind(await sha256Hex(normalizeCode(key)), new Date().toISOString(), vaultId).run();
  return key;
}

/** Resolves the device cookie to a vault. Every non-auth API route sits behind this. */
export const requireDevice: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  const row = token
    ? await c.env.DB.prepare("SELECT id, vault_id, last_seen_at FROM devices WHERE token_hash = ?")
        .bind(await sha256Hex(token))
        .first<{ id: string; vault_id: string; last_seen_at: string }>()
    : null;
  if (!row) throw new HttpError(401, "This device is not linked to a vault");
  c.set("vaultId", row.vault_id);
  c.set("deviceId", row.id);
  // At most one write per device per day: keeps the cookie fresh without spending D1 writes on every request.
  if (Date.now() - Date.parse(row.last_seen_at) > 86_400_000) {
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run());
    setDeviceCookie(c, token!);
  }
  await next();
};
