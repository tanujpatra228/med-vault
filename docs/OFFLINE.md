# Offline mode

Status: **built**. Code: `src/lib/offline/` (store, persist, outbox, useOnline, prefetch), `src/components/OfflineBanner.tsx`, `public/sw.js`, `clientIds` in `worker/crud.ts`.

## What it does

- **The latest records stay on the phone.** The rest stay on the server.
  - Reports, prescriptions and visits: the newest 10 of each, per person.
  - Medicines: every one in use, plus the 10 most recently stopped.
  - Lab results: from the newest 10 report dates. Home readings: the newest 60.
  - Single records (a report, a prescription...): the 80 most recently loaded, opened or prefetched.
  - Members, the vault and the family summary stay whole.
  - Photos and PDFs: the 40 most recently opened (service worker cache `mv-files`).
- **Prefetch:** every link that comes on screen (a medicine in the list, a report, a follow-up) loads its record in the background, and opening a member loads all their tabs. So the records you can see open instantly, and offline too, without being tapped first.
  - Three requests at a time; skipped when offline, when the phone has Data Saver on, or when the record is already fresh (30 s).
  - A screen whose link was never on screen online shows "Offline, and this is not saved on this phone".
- **Logging BP and sugar works offline.** The reading is saved on the phone and shows as "Waiting to send" in Trends and on the home cards. It is sent when the connection comes back (or the next time the app opens online), and a toast says how many were sent.
- **Everything else needs a connection:** scans, edits, deletes, new prescriptions. They fail at once with "You're offline. This needs a connection; your latest records stay readable."
- **A bar at the bottom** while offline says what is shown and when it was last updated, plus how many readings are waiting.
- Saved data older than 30 days is not shown.

## How it works

- **Saved copy:** TanStack Query's cache is written to IndexedDB (`med-vault-offline` / `kv` / `query-cache`) at most every 2 seconds, trimmed by `trimClient()` on the way out. Restored on launch before any screen renders.
- **Never saved:** AI usage, the privacy notice, vault settings and the outbox query.
- **Last good copy wins:** a query whose refetch failed offline is still saved with its last data, so the next offline launch still shows it.
- **Outbox:** readings go to `kv` key `outbox` with an id made on the phone (UUID). The server accepts that id (`clientIds: true` on the readings resource) and returns the existing record if it was already saved, so a retry after a lost reply never creates a second reading. A reading the server rejects (400) is dropped; any other failure keeps the queue for later.
- **Logging out, or the server saying this phone is no longer linked,** deletes the saved copy, the outbox and the cached files.

- **Fast start with no or weak signal:** the service worker serves the saved app at once when the phone says it is offline, and after 2.5 s when the network hangs. Reads give up after 12 s, so a screen falls back to the saved copy instead of spinning. Saves have no timeout (scans and uploads can be slow).

## Gotchas

- `gcTime` is `Infinity`, not 30 days: anything above about 24.8 days overflows `setTimeout`, and React Query then drops unused queries at once, which also drops them from the next saved copy.
- Prefetch and screens share one set of query definitions (`queries` in `src/api/hooks.ts`), so a prefetched record lands in the exact cache entry its screen reads. Add new screens there, and to `queriesFor()` in `prefetch.ts`.
- `onlineManager.setOnline(navigator.onLine)` runs at startup. React Query otherwise assumes a connection until an `offline` event fires, so an app opened offline would try (and fail) every fetch.

## Not done (on purpose)

- No offline edits of existing records: conflicts with another phone's edits are not worth the code for a family app.
- No PIN lock: the phone's own lock is enough.
