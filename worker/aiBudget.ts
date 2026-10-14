import type { AiUsage } from "../shared/types";
import { HttpError } from "./http";

/**
 * Workers AI is billed in neurons. The free plan gives 10,000 a day for the whole account, shared by
 * every vault, and resets at 00:00 UTC (5:30 AM in India). Both limits below use the same UTC day.
 */
export const VAULT_DAILY_NEURONS = 1_500;
/** Stop all AI before the account's free 10,000 runs out, keeping headroom for the spread in cost. */
export const GLOBAL_DAILY_NEURONS = 9_000;

export type AiKind = "prescription" | "medicine" | "report" | "review";

/**
 * Typical cost of one call, from real measurements (docs/INFRASTRUCTURE.md): a prescription scan
 * cost 78 and 96 neurons, a 3-medicine review 46. Used to check a call fits before making it, and as
 * the charge when the model reports no token counts.
 */
export const ESTIMATE: Record<AiKind, number> = { prescription: 100, medicine: 80, report: 100, review: 60 };

/**
 * Neurons per million tokens [input, output], from Workers AI pricing ($0.011 per 1,000 neurons).
 * The Cloudflare dashboard is the source of truth: if logged totals drift from it, adjust these.
 */
const RATES: Record<string, [number, number]> = {
  "@cf/meta/llama-4-scout-17b-16e-instruct": [24_545, 77_273],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31_876, 50_455],
};

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/** Neurons for one call, from the token counts the model reports; the estimate when it reports none. */
export function neuronsFor(model: string, kind: AiKind, usage: TokenUsage | undefined): number {
  const rate = RATES[model];
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  if (!rate || typeof input !== "number" || typeof output !== "number") return ESTIMATE[kind];
  return Math.round(((input * rate[0] + output * rate[1]) / 1_000_000) * 100) / 100;
}

const utcDayStart = () => `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
const nextUtcMidnight = () => new Date(Date.parse(utcDayStart()) + 86_400_000).toISOString();

export async function aiUsage(db: D1Database, vaultId: string): Promise<AiUsage & { global_used: number }> {
  const since = utcDayStart();
  const [v, g] = await db.batch<{ n: number }>([
    db.prepare("SELECT COALESCE(SUM(neurons), 0) AS n FROM ai_usage WHERE vault_id = ? AND at >= ?").bind(vaultId, since),
    db.prepare("SELECT COALESCE(SUM(neurons), 0) AS n FROM ai_usage WHERE at >= ?").bind(since),
  ]);
  const used = Math.round(v.results[0]?.n ?? 0);
  const globalUsed = g.results[0]?.n ?? 0;
  const left = Math.max(0, Math.min(VAULT_DAILY_NEURONS - used, GLOBAL_DAILY_NEURONS - globalUsed));
  return {
    used,
    limit: VAULT_DAILY_NEURONS,
    left: Math.floor(left),
    scans_left: Math.floor(left / ESTIMATE.prescription),
    resets_at: nextUtcMidnight(),
    global_used: Math.round(globalUsed),
  };
}

/** The vault allowed AI processing of its photos and medicines (Settings → AI, or the first-scan prompt). */
export async function hasAiConsent(db: D1Database, vaultId: string): Promise<boolean> {
  return !!(await db.prepare("SELECT ai_consent_at FROM vaults WHERE id = ?").bind(vaultId).first<string | null>("ai_consent_at"));
}

/** Throws 429 when this vault, or the whole account, cannot afford a typical call of this kind today. */
export async function assertAiBudget(db: D1Database, vaultId: string, kind: AiKind): Promise<AiUsage> {
  const u = await aiUsage(db, vaultId);
  if (u.left >= ESTIMATE[kind]) return u;
  const shared = u.global_used + ESTIMATE[kind] > GLOBAL_DAILY_NEURONS;
  throw new HttpError(
    429,
    shared
      ? "The app's free AI allowance for today is used up. Fill the form by hand, or try again after 5:30 AM."
      : "This family's AI allowance for today is used up. Fill the form by hand, or try again after 5:30 AM.",
  );
}

export const recordAiUsage = (db: D1Database, vaultId: string, kind: AiKind, model: string, neurons: number, usage?: TokenUsage) =>
  db
    .prepare("INSERT INTO ai_usage (vault_id, kind, model, input_tokens, output_tokens, neurons) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(vaultId, kind, model, usage?.prompt_tokens ?? null, usage?.completion_tokens ?? null, neurons)
    .run();
