import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import type { Medication, LabValue } from "@shared/types";
import { kv } from "./store";

/** How many of the newest records of each kind stay on the phone. The rest stay on the server. */
export const KEEP = 10;
/** Home readings are small and feed the charts, so more of them stay. */
const KEEP_READINGS = 60;
/** Single records (one report, one prescription...) kept, most recently loaded first. Links on screen are prefetched, so this covers the latest lists. */
const KEEP_DETAILS = 80;
/** Saved data older than this is not shown offline. */
export const MAX_AGE = 30 * 86_400_000;

type Query = PersistedClient["clientState"]["queries"][number];

const LISTS_NEWEST_FIRST = new Set(["reports", "visits", "prescriptions"]);
const DETAILS = new Set(["report", "prescription", "visit", "medication", "reading", "allergy", "condition", "condition-timeline", "files", "doctors"]);
const NEVER = new Set(["ai-usage", "privacy", "vault", "outbox", "activity"]);

/** Keeps the newest few of a query's data; lists that matter in full (members, medicines in use) stay whole. */
function trim(q: Query): Query | null {
  const kind = String(q.queryKey[0]);
  const data = q.state.data as unknown;
  if (NEVER.has(kind)) return null;
  let kept = data;
  if (!Array.isArray(data)) {
    // Single records and objects stay whole.
  } else if (LISTS_NEWEST_FIRST.has(kind)) kept = data.slice(0, KEEP);
  else if (kind === "readings") kept = data.slice(0, KEEP_READINGS);
  else if (kind === "medications") {
    // Every medicine in use, plus the most recent stopped ones.
    const meds = data as Medication[];
    const stopped = meds.filter((m) => m.status !== "active").sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""));
    kept = [...meds.filter((m) => m.status === "active"), ...stopped.slice(0, KEEP)];
  } else if (kind === "labs") {
    // Results from the newest few reports (the list is oldest first).
    const values = data as LabValue[];
    const dates = [...new Set(values.map((v) => v.report_date ?? ""))].sort().reverse().slice(0, KEEP);
    const oldest = dates[dates.length - 1] ?? "";
    kept = values.filter((v) => (v.report_date ?? "") >= oldest);
  }
  // Saved as the last good copy: a refetch that failed offline must not hide it next time.
  return { ...q, state: { ...q.state, data: kept, status: "success", error: null, fetchStatus: "idle" } };
}

/** The saved copy: trimmed lists, and only the most recently viewed single records. */
export function trimClient(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.map(trim).filter((q): q is Query => q !== null);
  const details = queries.filter((q) => DETAILS.has(String(q.queryKey[0])) && q.queryKey.length > 1).sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const dropped = new Set(details.slice(KEEP_DETAILS));
  return { ...client, clientState: { ...client.clientState, queries: queries.filter((q) => !dropped.has(q)) } };
}

/** Saves every query that has data, including ones whose latest refetch failed (offline). */
export const dehydrateOptions = { shouldDehydrateQuery: (q: { state: { data: unknown } }) => q.state.data !== undefined };

export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => kv.get<string>(k).then((v) => v ?? null), setItem: (k, v) => kv.set(k, v), removeItem: (k) => kv.del(k) },
  key: "query-cache",
  throttleTime: 2000,
  serialize: (client) => JSON.stringify(trimClient(client)),
});

/** When the saved copy was last refreshed from the server (for the offline banner). */
export async function savedAt(): Promise<number | null> {
  const raw = await kv.get<string>("query-cache");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as PersistedClient).timestamp;
  } catch {
    return null;
  }
}
