import type { Context } from "hono";
import { BACKUP_FORMAT, BACKUP_VERSION, RESTORE_ORDER, type RestoreIdMap, type RestoreTable } from "../shared/backup";
import type { AppEnv } from "./env";
import { badRequest, HttpError, nowIso, readJson } from "./http";
import { prepareMedication } from "./medication";
import { allergySchema, conditionSchema, doctorSchema, medicationSchema, memberSchema, prescriptionSchema, reportSchema } from "./schemas";
import { validate, type Schema } from "./validate";

const TABLES: Record<RestoreTable, { schema: Schema; prepare?: (row: Record<string, unknown>) => Record<string, unknown> }> = {
  doctors: { schema: doctorSchema },
  members: { schema: memberSchema },
  conditions: { schema: conditionSchema },
  allergies: { schema: allergySchema },
  prescriptions: { schema: prescriptionSchema },
  medications: { schema: medicationSchema, prepare: prepareMedication },
  reports: { schema: reportSchema },
};

const MAX_ROWS = 50_000;
/** Rows go to D1 as one JSON parameter per statement; keep each well under D1's 2 MB value limit. */
const CHUNK_BYTES = 500_000;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
/** Column defaults from the schema, for NOT NULL columns a record may leave out. */
const DEFAULTS: Record<string, string> = { kind: "drug", severity: "moderate", status: "active", report_type: "other" };

function withDefaults(schema: Schema, data: Record<string, string | null>) {
  const out = { ...data };
  for (const key of Object.keys(schema)) if (out[key] == null && key in DEFAULTS) out[key] = DEFAULTS[key];
  return out;
}

/** Every record in the vault, without vault ids. Files are listed; the app downloads their bytes. */
export async function exportVault(c: Context<AppEnv>) {
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const tables = [...RESTORE_ORDER, "files"] as const;
  const [vault, ...rows] = await db.batch([
    db.prepare("SELECT name, created_at FROM vaults WHERE id = ?").bind(vaultId),
    ...tables.map((t) => db.prepare(`SELECT * FROM ${t} WHERE vault_id = ? ORDER BY created_at ASC`).bind(vaultId)),
  ]);
  const data: Record<string, unknown> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: nowIso(),
    vault: vault.results[0],
  };
  tables.forEach((t, i) => {
    data[t] = (rows[i].results as Array<Record<string, unknown>>).map(({ vault_id: _, ...row }) => row);
  });
  return c.json(data);
}

/**
 * Restores a backup's records into this vault, which must be empty. Every row is validated like a
 * normal write and gets a new id (so a backup can be restored next to the original vault); links
 * between records are rewritten to the new ids. All inserts run in one D1 batch: all or nothing.
 * Files are not part of this call: the app uploads them afterwards using the returned id map.
 */
export async function restoreVault(c: Context<AppEnv>) {
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const body = await readJson(c);
  if (body.format !== BACKUP_FORMAT) throw badRequest("This is not a Med Vault backup");
  if (typeof body.version !== "number" || body.version > BACKUP_VERSION) throw badRequest("This backup was made by a newer version of Med Vault");

  const used = await db
    .prepare("SELECT (SELECT COUNT(*) FROM members WHERE vault_id = ?1) + (SELECT COUNT(*) FROM doctors WHERE vault_id = ?1) AS n")
    .bind(vaultId)
    .first<number>("n");
  if (used) throw new HttpError(409, "Restore only works into an empty vault. Create a new vault, then restore into it.");

  const ids = Object.fromEntries(RESTORE_ORDER.map((t) => [t, {}])) as RestoreIdMap;
  const stmts: D1PreparedStatement[] = [];
  let total = 0;

  for (const table of RESTORE_ORDER) {
    const raw = body[table] ?? [];
    if (!Array.isArray(raw)) throw badRequest(`${table} is invalid`);
    total += raw.length;
    if (total > MAX_ROWS) throw badRequest("This backup is too large to restore");
    const { schema, prepare } = TABLES[table];
    const rows: Array<Record<string, string | null>> = [];

    for (const item of raw) {
      if (!item || typeof item !== "object" || typeof item.id !== "string") throw badRequest(`${table} has a damaged record`);
      const input = { ...(item as Record<string, unknown>) };
      // Rewrite links to the new ids; a link to a record missing from the backup is dropped.
      for (const [key, spec] of Object.entries(schema)) {
        if (spec.type !== "id" || typeof input[key] !== "string") continue;
        input[key] = ids[spec.ref][input[key] as string] ?? null;
      }
      let data: Record<string, string | null>;
      try {
        data = validate(schema, prepare ? prepare(input) : input);
      } catch (e) {
        throw badRequest(`${table}: ${e instanceof Error ? e.message : "invalid record"}`);
      }
      const id = crypto.randomUUID();
      ids[table][item.id] = id;
      const stamp = (v: unknown) => (typeof v === "string" && TIMESTAMP_RE.test(v) ? v : nowIso());
      rows.push({ id, vault_id: vaultId, created_at: stamp(input.created_at), updated_at: stamp(input.updated_at), ...withDefaults(schema, data) });
    }
    if (!rows.length) continue;

    const cols = ["id", "vault_id", "created_at", "updated_at", ...Object.keys(schema)];
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) SELECT ${cols.map((col) => `json_extract(value, '$.${col}')`).join(", ")} FROM json_each(?)`;
    let chunk: typeof rows = [];
    let bytes = 0;
    const flush = () => {
      if (chunk.length) stmts.push(db.prepare(sql).bind(JSON.stringify(chunk)));
      chunk = [];
      bytes = 0;
    };
    for (const row of rows) {
      const size = JSON.stringify(row).length;
      if (bytes + size > CHUNK_BYTES) flush();
      chunk.push(row);
      bytes += size;
    }
    flush();
  }

  if (!total) throw badRequest("This backup has no records");
  await db.batch(stmts);
  return c.json({ ids, records: total });
}
