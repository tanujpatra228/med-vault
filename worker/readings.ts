import { Hono } from "hono";
import type { AppEnv } from "./env";
import { crud, type Resource } from "./crud";
import { badRequest } from "./http";
import { readingSchema } from "./schemas";

/** Blood pressure needs both numbers (upper above lower); sugar needs a value. Fields of the other kind are cleared. */
export function prepareReading(input: Record<string, unknown>): Record<string, unknown> {
  const out = { ...input };
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  if (input.kind === "bp") {
    const sys = num(input.systolic);
    const dia = num(input.diastolic);
    if (sys === null || dia === null) throw badRequest("Enter both blood pressure numbers");
    if (sys <= dia) throw badRequest("The upper number (systolic) should be higher than the lower one (diastolic)");
    Object.assign(out, { sugar: null, context: null });
  } else if (input.kind === "sugar") {
    if (num(input.sugar) === null) throw badRequest("Enter the sugar reading");
    Object.assign(out, { systolic: null, diastolic: null, pulse: null, context: input.context || "random" });
  }
  return out;
}

const readings: Resource = {
  table: "readings",
  schema: readingSchema,
  select: "SELECT t.* FROM readings t",
  orderBy: "t.taken_at DESC, t.created_at DESC",
  filters: { member_id: "t.member_id", kind: "t.kind", since: "t.taken_at >= ?" },
  prepare: prepareReading,
};

export const readingsApi = new Hono<AppEnv>();
crud(readingsApi, readings);
