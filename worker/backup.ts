import type { Context } from "hono";
import { BACKUP_FORMAT, BACKUP_VERSION, RESTORE_CHUNK, RESTORE_ORDER, type ConditionLink, type RestoreIdMap, type RestoreTable } from "../shared/backup";
import { assertConditions } from "./conditionLinks";
import type { AppEnv } from "./env";
import { badRequest, HttpError, nowIso, readJson } from "./http";
import { prepareMedication } from "./medication";
import { allergySchema, conditionSchema, doctorSchema, medicationSchema, memberSchema, prescriptionSchema, reportSchema, visitSchema, labValueSchema } from "./schemas";
import { validate, type Schema } from "./validate";

const TABLES: Record<RestoreTable, { schema: Schema; prepare?: (row: Record<string, unknown>) => Record<string, unknown> }> = {
  doctors: { schema: doctorSchema },
  members: { schema: memberSchema },
  conditions: { schema: conditionSchema },
  allergies: { schema: allergySchema },
  prescriptions: { schema: prescriptionSchema },
  medications: { schema: medicationSchema, prepare: prepareMedication },
  reports: { schema: reportSchema },
  visits: { schema: visitSchema },
  lab_values: { schema: labValueSchema },
};

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
  const [vault, links, ...rows] = await db.batch([
    db.prepare("SELECT name, created_at FROM vaults WHERE id = ?").bind(vaultId),
    db.prepare("SELECT owner_type, owner_id, condition_id FROM record_conditions WHERE vault_id = ? ORDER BY owner_type, owner_id").bind(vaultId),
    ...tables.map((t) => db.prepare(`SELECT * FROM ${t} WHERE vault_id = ? ORDER BY created_at ASC`).bind(vaultId)),
  ]);
  // For the monthly "time for a backup" reminder.
  await db.prepare("UPDATE vaults SET last_export_at = ? WHERE id = ?").bind(new Date().toISOString(), vaultId).run();
  const data: Record<string, unknown> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: nowIso(),
    vault: vault.results[0],
    record_conditions: links.results,
  };
  tables.forEach((t, i) => {
    data[t] = (rows[i].results as Array<Record<string, unknown>>).map(({ vault_id: _, ...row }) => row);
  });
  return c.json(data);
}

/**
 * Restores one chunk of a backup table into this vault. The app sends tables in RESTORE_ORDER, in
 * chunks of at most RESTORE_CHUNK rows (the free plan allows 10 ms of CPU per request), with the
 * old → new id maps of the tables already restored in `refs`. Every row is validated like a normal
 * write and gets a new id, so a backup can sit next to the original vault. The first chunk
 * (`start: true`) requires an empty vault. If a later chunk fails, the app deletes the restored
 * members and doctors (which cascades to everything else).
 */
export async function restoreVault(c: Context<AppEnv>) {
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const body = await readJson(c);
  const table = body.table as RestoreTable;
  if (!RESTORE_ORDER.includes(table)) throw badRequest("table is invalid");
  if (typeof body.version !== "number" || body.version > BACKUP_VERSION) throw badRequest("This backup was made by a newer version of Med Vault");
  const raw = body.rows;
  if (!Array.isArray(raw) || raw.length > RESTORE_CHUNK) throw badRequest(`rows must be a list of at most ${RESTORE_CHUNK}`);
  const refs = (body.refs && typeof body.refs === "object" ? body.refs : {}) as Partial<RestoreIdMap>;

  if (body.start === true) {
    const used = await db
      .prepare("SELECT (SELECT COUNT(*) FROM members WHERE vault_id = ?1) + (SELECT COUNT(*) FROM doctors WHERE vault_id = ?1) AS n")
      .bind(vaultId)
      .first<number>("n");
    if (used) throw new HttpError(409, "Restore only works into an empty vault. Create a new vault, then restore into it.");
  }

  const { schema, prepare } = TABLES[table];
  const ids: Record<string, string> = {};
  const rows: Array<Record<string, string | null>> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || typeof item.id !== "string") throw badRequest(`${table} has a damaged record`);
    const input = { ...(item as Record<string, unknown>) };
    // Rewrite links to the new ids; a link to a record missing from the backup is dropped.
    for (const [key, spec] of Object.entries(schema)) {
      if (spec.type !== "id" || typeof input[key] !== "string") continue;
      input[key] = refs[spec.ref]?.[input[key] as string] ?? null;
    }
    let data: Record<string, string | null>;
    try {
      data = validate(schema, prepare ? prepare(input) : input);
    } catch (e) {
      throw badRequest(`${table}: ${e instanceof Error ? e.message : "invalid record"}`);
    }
    const id = crypto.randomUUID();
    ids[item.id] = id;
    const stamp = (v: unknown) => (typeof v === "string" && TIMESTAMP_RE.test(v) ? v : nowIso());
    rows.push({ id, vault_id: vaultId, created_at: stamp(input.created_at), updated_at: stamp(input.updated_at), ...withDefaults(schema, data) });
  }
  // Tenant isolation: the id maps come from the app, so every linked id must be in this vault.
  const linked = new Map<string, Set<string>>();
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.type !== "id") continue;
    for (const row of rows) if (row[key]) (linked.get(spec.ref) ?? linked.set(spec.ref, new Set()).get(spec.ref)!).add(row[key]!);
  }
  if (linked.size) {
    const refTables = [...linked.keys()];
    const counts = await db.batch<{ n: number }>(
      refTables.map((t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE vault_id = ? AND id IN (SELECT value FROM json_each(?))`).bind(vaultId, JSON.stringify([...linked.get(t)!]))),
    );
    counts.forEach((r, i) => {
      if (r.results[0]?.n !== linked.get(refTables[i])!.size) throw badRequest(`${table}: a linked record is not in this vault`);
    });
  }

  if (rows.length) {
    // One statement, one JSON parameter: D1 counts queries per request, so no per-row INSERTs.
    const cols = ["id", "vault_id", "created_at", "updated_at", ...Object.keys(schema)];
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) SELECT ${cols.map((col) => `json_extract(value, '$.${col}')`).join(", ")} FROM json_each(?)`;
    const stmts = [db.prepare(sql).bind(JSON.stringify(rows))];
    // Older backups have no record_conditions: link each record to its single condition_id.
    const owner = OWNER_OF[table];
    if (owner)
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
             SELECT vault_id, ?, id, condition_id FROM ${table} WHERE vault_id = ? AND condition_id IS NOT NULL AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))`,
          )
          .bind(owner, vaultId, JSON.stringify(rows)),
      );
    await db.batch(stmts);
  }
  return c.json({ ids });
}

const OWNER_OF: Partial<Record<RestoreTable, ConditionLink["owner_type"]>> = {
  prescriptions: "prescription",
  medications: "medication",
  reports: "report",
  visits: "visit",
};
const TABLE_OF = Object.fromEntries(Object.entries(OWNER_OF).map(([t, o]) => [o, t])) as Record<ConditionLink["owner_type"], RestoreTable>;

/**
 * Restores condition links after all records, rewriting both ends to the new ids
 * (`refs` holds every table's map). Links whose record or condition is missing are dropped.
 */
export async function restoreLinks(c: Context<AppEnv>) {
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const body = await readJson(c);
  const raw = body.rows;
  if (!Array.isArray(raw) || raw.length > RESTORE_CHUNK * 4) throw badRequest("rows is invalid");
  const refs = (body.refs && typeof body.refs === "object" ? body.refs : {}) as Partial<RestoreIdMap>;
  const links: ConditionLink[] = [];
  for (const l of raw as ConditionLink[]) {
    const table = l && TABLE_OF[l.owner_type];
    const owner = table && typeof l.owner_id === "string" ? refs[table]?.[l.owner_id] : undefined;
    const condition = typeof l?.condition_id === "string" ? refs.conditions?.[l.condition_id] : undefined;
    if (owner && condition) links.push({ owner_type: l.owner_type, owner_id: owner, condition_id: condition });
  }
  if (!links.length) return c.json({ linked: 0 });
  // Tenant isolation: both ends must be in this vault.
  await assertConditions(db, vaultId, [...new Set(links.map((l) => l.condition_id))]);
  for (const [type, table] of Object.entries(TABLE_OF)) {
    const ownerIds = [...new Set(links.filter((l) => l.owner_type === type).map((l) => l.owner_id))];
    if (!ownerIds.length) continue;
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE vault_id = ? AND id IN (SELECT value FROM json_each(?))`).bind(vaultId, JSON.stringify(ownerIds)).first<number>("n");
    if (n !== ownerIds.length) throw badRequest("a linked record is not in this vault");
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
       SELECT ?, json_extract(value, '$.owner_type'), json_extract(value, '$.owner_id'), json_extract(value, '$.condition_id') FROM json_each(?)`,
    )
    .bind(vaultId, JSON.stringify(links))
    .run();
  return c.json({ linked: links.length });
}
