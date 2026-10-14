import { Hono } from "hono";
import { scheduleOf, summary } from "../shared/schedule";
import { LEVEL_ORDER, mergeItems, ruleChecks, type MedReview, type ReviewItem, type ReviewLevel, type ReviewMed, type ReviewResponse } from "../shared/review";
import { MODELS, parseJsonObject, type AiRunner } from "./ai";
import { assertAiBudget, neuronsFor, recordAiUsage, type TokenUsage } from "./aiBudget";
import { sha256Hex } from "./crypto";
import type { AppEnv } from "./env";
import { badRequest, notFound, readJson } from "./http";

const PROMPT = `You help an Indian family prepare questions for their doctors.
You get one person's current medicines (often from several doctors who do not see each other's prescriptions), allergies, health conditions, age and sex.
Return ONLY a JSON object:
{"generics": {"<medicine name exactly as given>": "<generic name(s), lowercase>"},
 "items": [{"level": "talk_soon" | "ask" | "note", "medicines": ["<medicine names exactly as given>"], "title": "<at most 8 words>", "question": "<one question the family can ask the doctor>", "why": "<one or two plain sentences>"}]}
Rules:
- Put every medicine in "generics" (Indian brand names are common, e.g. Meditrex = methotrexate, Omnacortil = prednisolone).
- Items are only for clinically meaningful issues: interactions between medicines, the same medicine or class twice, a medicine that conflicts with an allergy or a condition, or a dose pattern that looks unusual (e.g. methotrexate every day instead of weekly).
- At most 6 items, most important first. If nothing important stands out, return "items": [].
- "talk_soon" only for possible serious harm; "ask" for the next visit; "note" for good-to-know.
- Never tell them to stop, start or change a medicine. Every item is a question for the doctor.
- Simple English. No brand advertising, no dosing advice.`;

/** The person and everything a review looks at. */
async function context(db: D1Database, vaultId: string, memberId: string) {
  const member = await db.prepare("SELECT name, dob, sex FROM members WHERE id = ? AND vault_id = ?").bind(memberId, vaultId).first<{ name: string; dob: string | null; sex: string | null }>();
  if (!member) throw notFound("Member not found");
  const [m, a, k] = await db.batch([
    db
      .prepare(
        `SELECT t.id, t.name, t.strength, t.dosage, t.schedule, t.timing, t.notes, t.updated_at, d.name AS doctor, d.specialty
         FROM medications t LEFT JOIN doctors d ON d.id = t.doctor_id
         WHERE t.member_id = ? AND t.vault_id = ? AND t.status = 'active' AND (t.end_date IS NULL OR t.end_date >= date('now'))
         ORDER BY t.name`,
      )
      .bind(memberId, vaultId),
    db.prepare("SELECT allergen, reaction FROM allergies WHERE member_id = ? AND vault_id = ? ORDER BY allergen").bind(memberId, vaultId),
    db.prepare("SELECT name FROM conditions WHERE member_id = ? AND vault_id = ? AND status = 'active' ORDER BY name").bind(memberId, vaultId),
  ]);
  type Med = { id: string; name: string; strength: string | null; dosage: string | null; schedule: string | null; timing: string | null; notes: string | null; updated_at: string; doctor: string | null; specialty: string | null };
  const meds = m.results as Med[];
  const allergies = (a.results as Array<{ allergen: string; reaction: string | null }>).map((x) => x.allergen);
  const conditions = (k.results as Array<{ name: string }>).map((x) => x.name);
  const key = (await sha256Hex(JSON.stringify([meds.map((x) => [x.id, x.updated_at]), allergies, conditions]))).slice(0, 16);
  return { member, meds, allergies, conditions, key };
}

type Context = Awaited<ReturnType<typeof context>>;

const LEVELS: ReviewLevel[] = ["talk_soon", "ask", "note"];
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Validates the model's reply; medicine names must be ones we sent. */
export function normalizeReview(raw: Record<string, unknown>, medNames: string[]): { generics: Record<string, string>; items: ReviewItem[] } {
  const known = new Map(medNames.map((n) => [n.toLowerCase(), n]));
  const generics: Record<string, string> = {};
  if (raw.generics && typeof raw.generics === "object")
    for (const [k, v] of Object.entries(raw.generics as Record<string, unknown>)) {
      const name = known.get(k.trim().toLowerCase());
      const g = text(v, 120);
      if (name && g) generics[name] = g.toLowerCase();
    }
  const items: ReviewItem[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const level = LEVELS.includes(o.level as ReviewLevel) ? (o.level as ReviewLevel) : "ask";
    const medicines = (Array.isArray(o.medicines) ? o.medicines : []).map((n) => (typeof n === "string" ? known.get(n.trim().toLowerCase()) : undefined)).filter((n): n is string => !!n);
    const title = text(o.title, 80);
    const question = text(o.question, 300);
    if (!title || !question || !medicines.length) continue;
    items.push({ level, title, question, why: text(o.why, 400) ?? "", medicines: [...new Set(medicines)], source: "ai" });
    if (items.length === 6) break;
  }
  return { generics, items: items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) };
}

function promptInput(ctx: Context) {
  const age = ctx.member.dob ? Math.floor((Date.now() - Date.parse(ctx.member.dob)) / (365.25 * 86_400_000)) : null;
  return JSON.stringify({
    age,
    sex: ctx.member.sex,
    allergies: ctx.allergies,
    conditions: ctx.conditions,
    medicines: ctx.meds.map((m) => {
      const s = scheduleOf(m);
      return {
        name: m.name,
        strength: m.strength,
        dose: s ? summary(s) : m.dosage,
        timing: m.timing,
        notes: m.notes?.slice(0, 200) ?? null,
        doctor: m.doctor ? `${m.doctor}${m.specialty ? ` (${m.specialty})` : ""}` : null,
      };
    }),
  });
}

async function askModels(ai: AiRunner, input: string) {
  for (const model of MODELS) {
    try {
      const out = (await ai.run(model, {
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: input },
        ],
        max_tokens: 1200,
        temperature: 0,
      })) as { response?: unknown; usage?: TokenUsage };
      const obj = parseJsonObject(out?.response ?? out);
      if (obj) return { obj, model, usage: out?.usage };
    } catch (err) {
      console.error("review model failed", model, err);
    }
  }
  return null;
}

/** Local development stand-in (AI_MOCK=1): one plausible AI item about the first medicine. */
const mockReply = (names: string[]) => ({
  generics: {},
  items: names.length ? [{ level: "note", medicines: [names[0]], title: "Example AI question (local mock)", question: `What is ${names[0]} for, and how long should it be taken?`, why: "Local development returns this instead of calling Workers AI." }] : [],
});

export const reviewApi = new Hono<AppEnv>();

reviewApi.get("/", async (c) => {
  const memberId = c.req.query("member_id") ?? "";
  if (!memberId) throw badRequest("member_id is required");
  const ctx = await context(c.env.DB, c.get("vaultId"), memberId);
  const row = await c.env.DB.prepare("SELECT result FROM med_reviews WHERE member_id = ? AND vault_id = ?").bind(memberId, c.get("vaultId")).first<{ result: string }>();
  const review = row ? (JSON.parse(row.result) as MedReview) : null;
  return c.json({ review, stale: !!review && review.key !== ctx.key } satisfies ReviewResponse);
});

/**
 * Runs a review: built-in checks always, plus the AI when the daily limit allows. The AI also
 * names each medicine's generic, which lets the built-in checks recognise unfamiliar brands.
 */
reviewApi.post("/", async (c) => {
  const body = await readJson(c);
  const memberId = typeof body.member_id === "string" ? body.member_id : "";
  if (!memberId) throw badRequest("member_id is required");
  const db = c.env.DB;
  const vaultId = c.get("vaultId");
  const ctx = await context(db, vaultId, memberId);
  if (!ctx.meds.length) throw badRequest("There are no current medicines to check");

  const names = ctx.meds.map((m) => m.name);
  let ai: { generics: Record<string, string>; items: ReviewItem[] } = { generics: {}, items: [] };
  let model: string | null = null;
  // Out of AI allowance: the built-in checks still run.
  const affordable = await assertAiBudget(db, vaultId, "review").then(() => true, () => false);
  if (affordable) {
    const reply = c.env.AI_MOCK === "1" ? { obj: mockReply(names), model: "mock", usage: undefined } : await askModels(c.env.AI as unknown as AiRunner, promptInput(ctx));
    if (reply) {
      ai = normalizeReview(reply.obj, names);
      model = reply.model;
      await recordAiUsage(db, vaultId, "review", reply.model, neuronsFor(reply.model, "review", reply.usage), reply.usage);
    }
  }

  const meds: ReviewMed[] = ctx.meds.map((m) => ({ name: m.name, generic: ai.generics[m.name] ?? null, notes: m.notes, doctor: m.doctor }));
  const review: MedReview = {
    items: mergeItems(ruleChecks(meds, ctx.allergies), ai.items),
    generics: ai.generics,
    key: ctx.key,
    checked_at: new Date().toISOString(),
    model,
  };
  await db
    .prepare("INSERT INTO med_reviews (member_id, vault_id, result, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET result = excluded.result, created_at = excluded.created_at")
    .bind(memberId, vaultId, JSON.stringify(review), review.checked_at)
    .run();
  return c.json({ review, stale: false } satisfies ReviewResponse);
});
