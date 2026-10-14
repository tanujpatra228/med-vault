import { badRequest } from "./http";

// Field specs drive validation and act as the column allowlist for writes.
export type FieldSpec =
  | { type: "text"; required?: boolean; max?: number }
  | { type: "date"; required?: boolean }
  | { type: "enum"; values: readonly string[]; required?: boolean }
  | { type: "id"; ref: RefTable; required?: boolean };

export type RefTable = "members" | "doctors" | "conditions" | "prescriptions" | "reports";

export type Schema = Record<string, FieldSpec>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/**
 * Returns only known columns, normalised (trimmed, "" -> null).
 * partial=true (PATCH) skips required checks for absent fields.
 */
export function validate(schema: Schema, input: Record<string, unknown>, partial = false): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, spec] of Object.entries(schema)) {
    const present = key in input;
    if (!present) {
      if (!partial && spec.required) throw badRequest(`${key} is required`);
      continue;
    }
    const raw = input[key];
    if (raw !== null && raw !== undefined && typeof raw !== "string" && typeof raw !== "number") {
      throw badRequest(`${key} must be text`);
    }
    const value = raw === null || raw === undefined ? null : String(raw).trim() || null;
    if (value === null) {
      if (spec.required) throw badRequest(`${key} is required`);
      out[key] = null;
      continue;
    }
    switch (spec.type) {
      case "text":
        if (value.length > (spec.max ?? 2000)) throw badRequest(`${key} is too long`);
        break;
      case "date":
        if (!isValidDate(value)) throw badRequest(`${key} must be a date (YYYY-MM-DD)`);
        break;
      case "enum":
        if (!spec.values.includes(value)) throw badRequest(`${key} must be one of: ${spec.values.join(", ")}`);
        break;
      case "id":
        if (value.length > 64) throw badRequest(`${key} is invalid`);
        break;
    }
    out[key] = value;
  }
  return out;
}
