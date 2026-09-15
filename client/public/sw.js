const CACHE_NAME = "carnavales-static-__BUILD_ID__";
const PRECACHE = /*__PRECACHE__*/[];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  // Wait for all previous clients to close; never interrupt a ballot or form.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("carnavales-static-") && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/health") return;
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(fetch(request, { cache: "no-cache" }).catch(async () => {
      const cached = await (await caches.open(CACHE_NAME)).match("/index.html");
      return cached || Response.error();
    }));
    return;
  }
  if (!PRECACHE.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (await cache.match(request)) || fetch(request)));
});
