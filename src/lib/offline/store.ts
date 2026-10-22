/**
 * A tiny key-value store on IndexedDB for offline data (the saved records and the outbox).
 * Every call fails soft: offline support is a convenience, the app works without it.
 */
const DB_NAME = "med-vault-offline";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return db()
    .then(
      (d) =>
        new Promise<T | undefined>((resolve, reject) => {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error);
        }),
    )
    .catch(() => undefined);
}

export const kv = {
  get: <T>(key: string) => run<T>("readonly", (s) => s.get(key)),
  set: (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key)).then(() => undefined),
  del: (key: string) => run("readwrite", (s) => s.delete(key)).then(() => undefined),
};

/** Removes everything this vault left on the phone: saved records, the outbox and cached photos. */
export async function clearOfflineData() {
  await kv.del("query-cache");
  await kv.del("outbox");
  try {
    await caches.delete("mv-files");
  } catch {
    // no Cache Storage (private mode): nothing to clear
  }
}
