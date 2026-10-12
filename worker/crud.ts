import type { Context, Hono } from "hono";
import type { FileOwner } from "../shared/types";
import type { AppEnv } from "./env";
import { deleteR2, fileIdsFor } from "./files";
import { badRequest, notFound, nowIso, readJson } from "./http";
import { validate, type Schema } from "./validate";

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
      const data = validate(r.schema, await readJson(c));
      await assertRefs(c.env.DB, r.schema, vault(c), data);
      const id = crypto.randomUUID();
      await insertStmt(c.env.DB, r.table, id, vault(c), data).run();
      return c.json(await getOne(c.env.DB, r, vault(c), id), 201);
    });

  if (on("update"))
    app.patch("/:id", async (c) => {
      const id = c.req.param("id");
      const data = validate(r.schema, await readJson(c), true);
      delete data.member_id; // records never move between members
      await assertRefs(c.env.DB, r.schema, vault(c), data);
      const cols = Object.keys(data);
      if (cols.length) {
        const res = await c.env.DB.prepare(`UPDATE ${r.table} SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND vault_id = ?`)
          .bind(...Object.values(data), nowIso(), id, vault(c))
          .run();
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
        c.env.DB.prepare(`DELETE FROM ${r.table} WHERE id = ? AND vault_id = ?`).bind(id, vault(c)),
      ]);
      await deleteR2(c.env.FILES, fileIds);
      return c.json({ ok: true });
    });
}
