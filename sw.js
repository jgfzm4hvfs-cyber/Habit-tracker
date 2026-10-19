const CACHE_NAME = "discipline-os-cache-v36";
const APP_ASSETS = ["./", "./index.html", "./styles.css?v=20261019a", "./cloud-config.js?v=20260214", "./app.js?v=20261019a", "./manifest.webmanifest?v=20261017k", "./apple-touch-icon.png?v=20261017k", "./icons/amulet.svg?v=20261017k", "./icons/amulet-192.png?v=20261017k", "./icons/amulet-512.png?v=20261017k", "./amulet.css?v=20261019a", "./amulet.js?v=20261019a", "./ui.css?v=20261019a", "./ui.js?v=20261019a"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname.endsWith("/cloud-config.js")) {
    // Start from the cached configuration; refresh it for the next visit.
    // A slow or unavailable network must not block the app's startup scripts.
    const refresh = fetch(request)
      .then(async (response) => {
        if (!response.ok) return null;
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    event.waitUntil(refresh.then(() => undefined));
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || refresh.then((response) => response || Response.error()),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});
