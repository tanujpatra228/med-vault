import { Hono } from "hono";
import type { FileMeta, FileOwner } from "../shared/types";
import type { AppEnv } from "./env";
import { badRequest, HttpError, notFound } from "./http";

const MAX_BYTES = 15 * 1024 * 1024;
const OWNER_TABLES: Record<FileOwner, string> = {
  member: "members",
  prescription: "prescriptions",
  report: "reports",
  medication: "medications",
};

function allowedMime(type: string) {
  return type.startsWith("image/") || type === "application/pdf";
}

/** Deletes R2 objects for the given file ids. D1 cascades never reach R2. */
export async function deleteR2(bucket: R2Bucket, ids: string[]) {
  if (ids.length) await bucket.delete(ids);
}

/** File ids owned by a record (or, for a member, everything under that member). */
export async function fileIdsFor(db: D1Database, ownerType: FileOwner, ownerId: string): Promise<string[]> {
  const sql =
    ownerType === "member"
      ? "SELECT id FROM files WHERE member_id = ?"
      : "SELECT id FROM files WHERE owner_type = ? AND owner_id = ?";
  const stmt = ownerType === "member" ? db.prepare(sql).bind(ownerId) : db.prepare(sql).bind(ownerType, ownerId);
  const { results } = await stmt.all<{ id: string }>();
  return results.map((r) => r.id);
}

export const files = new Hono<AppEnv>();

files.post("/", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const ownerType = String(form.get("owner_type") ?? "") as FileOwner;
  const ownerId = String(form.get("owner_id") ?? "");
  if (!(file instanceof File)) throw badRequest("file is required");
  if (!(ownerType in OWNER_TABLES)) throw badRequest("owner_type is invalid");
  if (!ownerId) throw badRequest("owner_id is required");
  if (file.size > MAX_BYTES) throw new HttpError(413, "File is larger than 15 MB");
  if (!allowedMime(file.type)) throw badRequest("Only images and PDFs are allowed");

  const owner = await c.env.DB.prepare(
    `SELECT ${ownerType === "member" ? "id AS member_id, photo_file_id" : "member_id"} FROM ${OWNER_TABLES[ownerType]} WHERE id = ?`,
  )
    .bind(ownerId)
    .first<{ member_id: string; photo_file_id?: string | null }>();
  if (!owner) throw notFound("Owner record not found");

  const id = crypto.randomUUID();
  await c.env.FILES.put(id, file.stream(), { httpMetadata: { contentType: file.type } });

  const stmts = [
    c.env.DB.prepare(
      "INSERT INTO files (id, member_id, owner_type, owner_id, name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, owner.member_id, ownerType, ownerId, file.name.slice(0, 200) || null, file.type, file.size),
  ];
  if (ownerType === "member") {
    stmts.push(c.env.DB.prepare("UPDATE members SET photo_file_id = ?, updated_at = ? WHERE id = ?").bind(id, new Date().toISOString(), ownerId));
    if (owner.photo_file_id) stmts.push(c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(owner.photo_file_id));
  }
  await c.env.DB.batch(stmts);
  if (ownerType === "member" && owner.photo_file_id) await deleteR2(c.env.FILES, [owner.photo_file_id]);

  const meta = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<FileMeta>();
  return c.json(meta, 201);
});

files.get("/", async (c) => {
  const ownerType = c.req.query("owner_type") ?? "";
  const ownerId = c.req.query("owner_id") ?? "";
  if (!(ownerType in OWNER_TABLES) || !ownerId) throw badRequest("owner_type and owner_id are required");
  const { results } = await c.env.DB.prepare("SELECT * FROM files WHERE owner_type = ? AND owner_id = ? ORDER BY created_at ASC")
    .bind(ownerType, ownerId)
    .all<FileMeta>();
  return c.json(results);
});

files.get("/:id", async (c) => {
  const id = c.req.param("id");
  const meta = await c.env.DB.prepare("SELECT mime_type, name FROM files WHERE id = ?").bind(id).first<{ mime_type: string; name: string | null }>();
  if (!meta) throw notFound("File not found");
  const obj = await c.env.FILES.get(id);
  if (!obj) throw notFound("File not found");
  const disposition = c.req.query("download") ? "attachment" : "inline";
  return new Response(obj.body, {
    headers: {
      "Content-Type": meta.mime_type,
      "Content-Length": String(obj.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `${disposition}; filename="${(meta.name ?? id).replace(/[^\w.\- ]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

files.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const res = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE members SET photo_file_id = NULL WHERE photo_file_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id),
  ]);
  if (!res[1].meta.changes) throw notFound("File not found");
  await deleteR2(c.env.FILES, [id]);
  return c.json({ ok: true });
});
