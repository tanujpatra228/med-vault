import type { Context, Hono } from "hono";
import type { FileOwner } from "../shared/types";
import type { AppEnv } from "./env";
import { deleteR2, fileIdsFor } from "./files";
import { badRequest, notFound, nowIso, readJson } from "./http";
import { validate, type Schema } from "./validate";
import { assertConditions, conditionIdsFrom, deleteLinksStmt, setLinksStmts, type ConditionOwner } from "./conditionLinks";

export interface Resource {
  table: string;
  schema: Schema;
  /** SELECT ... FROM <table> t [JOIN ...]; the main table must be aliased `t`. */
  select: string;
  /** Newest first: always a date DESC then created_at DESC. */
  orderBy: string;
  /** Query params allowed as equality filters, mapped to columns. */
  filters?: Record<string, string>;
  fileOwner?: FileOwner;
  /** Set when records can be linked to several conditions (`condition_ids`, see conditionLinks.ts). */
  conditionOwner?: ConditionOwner;
  /** Child records that follow this record's conditions when they change (a prescription's medicines and visit). */
  conditionChildren?: Array<{ owner: ConditionOwner; table: string; fk: string }>;
  /** Runs on the raw body before validation (create and update). */
  prepare?: (input: Record<string, unknown>) => Record<string, unknown>;
}

type Op = "list" | "get" | "create" | "update" | "delete";

/** Tenant isolation: every row read or written must belong to the caller's vault. */
export async function getOne<T>(db: D1Database, r: Resource, vaultId: string, id: string): Promise<T> {
  const row = await db.prepare(`${r.select} WHERE t.id = ? AND t.vault_id = ?`).bind(id, vaultId).first<T>();
  if (!row) throw notFound();
  return row;
}

/** Rejects links (member_id, doctor_id, ...) to records outside this vault. */
export async function assertRefs(db: D1Database, schema: Schema, vaultId: string, data: Record<string, string | null>) {
  const checks = Object.entries(schema).flatMap(([key, spec]) =>
    spec.type === "id" && data[key] ? [{ key, stmt: db.prepare(`SELECT COUNT(*) AS n FROM ${spec.ref} WHERE id = ? AND vault_id = ?`).bind(data[key], vaultId) }] : [],
  );
  if (!checks.length) return;
  const results = await db.batch<{ n: number }>(checks.map((c) => c.stmt));
  results.forEach((r, i) => {
    if (!r.results[0]?.n) throw badRequest(`${checks[i].key.replace(/_id$/, "")} not found`);
  });
}

export function insertStmt(db: D1Database, table: string, id: string, vaultId: string, data: Record<string, string | null>) {
  const cols = ["id", "vault_id", ...Object.keys(data)];
  return db
    .prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(id, vaultId, ...Object.values(data));
}

const vault = (c: Context<AppEnv>) => c.get("vaultId");

/** Gives every child of a record (e.g. a prescription's medicines) the record's condition links. */
function childLinksStmts(db: D1Database, vaultId: string, ch: { owner: ConditionOwner; table: string; fk: string }, parentId: string, conditionIds: string[]) {
  return [
    db.prepare(`UPDATE ${ch.table} SET condition_id = ? WHERE ${ch.fk} = ? AND vault_id = ?`).bind(conditionIds[0] ?? null, parentId, vaultId),
    db.prepare(`DELETE FROM record_conditions WHERE owner_type = ? AND owner_id IN (SELECT id FROM ${ch.table} WHERE ${ch.fk} = ? AND vault_id = ?)`).bind(ch.owner, parentId, vaultId),
    db
      .prepare(
        `INSERT OR IGNORE INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
         SELECT ?, ?, x.id, k.value FROM ${ch.table} x, json_each(?) k WHERE x.${ch.fk} = ? AND x.vault_id = ?`,
      )
      .bind(vaultId, ch.owner, JSON.stringify(conditionIds), parentId, vaultId),
  ];
}

/** Registers REST routes for a resource. Routes registered on `app` earlier take precedence. */
export function crud(app: Hono<AppEnv>, r: Resource, skip: Op[] = []) {
  const on = (op: Op) => !skip.includes(op);

  if (on("list"))
    app.get("/", async (c) => {
      const where = ["t.vault_id = ?"];
      const binds = [vault(c)];
      for (const [param, column] of Object.entries(r.filters ?? {})) {
        const v = c.req.query(param);
        if (v) {
          where.push(`${column} = ?`);
          binds.push(v);
        }
      }
      const { results } = await c.env.DB.prepare(`${r.select} WHERE ${where.join(" AND ")} ORDER BY ${r.orderBy}`).bind(...binds).all();
      return c.json(results);
    });

  if (on("get")) app.get("/:id", async (c) => c.json(await getOne(c.env.DB, r, vault(c), c.req.param("id"))));

  if (on("create"))
    app.post("/", async (c) => {
      const body = await readJson(c);
      const conditionIds = r.conditionOwner ? conditionIdsFrom(body) : undefined;
      if (conditionIds) body.condition_id = conditionIds[0] ?? null; // first link kept in the legacy column
      const data = validate(r.schema, (r.prepare ?? ((x) => x))(body));
      await assertRefs(c.env.DB, r.schema, vault(c), data);
      if (conditionIds) await assertConditions(c.env.DB, vault(c), conditionIds);
      const id = crypto.randomUUID();
      await c.env.DB.batch([
        insertStmt(c.env.DB, r.table, id, vault(c), data),
        ...(conditionIds && r.conditionOwner ? setLinksStmts(c.env.DB, vault(c), r.conditionOwner, [id], conditionIds) : []),
      ]);
      return c.json(await getOne(c.env.DB, r, vault(c), id), 201);
    });

  if (on("update"))
    app.patch("/:id", async (c) => {
      const id = c.req.param("id");
      const body = await readJson(c);
      const conditionIds = r.conditionOwner ? conditionIdsFrom(body) : undefined;
      if (conditionIds) body.condition_id = conditionIds[0] ?? null;
      const data = validate(r.schema, (r.prepare ?? ((x) => x))(body), true);
      delete data.member_id; // records never move between members
      await assertRefs(c.env.DB, r.schema, vault(c), data);
      if (conditionIds) await assertConditions(c.env.DB, vault(c), conditionIds);
      const cols = Object.keys(data);
      if (cols.length) {
        const [res] = await c.env.DB.batch([
          c.env.DB.prepare(`UPDATE ${r.table} SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND vault_id = ?`).bind(
            ...Object.values(data),
            nowIso(),
            id,
            vault(c),
          ),
          ...(conditionIds && r.conditionOwner ? setLinksStmts(c.env.DB, vault(c), r.conditionOwner, [id], conditionIds) : []),
          ...(conditionIds ? (r.conditionChildren ?? []).flatMap((ch) => childLinksStmts(c.env.DB, vault(c), ch, id, conditionIds)) : []),
        ]);
        if (!res.meta.changes) throw notFound();
      }
      return c.json(await getOne(c.env.DB, r, vault(c), id));
    });

  if (on("delete"))
    app.delete("/:id", async (c) => {
      const id = c.req.param("id");
      await getOne(c.env.DB, r, vault(c), id); // 404 unless it is ours
      const fileIds = r.fileOwner ? await fileIdsFor(c.env.DB, r.fileOwner, id) : [];
      await c.env.DB.batch([
        ...(fileIds.length ? [c.env.DB.prepare(`DELETE FROM files WHERE id IN (${fileIds.map(() => "?").join(",")})`).bind(...fileIds)] : []),
        ...(r.conditionOwner ? [deleteLinksStmt(c.env.DB, r.conditionOwner, [id])] : []),
        c.env.DB.prepare(`DELETE FROM ${r.table} WHERE id = ? AND vault_id = ?`).bind(id, vault(c)),
      ]);
      await deleteR2(c.env.FILES, fileIds);
      return c.json({ ok: true });
    });
}
