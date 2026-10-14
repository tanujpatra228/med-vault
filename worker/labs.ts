import { Hono } from "hono";
import { canonicalTest, flagOf, parseRange, parseValue } from "../shared/labs";
import type { LabDraft, LabValue } from "../shared/types";
import type { AppEnv } from "./env";
import { badRequest, notFound, nowIso, readJson } from "./http";

const MAX_VALUES = 80;
const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) || null : null);

/** Cleans results (from the form or an AI scan) and works out the test, number, range and flag. */
export function prepareValues(raw: unknown): Array<Omit<LabValue, "id" | "member_id" | "report_id" | "created_at" | "updated_at">> {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, MAX_VALUES)) {
    if (!item || typeof item !== "object") continue;
    const d = item as Partial<LabDraft>;
    const name = text(d.test_name, 120);
    const valueText = text(d.value_text, 80);
    if (!name || !valueText) continue;
    const refText = text(d.ref_text, 120);
    const value = parseValue(valueText);
    const { low, high } = parseRange(refText);
    out.push({
      test_key: canonicalTest(name).key,
      test_name: name,
      value,
      value_text: valueText,
      unit: text(d.unit, 40),
      ref_low: low,
      ref_high: high,
      ref_text: refText,
      flag: flagOf(value, low, high),
      position: out.length,
    });
  }
  return out;
}

const SELECT = `SELECT v.*, r.report_date, r.title AS report_title FROM lab_values v JOIN reports r ON r.id = v.report_id`;

export async function valuesForReport(db: D1Database, vaultId: string, reportId: string) {
  const { results } = await db.prepare(`${SELECT} WHERE v.report_id = ? AND v.vault_id = ? ORDER BY v.position`).bind(reportId, vaultId).all<LabValue>();
  return results;
}

export const labsApi = new Hono<AppEnv>();

/** Every result for a member, oldest first, for the trend charts. */
labsApi.get("/", async (c) => {
  const memberId = c.req.query("member_id") ?? "";
  if (!memberId) throw badRequest("member_id is required");
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE v.member_id = ? AND v.vault_id = ? ORDER BY r.report_date ASC, v.created_at ASC`)
    .bind(memberId, c.get("vaultId"))
    .all<LabValue>();
  return c.json(results);
});

/** Replaces a report's results (one statement in, one out). */
labsApi.put("/report/:reportId", async (c) => {
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const reportId = c.req.param("reportId");
  const report = await db.prepare("SELECT member_id FROM reports WHERE id = ? AND vault_id = ?").bind(reportId, vaultId).first<{ member_id: string }>();
  if (!report) throw notFound("Report not found");
  const body = await readJson(c);
  const values = prepareValues(body.values);
  const now = nowIso();
  const rows = values.map((v) => ({ ...v, id: crypto.randomUUID(), vault_id: vaultId, member_id: report.member_id, report_id: reportId, created_at: now, updated_at: now }));
  const cols = ["id", "vault_id", "member_id", "report_id", "test_key", "test_name", "value", "value_text", "unit", "ref_low", "ref_high", "ref_text", "flag", "position", "created_at", "updated_at"];
  await db.batch([
    db.prepare("DELETE FROM lab_values WHERE report_id = ? AND vault_id = ?").bind(reportId, vaultId),
    ...(rows.length
      ? [db.prepare(`INSERT INTO lab_values (${cols.join(", ")}) SELECT ${cols.map((k) => `json_extract(value, '$.${k}')`).join(", ")} FROM json_each(?)`).bind(JSON.stringify(rows))]
      : []),
  ]);
  return c.json(await valuesForReport(db, vaultId, reportId));
});
