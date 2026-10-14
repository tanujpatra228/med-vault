import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import { exportVault, restoreLinks, restoreVault } from "./backup";
import { assertConsent, createLinkCode, rotateRecoveryKey } from "./auth";
import { EMAIL_RE, PRIVACY_VERSION } from "../shared/privacy";
import { badRequest, HttpError, notFound, readJson } from "./http";

export const vaultApi = new Hono<AppEnv>();

vaultApi.get("/", async (c) => {
  const vaultId = c.get("vaultId");
  const db = c.env.DB;
  const [v, d, s] = await db.batch([
    db.prepare("SELECT id, name, created_at, consent_version, consent_at, ai_consent_at, contact_email FROM vaults WHERE id = ?").bind(vaultId),
    db.prepare("SELECT id, name, created_at, last_seen_at FROM devices WHERE vault_id = ? ORDER BY last_seen_at DESC").bind(vaultId),
    db.prepare("SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS files FROM files WHERE vault_id = ?").bind(vaultId),
  ]);
  const devices = (d.results as Array<{ id: string }>).map((row) => ({ ...row, current: row.id === c.get("deviceId") }));
  return c.json({ ...(v.results[0] as object), devices, storage: s.results[0] });
});

vaultApi.patch("/", async (c) => {
  const body = await readJson(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) throw badRequest("Vault name is required");
    sets.push("name = ?");
    binds.push(name);
  }
  // Optional email used only to tell the family about a security problem (DPDP breach notice).
  if ("contact_email" in body) {
    const email = typeof body.contact_email === "string" ? body.contact_email.trim().slice(0, 200) : "";
    if (email && !EMAIL_RE.test(email)) throw badRequest("That email address does not look right");
    sets.push("contact_email = ?");
    binds.push(email || null);
  }
  if (!sets.length) throw badRequest("Nothing to change");
  await c.env.DB.prepare(`UPDATE vaults SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).bind(...binds, new Date().toISOString(), c.get("vaultId")).run();
  return c.json({ ok: true });
});

// Agree to the current privacy notice (vaults created before it, or after it changes).
vaultApi.post("/consent", async (c) => {
  assertConsent(await readJson(c));
  await c.env.DB.prepare("UPDATE vaults SET consent_version = ?, consent_at = ? WHERE id = ?").bind(PRIVACY_VERSION, new Date().toISOString(), c.get("vaultId")).run();
  return c.json({ ok: true, consent_version: PRIVACY_VERSION });
});

// Allow or stop AI reading of photos and medicine checks. Stopping is as easy as allowing.
vaultApi.put("/ai-consent", async (c) => {
  const body = await readJson(c);
  if (typeof body.allow !== "boolean") throw badRequest("allow must be true or false");
  await c.env.DB.prepare("UPDATE vaults SET ai_consent_at = ? WHERE id = ?").bind(body.allow ? new Date().toISOString() : null, c.get("vaultId")).run();
  return c.json({ ok: true, ai_consent: body.allow });
});

// Backup: every record as JSON (the app adds the files and builds the ZIP), and restore into an empty vault.
vaultApi.get("/export", exportVault);
vaultApi.post("/restore", restoreVault);
vaultApi.post("/restore/links", restoreLinks);

// One-time code (valid 10 minutes) that another phone types or opens as a link to join this vault.
vaultApi.post("/link-code", async (c) => c.json(await createLinkCode(c.env.DB, c.get("vaultId")), 201));

// Replaces the recovery key; the old one stops working immediately.
vaultApi.post("/recovery-key", async (c) => c.json({ recovery_key: await rotateRecoveryKey(c.env.DB, c.get("vaultId")) }));

vaultApi.delete("/devices/:id", async (c) => {
  const id = c.req.param("id");
  if (id === c.get("deviceId")) throw badRequest("Use 'Log out this device' to remove the phone you are using");
  const res = await c.env.DB.prepare("DELETE FROM devices WHERE id = ? AND vault_id = ?").bind(id, c.get("vaultId")).run();
  if (!res.meta.changes) throw notFound("Device not found");
  return c.json({ ok: true });
});

// Deletes the vault, every record in it (FK cascade) and every stored file.
vaultApi.delete("/", async (c) => {
  const vaultId = c.get("vaultId");
  const body = await readJson(c);
  const vault = await c.env.DB.prepare("SELECT name FROM vaults WHERE id = ?").bind(vaultId).first<{ name: string }>();
  if (!vault) throw notFound();
  if (typeof body.confirm_name !== "string" || body.confirm_name.trim() !== vault.name)
    throw new HttpError(400, "Type the vault name exactly to confirm");
  const { results } = await c.env.DB.prepare("SELECT id FROM files WHERE vault_id = ?").bind(vaultId).all<{ id: string }>();
  const ids = results.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 1000) await c.env.FILES.delete(ids.slice(i, i + 1000));
  await c.env.DB.prepare("DELETE FROM vaults WHERE id = ?").bind(vaultId).run();
  deleteCookie(c, "mv_device", { path: "/" });
  return c.json({ ok: true });
});
