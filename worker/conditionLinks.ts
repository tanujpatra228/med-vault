import { badRequest } from "./http";

/** Records that can be linked to several health conditions. */
export type ConditionOwner = "prescription" | "medication" | "report" | "visit";

const MAX_LINKS = 10;

/**
 * The record's condition ids from a request body: `condition_ids` (list), or the older single
 * `condition_id`. Undefined when the body says nothing about conditions (a partial update).
 */
export function conditionIdsFrom(body: Record<string, unknown>): string[] | undefined {
  if ("condition_ids" in body) {
    const raw = body.condition_ids;
    if (raw === null) return [];
    if (!Array.isArray(raw) || raw.length > MAX_LINKS || raw.some((x) => typeof x !== "string" || !x || x.length > 64))
      throw badRequest(`condition_ids must be a list of at most ${MAX_LINKS} ids`);
    return [...new Set(raw as string[])];
  }
  if ("condition_id" in body) return typeof body.condition_id === "string" && body.condition_id ? [body.condition_id] : [];
  return undefined;
}

/** Tenant isolation: every linked condition must be in this vault. */
export async function assertConditions(db: D1Database, vaultId: string, ids: string[]) {
  if (!ids.length) return;
  const n = await db
    .prepare("SELECT COUNT(*) AS n FROM conditions WHERE vault_id = ? AND id IN (SELECT value FROM json_each(?))")
    .bind(vaultId, JSON.stringify(ids))
    .first<number>("n");
  if (n !== ids.length) throw badRequest("condition not found");
}

/** Replaces the condition links of one or more records (one statement each way, any number of records). */
export function setLinksStmts(db: D1Database, vaultId: string, ownerType: ConditionOwner, ownerIds: string[], conditionIds: string[]) {
  const owners = JSON.stringify(ownerIds);
  const stmts = [db.prepare("DELETE FROM record_conditions WHERE owner_type = ? AND owner_id IN (SELECT value FROM json_each(?))").bind(ownerType, owners)];
  if (conditionIds.length)
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO record_conditions (vault_id, owner_type, owner_id, condition_id) SELECT ?, ?, o.value, k.value FROM json_each(?) o, json_each(?) k")
        .bind(vaultId, ownerType, owners, JSON.stringify(conditionIds)),
    );
  return stmts;
}

export const deleteLinksStmt = (db: D1Database, ownerType: ConditionOwner, ownerIds: string[]) =>
  db.prepare("DELETE FROM record_conditions WHERE owner_type = ? AND owner_id IN (SELECT value FROM json_each(?))").bind(ownerType, JSON.stringify(ownerIds));

/**
 * SELECT columns for a record aliased `t`: `condition_ids` ("id1,id2") and `condition_name`
 * (all names, "Arthritis, Uveitis"), so existing screens show every linked condition.
 */
export const conditionCols = (ownerType: ConditionOwner) => `
    (SELECT GROUP_CONCAT(rc.condition_id) FROM record_conditions rc WHERE rc.owner_type = '${ownerType}' AND rc.owner_id = t.id) AS condition_ids,
    (SELECT GROUP_CONCAT(name, ', ') FROM (SELECT kc.name FROM record_conditions rc JOIN conditions kc ON kc.id = rc.condition_id
       WHERE rc.owner_type = '${ownerType}' AND rc.owner_id = t.id ORDER BY kc.name)) AS condition_name`;
