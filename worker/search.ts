import { Hono } from "hono";
import { likePattern, searchTerms, type SearchHit, type SearchType } from "../shared/search";
import type { AppEnv } from "./env";
import { badRequest } from "./http";

const PER_TYPE = 8;

/** Names of the conditions a record is linked to (so "arthritis" finds its prescriptions). */
const conditionNames = (owner: string) =>
  `(SELECT GROUP_CONCAT(kc.name, ' ') FROM record_conditions rc JOIN conditions kc ON kc.id = rc.condition_id WHERE rc.owner_type = '${owner}' AND rc.owner_id = t.id)`;

/** "a · b", or whichever one is present. */
const pair = (a: string, b: string) => `CASE WHEN ${a} IS NOT NULL AND ${b} IS NOT NULL THEN ${a} || ' · ' || ${b} ELSE COALESCE(${a}, ${b}) END`;

const hay = (...cols: string[]) => cols.map((c) => `COALESCE(${c}, '')`).join(" || ' ' || ");

interface Source {
  type: SearchType;
  /** Columns: id, title, subtitle, member_id, member_name, date, href. Main table aliased `t`. */
  select: string;
  from: string;
  hay: string;
  /** Column holding the member, for "search within this person"; null = not per member. */
  member: string | null;
  order: string;
}

const SOURCES: Source[] = [
  {
    type: "member",
    select: "t.id, t.name AS title, t.relation AS subtitle, t.id AS member_id, t.name AS member_name, NULL AS date, '/m/' || t.id AS href",
    from: "members t",
    hay: hay("t.name", "t.relation", "t.blood_group", "t.notes"),
    member: "t.id",
    order: "t.created_at ASC",
  },
  {
    type: "medication",
    select: `t.id, t.name || COALESCE(' ' || t.strength, '') AS title, ${pair("t.dosage", "d.name")} AS subtitle,
      t.member_id, m.name AS member_name, t.start_date AS date, '/medications/' || t.id AS href`,
    from: "medications t JOIN members m ON m.id = t.member_id LEFT JOIN doctors d ON d.id = t.doctor_id",
    hay: hay("t.name", "t.strength", "t.dosage", "t.timing", "t.notes", "d.name", conditionNames("medication")),
    member: "t.member_id",
    order: "t.status = 'stopped', t.start_date DESC, t.created_at DESC",
  },
  {
    type: "prescription",
    select: `t.id, 'Prescription' || COALESCE(' · ' || d.name, '') AS title, ${conditionNames("prescription")} AS subtitle,
      t.member_id, m.name AS member_name, t.prescribed_on AS date, '/prescriptions/' || t.id AS href`,
    from: "prescriptions t JOIN members m ON m.id = t.member_id LEFT JOIN doctors d ON d.id = t.doctor_id",
    hay: hay("t.notes", "d.name", "d.specialty", conditionNames("prescription")),
    member: "t.member_id",
    order: "t.prescribed_on DESC",
  },
  {
    type: "report",
    select: `t.id, t.title, t.lab_name AS subtitle, t.member_id, m.name AS member_name, t.report_date AS date, '/reports/' || t.id AS href`,
    from: "reports t JOIN members m ON m.id = t.member_id",
    hay: hay("t.title", "t.lab_name", "t.report_type", "t.notes", conditionNames("report")),
    member: "t.member_id",
    order: "t.report_date DESC",
  },
  {
    type: "lab",
    select: `t.id, t.test_name || ' ' || COALESCE(t.value_text, '') || COALESCE(' ' || t.unit, '') AS title,
      r.title || CASE t.flag WHEN 'high' THEN ' · High' WHEN 'low' THEN ' · Low' ELSE '' END AS subtitle,
      t.member_id, m.name AS member_name, r.report_date AS date, '/reports/' || t.report_id AS href`,
    from: "lab_values t JOIN reports r ON r.id = t.report_id JOIN members m ON m.id = t.member_id",
    hay: hay("t.test_name", "t.test_key"),
    member: "t.member_id",
    order: "r.report_date DESC",
  },
  {
    type: "condition",
    select: `t.id, t.name AS title, CASE t.status WHEN 'resolved' THEN 'Resolved' ELSE 'Active' END AS subtitle,
      t.member_id, m.name AS member_name, t.diagnosed_on AS date, '/conditions/' || t.id AS href`,
    from: "conditions t JOIN members m ON m.id = t.member_id",
    hay: hay("t.name", "t.notes"),
    member: "t.member_id",
    order: "t.status = 'resolved', t.created_at DESC",
  },
  {
    type: "allergy",
    select: `t.id, t.allergen AS title, t.reaction AS subtitle, t.member_id, m.name AS member_name, t.noted_on AS date, '/allergies/' || t.id AS href`,
    from: "allergies t JOIN members m ON m.id = t.member_id",
    hay: hay("t.allergen", "t.reaction", "t.notes"),
    member: "t.member_id",
    order: "t.created_at DESC",
  },
  {
    type: "visit",
    select: `t.id, 'Visit' || COALESCE(' · ' || d.name, '') AS title, COALESCE(t.reason, t.follow_up_note) AS subtitle,
      t.member_id, m.name AS member_name, t.visit_date AS date, '/visits/' || t.id AS href`,
    from: "visits t JOIN members m ON m.id = t.member_id LEFT JOIN doctors d ON d.id = t.doctor_id",
    hay: hay("t.reason", "t.notes", "t.follow_up_note", "d.name", conditionNames("visit")),
    member: "t.member_id",
    order: "t.visit_date DESC",
  },
  {
    type: "doctor",
    select: `t.id, t.name AS title, ${pair("t.specialty", "t.clinic")} AS subtitle,
      NULL AS member_id, NULL AS member_name, NULL AS date, '/doctors/' || t.id AS href`,
    from: "doctors t",
    hay: hay("t.name", "t.specialty", "t.clinic", "t.phone", "t.address", "t.notes"),
    member: null,
    order: "t.name",
  },
];

export const searchApi = new Hono<AppEnv>();

/**
 * Every word must appear somewhere in a record (any of its text fields, its doctor's name or its
 * conditions). One SELECT per record type, all in one D1 batch; at most 8 hits per type.
 */
searchApi.get("/", async (c) => {
  const terms = searchTerms(c.req.query("q") ?? "");
  if (!terms.length) return c.json({ hits: [] });
  const memberId = c.req.query("member_id") || null;
  if (memberId && memberId.length > 64) throw badRequest("member_id is invalid");
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const sources = SOURCES.filter((s) => !memberId || s.member);
  const stmts = sources.map((s) => {
    const where = ["t.vault_id = ?", ...(memberId ? [`${s.member} = ?`] : []), ...terms.map(() => `(${s.hay}) LIKE ? ESCAPE '\\'`)];
    return db
      .prepare(`SELECT ${s.select} FROM ${s.from} WHERE ${where.join(" AND ")} ORDER BY ${s.order} LIMIT ${PER_TYPE}`)
      .bind(vaultId, ...(memberId ? [memberId] : []), ...terms.map(likePattern));
  });
  const results = await db.batch<Omit<SearchHit, "type">>(stmts);
  const hits: SearchHit[] = results.flatMap((r, i) => r.results.map((row) => ({ ...row, type: sources[i].type })));
  return c.json({ hits, terms });
});
