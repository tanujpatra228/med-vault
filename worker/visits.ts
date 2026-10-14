import { Hono } from "hono";
import type { FollowUp } from "../shared/types";
import { assertRefs, crud, getOne, insertStmt, type Resource } from "./crud";
import type { AppEnv } from "./env";
import { readJson } from "./http";
import { visitSchema } from "./schemas";
import { validate } from "./validate";

export const visits: Resource = {
  table: "visits",
  schema: visitSchema,
  select: `SELECT t.*, d.name AS doctor_name, d.specialty AS doctor_specialty, k.name AS condition_name
    FROM visits t
    LEFT JOIN doctors d ON d.id = t.doctor_id
    LEFT JOIN conditions k ON k.id = t.condition_id`,
  orderBy: "t.visit_date DESC, t.created_at DESC",
  filters: { member_id: "t.member_id", doctor_id: "t.doctor_id", prescription_id: "t.prescription_id" },
};

/**
 * A new visit to a doctor closes that doctor's open follow-ups for the member that were due
 * by about then (up to 2 weeks after the visit: people go early, and follow-ups get moved).
 */
export function closeFollowUpsStmt(db: D1Database, vaultId: string, memberId: string, doctorId: string | null, visitDate: string) {
  if (!doctorId) return null;
  return db
    .prepare(
      `UPDATE visits SET follow_up_done = 1, updated_at = ?
       WHERE vault_id = ? AND member_id = ? AND doctor_id = ? AND follow_up_done = 0
         AND follow_up_on IS NOT NULL AND visit_date < ? AND follow_up_on <= date(?, '+14 days')`,
    )
    .bind(new Date().toISOString(), vaultId, memberId, doctorId, visitDate, visitDate);
}

export const visitsApi = new Hono<AppEnv>();

/** Open follow-ups across the family: overdue (up to 90 days) and the next 60 days, soonest first. */
visitsApi.get("/follow-ups", async (c) => {
  const memberId = c.req.query("member_id");
  const { results } = await c.env.DB.prepare(
    `SELECT t.id AS visit_id, t.member_id, m.name AS member_name, t.doctor_id, d.name AS doctor_name, d.specialty AS doctor_specialty,
            d.phone AS doctor_phone, t.follow_up_on, t.follow_up_note, t.visit_date
     FROM visits t JOIN members m ON m.id = t.member_id LEFT JOIN doctors d ON d.id = t.doctor_id
     WHERE t.vault_id = ? AND t.follow_up_done = 0 AND t.follow_up_on IS NOT NULL
       AND t.follow_up_on BETWEEN date('now', '-90 days') AND date('now', '+60 days')
       ${memberId ? "AND t.member_id = ?" : ""}
     ORDER BY t.follow_up_on ASC, t.created_at ASC`,
  )
    .bind(...[c.get("vaultId"), ...(memberId ? [memberId] : [])])
    .all<FollowUp>();
  return c.json(results);
});

visitsApi.post("/", async (c) => {
  const vaultId = c.get("vaultId");
  const db = c.env.DB;
  const data = validate(visitSchema, await readJson(c));
  await assertRefs(db, visitSchema, vaultId, data);
  const id = crypto.randomUUID();
  const close = closeFollowUpsStmt(db, vaultId, data.member_id!, data.doctor_id ?? null, data.visit_date!);
  await db.batch([...(close ? [close] : []), insertStmt(db, "visits", id, vaultId, data)]);
  return c.json(await getOne(db, visits, vaultId, id), 201);
});

crud(visitsApi, visits);
