const CACHE_NAME = "ces-v21";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.url.includes("/api/")) return;
  if (e.request.url.includes("/static/js/")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && e.request.method === "GET") {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("/")))
  );
});
