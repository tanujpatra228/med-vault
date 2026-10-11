import type { Hono } from "hono";
import type { FileOwner } from "../shared/types";
import type { AppEnv } from "./env";
import { deleteR2, fileIdsFor } from "./files";
import { notFound, nowIso, readJson } from "./http";
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

export async function getOne<T>(db: D1Database, r: Resource, id: string): Promise<T> {
  const row = await db.prepare(`${r.select} WHERE t.id = ?`).bind(id).first<T>();
  if (!row) throw notFound();
  return row;
}

export function insertStmt(db: D1Database, table: string, id: string, data: Record<string, string | null>) {
  const cols = ["id", ...Object.keys(data)];
  return db
    .prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(id, ...Object.values(data));
}

/** Registers REST routes for a resource. Routes registered on `app` earlier take precedence. */
export function crud(app: Hono<AppEnv>, r: Resource, skip: Op[] = []) {
  const on = (op: Op) => !skip.includes(op);

  if (on("list"))
    app.get("/", async (c) => {
      const where: string[] = [];
      const binds: string[] = [];
      for (const [param, column] of Object.entries(r.filters ?? {})) {
        const v = c.req.query(param);
        if (v) {
          where.push(`${column} = ?`);
          binds.push(v);
        }
      }
      const sql = `${r.select}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${r.orderBy}`;
      const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
      return c.json(results);
    });

  if (on("get")) app.get("/:id", async (c) => c.json(await getOne(c.env.DB, r, c.req.param("id"))));

  if (on("create"))
    app.post("/", async (c) => {
      const data = validate(r.schema, await readJson(c));
      const id = crypto.randomUUID();
      await insertStmt(c.env.DB, r.table, id, data).run();
      return c.json(await getOne(c.env.DB, r, id), 201);
    });

  if (on("update"))
    app.patch("/:id", async (c) => {
      const id = c.req.param("id");
      const data = validate(r.schema, await readJson(c), true);
      delete data.member_id; // records never move between members
      const cols = Object.keys(data);
      if (cols.length) {
        const res = await c.env.DB.prepare(
          `UPDATE ${r.table} SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        )
          .bind(...Object.values(data), nowIso(), id)
          .run();
        if (!res.meta.changes) throw notFound();
      }
      return c.json(await getOne(c.env.DB, r, id));
    });

  if (on("delete"))
    app.delete("/:id", async (c) => {
      const id = c.req.param("id");
      const fileIds = r.fileOwner ? await fileIdsFor(c.env.DB, r.fileOwner, id) : [];
      const res = await c.env.DB.batch([
        ...(fileIds.length ? [c.env.DB.prepare(`DELETE FROM files WHERE id IN (${fileIds.map(() => "?").join(",")})`).bind(...fileIds)] : []),
        c.env.DB.prepare(`DELETE FROM ${r.table} WHERE id = ?`).bind(id),
      ]);
      if (!res[res.length - 1].meta.changes) throw notFound();
      await deleteR2(c.env.FILES, fileIds);
      return c.json({ ok: true });
    });
}
