import type { QueryClient } from "@tanstack/react-query";
import type { Reading } from "@shared/readings";
import { api, ApiError } from "@/api/client";
import { kv } from "./store";

/** A home reading saved on the phone while offline, waiting to be sent. */
export interface PendingReading {
  id: string;
  body: Record<string, unknown>;
  savedAt: string;
}

const KEY = "outbox";
const read = async () => (await kv.get<PendingReading[]>(KEY)) ?? [];

export const pendingCount = async () => (await read()).length;

/** Readings from the outbox shaped like saved ones, so lists and charts can show them with a "waiting" mark. */
export async function pendingReadings(): Promise<Array<Reading & { pending: true }>> {
  return (await read()).map((p) => ({
    ...(p.body as unknown as Reading),
    id: p.id,
    created_at: p.savedAt,
    updated_at: p.savedAt,
    pending: true as const,
  }));
}

/**
 * Saves a new reading on the phone. It carries its own id, so sending it twice (a retry after a lost
 * reply) cannot create two copies on the server.
 */
export async function queueReading(body: Record<string, unknown>, qc: QueryClient) {
  const item: PendingReading = { id: crypto.randomUUID(), body: { ...body }, savedAt: new Date().toISOString() };
  item.body.id = item.id;
  await kv.set(KEY, [...(await read()), item]);
  await qc.invalidateQueries({ queryKey: ["outbox"] });
}

let flushing: Promise<number> | null = null;

/** Sends waiting readings, oldest first. Stops at the first failure and keeps the rest for later. Returns how many were sent. */
export function flushOutbox(qc: QueryClient): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (const item of await read()) {
        if (!navigator.onLine) break;
        try {
          await api.post("/readings", item.body);
        } catch (e) {
          // A reading the server calls invalid (400) would block the queue forever: drop it and keep going.
          // Anything else (offline, server error, device logged out) keeps it for the next try.
          if (e instanceof ApiError && e.status === 400) console.warn("Dropped a queued reading the server rejected", e);
          else break;
        }
        await kv.set(KEY, (await read()).filter((p) => p.id !== item.id));
        sent++;
      }
    } finally {
      flushing = null;
    }
    if (sent) await qc.invalidateQueries();
    return sent;
  })();
  return flushing;
}
