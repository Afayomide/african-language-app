const CACHE_NAME = "language-app-v2";
const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  const { pathname } = new URL(event.request.url);

  // Never cache API responses so dashboard data (like progress) is always fresh.
  if (pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(
        () =>
          new Response(JSON.stringify({ message: "Network unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});
