import { Hono } from "hono";
import type {
  Allergy,
  Condition,
  FileMeta,
  Medication,
  Member,
  MemberSummary,
  Prescription,
  PrescriptionDetail,
  Report,
  ReportDetail,
  Visit,
} from "../shared/types";
import { assertRefs, crud, getOne, insertStmt, type Resource } from "./crud";
import type { AppEnv } from "./env";
import { deleteR2, fileIdsFor } from "./files";
import { badRequest, notFound, readJson } from "./http";
import { prepareMedication } from "./medication";
import {
  allergySchema,
  conditionSchema,
  doctorSchema,
  medicationSchema,
  memberSchema,
  prescriptionSchema,
  reportSchema,
} from "./schemas";
import { validate } from "./validate";
import { closeFollowUpsStmt, visits } from "./visits";
import { assertConditions, conditionCols, conditionIdsFrom, setLinksStmts } from "./conditionLinks";
import { visitSchema } from "./schemas";

const filesOf = (owner: string) =>
  `(SELECT COUNT(*) FROM files f WHERE f.owner_type = '${owner}' AND f.owner_id = t.id) AS file_count,
   (SELECT f.id FROM files f WHERE f.owner_type = '${owner}' AND f.owner_id = t.id AND f.mime_type LIKE 'image/%' ORDER BY f.created_at LIMIT 1) AS cover_file_id`;

// ---------- resource definitions ----------

const members: Resource = {
  table: "members",
  schema: memberSchema,
  select: `SELECT t.*,
    (SELECT COUNT(*) FROM medications m WHERE m.member_id = t.id AND m.status = 'active' AND (m.end_date IS NULL OR m.end_date >= date('now'))) AS active_med_count,
    (SELECT COUNT(*) FROM allergies a WHERE a.member_id = t.id) AS allergy_count,
    (SELECT COUNT(*) FROM conditions k WHERE k.member_id = t.id AND k.status = 'active') AS active_condition_count,
    (SELECT MAX(d) FROM (
       SELECT MAX(prescribed_on) AS d FROM prescriptions WHERE member_id = t.id
       UNION ALL SELECT MAX(report_date) FROM reports WHERE member_id = t.id)) AS last_activity
    FROM members t`,
  orderBy: "t.created_at ASC", // family order: the order members were added
  fileOwner: "member",
};

const doctors: Resource = {
  table: "doctors",
  schema: doctorSchema,
  select: `SELECT t.*,
    (SELECT GROUP_CONCAT(name, ', ') FROM (
       SELECT DISTINCT mb.name FROM members mb WHERE mb.id IN (
         SELECT member_id FROM prescriptions WHERE doctor_id = t.id
         UNION SELECT member_id FROM medications WHERE doctor_id = t.id
         UNION SELECT member_id FROM reports WHERE doctor_id = t.id))) AS member_names,
    (SELECT MAX(prescribed_on) FROM prescriptions WHERE doctor_id = t.id) AS last_seen
    FROM doctors t`,
  orderBy: "last_seen IS NULL, last_seen DESC, t.created_at DESC",
};

const allergies: Resource = {
  table: "allergies",
  schema: allergySchema,
  select: "SELECT t.* FROM allergies t",
  orderBy: "CASE t.severity WHEN 'severe' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END, t.noted_on DESC, t.created_at DESC",
  filters: { member_id: "t.member_id" },
};

const conditions: Resource = {
  table: "conditions",
  schema: conditionSchema,
  select: "SELECT t.* FROM conditions t",
  orderBy: "t.status = 'resolved', t.diagnosed_on DESC, t.created_at DESC",
  filters: { member_id: "t.member_id", status: "t.status" },
};

const medications: Resource = {
  table: "medications",
  schema: medicationSchema,
  select: `SELECT t.*, d.name AS doctor_name, d.specialty AS doctor_specialty, ${conditionCols("medication")}
    FROM medications t
    LEFT JOIN doctors d ON d.id = t.doctor_id`,
  orderBy: "t.status = 'stopped', COALESCE(t.start_date, substr(t.created_at, 1, 10)) DESC, t.created_at DESC",
  filters: { member_id: "t.member_id", status: "t.status", prescription_id: "t.prescription_id" },
  fileOwner: "medication",
  conditionOwner: "medication",
  prepare: prepareMedication,
};

const prescriptions: Resource = {
  table: "prescriptions",
  schema: prescriptionSchema,
  select: `SELECT t.*, d.name AS doctor_name, d.specialty AS doctor_specialty, ${conditionCols("prescription")},
    (SELECT COUNT(*) FROM medications m WHERE m.prescription_id = t.id) AS med_count,
    ${filesOf("prescription")}
    FROM prescriptions t
    LEFT JOIN doctors d ON d.id = t.doctor_id`,
  orderBy: "t.prescribed_on DESC, t.created_at DESC",
  filters: { member_id: "t.member_id", doctor_id: "t.doctor_id" },
  fileOwner: "prescription",
  conditionOwner: "prescription",
};

const reports: Resource = {
  table: "reports",
  schema: reportSchema,
  select: `SELECT t.*, d.name AS doctor_name, ${conditionCols("report")}, ${filesOf("report")}
    FROM reports t
    LEFT JOIN doctors d ON d.id = t.doctor_id`,
  orderBy: "t.report_date DESC, t.created_at DESC",
  filters: { member_id: "t.member_id", report_type: "t.report_type" },
  fileOwner: "report",
  conditionOwner: "report",
};

async function filesFor(db: D1Database, owner: string, id: string) {
  const { results } = await db
    .prepare("SELECT * FROM files WHERE owner_type = ? AND owner_id = ? ORDER BY created_at ASC")
    .bind(owner, id)
    .all<FileMeta>();
  return results;
}

// ---------- routers ----------

export const membersApi = new Hono<AppEnv>();

membersApi.get("/:id/summary", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const member = await db.prepare("SELECT * FROM members WHERE id = ? AND vault_id = ?").bind(id, c.get("vaultId")).first<Member>();
  if (!member) throw notFound("Member not found");
  const [a, k, m, r, p] = await db.batch([
    db.prepare(`${allergies.select} WHERE t.member_id = ? ORDER BY ${allergies.orderBy}`).bind(id),
    db.prepare(`${conditions.select} WHERE t.member_id = ? AND t.status = 'active' ORDER BY ${conditions.orderBy}`).bind(id),
    db.prepare(`${medications.select} WHERE t.member_id = ? AND t.status = 'active' ORDER BY ${medications.orderBy}`).bind(id),
    db.prepare(`${reports.select} WHERE t.member_id = ? ORDER BY ${reports.orderBy} LIMIT 1`).bind(id),
    db.prepare(`${prescriptions.select} WHERE t.member_id = ? ORDER BY ${prescriptions.orderBy} LIMIT 1`).bind(id),
  ]);
  const meds = m.results as unknown as Medication[];

  const doctorMap = new Map<string, MemberSummary["doctors"][number]>();
  for (const med of meds) {
    if (!med.doctor_id) continue;
    const d = doctorMap.get(med.doctor_id);
    if (d) d.med_count++;
    else doctorMap.set(med.doctor_id, { id: med.doctor_id, name: med.doctor_name ?? "", specialty: med.doctor_specialty ?? null, phone: null, med_count: 1 });
  }
  if (doctorMap.size) {
    const ids = [...doctorMap.keys()];
    const { results } = await db
      .prepare(`SELECT id, phone FROM doctors WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: string; phone: string | null }>();
    for (const row of results) doctorMap.get(row.id)!.phone = row.phone;
  }

  const summary: MemberSummary = {
    member,
    allergies: a.results as unknown as Allergy[],
    conditions: k.results as unknown as Condition[],
    medications: meds,
    latest_report: (r.results[0] as unknown as Report) ?? null,
    latest_prescription: (p.results[0] as unknown as Prescription) ?? null,
    doctors: [...doctorMap.values()].sort((x, y) => y.med_count - x.med_count),
  };
  return c.json(summary);
});

membersApi.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await getOne(c.env.DB, members, c.get("vaultId"), id);
  const fileIds = await fileIdsFor(c.env.DB, "member", id);
  await c.env.DB.prepare("DELETE FROM members WHERE id = ? AND vault_id = ?").bind(id, c.get("vaultId")).run(); // cascades to all child rows
  await deleteR2(c.env.FILES, fileIds);
  return c.json({ ok: true });
});

crud(membersApi, members);

export const doctorsApi = new Hono<AppEnv>();
crud(doctorsApi, doctors);

export const allergiesApi = new Hono<AppEnv>();
crud(allergiesApi, allergies);

export const conditionsApi = new Hono<AppEnv>();
crud(conditionsApi, conditions);

export const medicationsApi = new Hono<AppEnv>();
crud(medicationsApi, medications);

export const prescriptionsApi = new Hono<AppEnv>();

prescriptionsApi.get("/:id", async (c) => {
  const id = c.req.param("id");
  const p = await getOne<Prescription>(c.env.DB, prescriptions, c.get("vaultId"), id);
  const { results: meds } = await c.env.DB.prepare(
    `${medications.select} WHERE t.prescription_id = ? ORDER BY t.created_at ASC`,
  )
    .bind(id)
    .all<Medication>();
  const visit = await c.env.DB.prepare(`${visits.select} WHERE t.prescription_id = ? ORDER BY t.created_at ASC LIMIT 1`).bind(id).first<Visit>();
  const detail: PrescriptionDetail = { ...p, medications: meds, visit: visit ?? null, files: await filesFor(c.env.DB, "prescription", id) };
  return c.json(detail);
});

// Creates the prescription and its medicines atomically. Medicines inherit member, doctor, condition and start date.
prescriptionsApi.post("/", async (c) => {
  const body = await readJson(c);
  const vaultId = c.get("vaultId");
  const conditionIds = conditionIdsFrom(body) ?? [];
  body.condition_id = conditionIds[0] ?? null;
  const data = validate(prescriptionSchema, body);
  await assertRefs(c.env.DB, prescriptionSchema, vaultId, data);
  await assertConditions(c.env.DB, vaultId, conditionIds);
  const rawMeds = body.medications ?? [];
  if (!Array.isArray(rawMeds)) throw badRequest("medications must be a list");
  if (rawMeds.length > 30) throw badRequest("Too many medicines on one prescription");

  const id = crypto.randomUUID();
  const db = c.env.DB;
  const stmts = [insertStmt(db, "prescriptions", id, vaultId, data)];
  const medIds: string[] = [];
  for (const raw of rawMeds) {
    if (!raw || typeof raw !== "object") throw badRequest("Each medicine must be an object");
    const med = validate(medicationSchema, prepareMedication({
      start_date: data.prescribed_on,
      ...(raw as Record<string, unknown>),
      member_id: data.member_id,
      prescription_id: id,
      doctor_id: data.doctor_id,
      condition_id: data.condition_id,
    }));
    const medId = crypto.randomUUID();
    medIds.push(medId);
    stmts.push(insertStmt(db, "medications", medId, vaultId, med));
  }
  // The prescription was written at a visit: log it, with the follow-up if one was given.
  const visit = validate(visitSchema, {
    member_id: data.member_id,
    doctor_id: data.doctor_id,
    condition_id: data.condition_id,
    prescription_id: id,
    visit_date: data.prescribed_on,
    follow_up_on: body.follow_up_on ?? null,
    follow_up_note: body.follow_up_note ?? null,
  });
  const close = closeFollowUpsStmt(db, vaultId, data.member_id!, data.doctor_id ?? null, data.prescribed_on!);
  const visitId = crypto.randomUUID();
  // The medicines and the visit are for the same conditions as the prescription.
  await db.batch([
    ...(close ? [close] : []),
    ...stmts,
    insertStmt(db, "visits", visitId, vaultId, visit),
    ...setLinksStmts(db, vaultId, "prescription", [id], conditionIds),
    ...(medIds.length ? setLinksStmts(db, vaultId, "medication", medIds, conditionIds) : []),
    ...setLinksStmts(db, vaultId, "visit", [visitId], conditionIds),
  ]);
  return c.json(await getOne(db, prescriptions, vaultId, id), 201);
});

// Deleting a prescription removes the medicines that came from it, and all their files.
prescriptionsApi.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  await getOne(db, prescriptions, c.get("vaultId"), id);
  const { results } = await db
    .prepare(
      `SELECT id FROM files WHERE (owner_type = 'prescription' AND owner_id = ?)
         OR (owner_type = 'medication' AND owner_id IN (SELECT id FROM medications WHERE prescription_id = ?))`,
    )
    .bind(id, id)
    .all<{ id: string }>();
  const fileIds = results.map((r) => r.id);
  await db.batch([
    db.prepare(
      `DELETE FROM files WHERE (owner_type = 'prescription' AND owner_id = ?)
         OR (owner_type = 'medication' AND owner_id IN (SELECT id FROM medications WHERE prescription_id = ?))`,
    ).bind(id, id),
    db.prepare(
      `DELETE FROM record_conditions WHERE (owner_type = 'prescription' AND owner_id = ?1)
         OR (owner_type = 'medication' AND owner_id IN (SELECT id FROM medications WHERE prescription_id = ?1))
         OR (owner_type = 'visit' AND owner_id IN (SELECT id FROM visits WHERE prescription_id = ?1))`,
    ).bind(id),
    db.prepare("DELETE FROM medications WHERE prescription_id = ?").bind(id),
    db.prepare("DELETE FROM visits WHERE prescription_id = ?").bind(id),
    db.prepare("DELETE FROM prescriptions WHERE id = ?").bind(id),
  ]);
  await deleteR2(c.env.FILES, fileIds);
  return c.json({ ok: true });
});

crud(prescriptionsApi, prescriptions);

export const reportsApi = new Hono<AppEnv>();

reportsApi.get("/:id", async (c) => {
  const id = c.req.param("id");
  const r = await getOne<Report>(c.env.DB, reports, c.get("vaultId"), id);
  const detail: ReportDetail = { ...r, files: await filesFor(c.env.DB, "report", id) };
  return c.json(detail);
});

crud(reportsApi, reports);
