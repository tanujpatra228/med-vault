// Med Vault service worker: caches the app shell, and the photos/PDFs opened most recently so they open
// offline. Record data is never cached here (the app keeps its own small offline copy of the latest records).
const CACHE = "mv-shell-v4";
const FILES = "mv-files";
/** Photos and PDFs kept for offline use; the oldest go first. */
const MAX_FILES = 40;
/** How long a page load waits for the network before opening the saved app. */
const NAV_TIMEOUT = 2500;
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Photos and PDFs: never change once uploaded (a new upload gets a new id), so the network first and
  // the saved copy when offline. Downloads (?download=1) and thumbnails share the same saved copy.
  if (/^\/api\/files\/[\w-]+$/.test(url.pathname)) {
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(FILES).then(async (c) => {
              await c.delete(key);
              await c.put(key, copy);
              const keys = await c.keys();
              await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_FILES)).map((k) => c.delete(k)));
            });
          }
          return res;
        })
        .catch(() => caches.open(FILES).then((c) => c.match(key)).then((hit) => hit || Response.error())),
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Pages: network first so a new deploy shows up, shell from cache when offline. Offline, or on a
  // connection that hangs (no data, weak signal), the saved shell opens at once or after NAV_TIMEOUT.
  if (request.mode === "navigate") {
    const network = fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("/", copy));
      }
      return res;
    });
    event.respondWith(
      caches.match("/").then((shell) => {
        if (!shell) return network;
        if (!navigator.onLine) return shell;
        const late = new Promise((resolve) => setTimeout(() => resolve(shell), NAV_TIMEOUT));
        return Promise.race([network.catch(() => shell), late]);
      }),
    );
    return;
  }

  // Hashed build assets are immutable: cache first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Reminders (Web Push). The payload is decrypted by the browser: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let msg = { title: "Med Vault", body: "", url: "/", tag: "med-vault" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    // keep the generic message
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      renotify: true,
      icon: "/icons/icon-192.png",
      data: { url: msg.url },
    }),
  );
});

// Tapping a reminder opens (or focuses) the app on the right screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin));
      if (win) return win.navigate(url).then((w) => (w || win).focus());
      return self.clients.openWindow(url);
    }),
  );
});
