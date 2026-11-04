/* Service worker : toute l'application reste disponible hors connexion. */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const APP_CACHE = `mes-frais-pro-${VERSION}`;
const OCR_CACHE = "mes-frais-pro-ocr"; // module de lecture : conservé d'une version à l'autre
const SCOPE = self.registration.scope;

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(APP_CACHE);
      await c.addAll([SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icon-192.png`, `${SCOPE}icon-512.png`]).catch(() => {});
      try {
        const res = await fetch(`${SCOPE}precache.json`, { cache: "no-store" });
        const files = await res.json();
        await c.addAll(files.filter((f) => f !== "index.html").map((f) => SCOPE + f));
      } catch {
        /* en développement : pas de liste */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page : réseau d'abord (pour recevoir les mises à jour), sinon version en cache.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(SCOPE, copy));
          return res;
        })
        .catch(() => caches.match(SCOPE)),
    );
    return;
  }

  // Fichiers de l'app et module de lecture : cache d'abord.
  const cacheName = url.pathname.startsWith(new URL(`${SCOPE}ocr/`).pathname) ? OCR_CACHE : APP_CACHE;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(cacheName).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
