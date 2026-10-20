/* Service worker: keeps Pyodide's files from jsDelivr in Cache Storage, so each Pyodide
 * version (and each package) is downloaded once instead of whenever the browser's HTTP cache
 * drops it. Every other request goes to the network as usual.
 *
 * public/pyodide-worker.js reads the same cache to pick its status message and deletes files
 * from Pyodide versions it no longer uses.
 */
const CACHE = "pyodide";
const PYODIDE_PREFIX = "https://cdn.jsdelivr.net/pyodide/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(PYODIDE_PREFIX)) return;
  event.respondWith(cacheFirst(event, request));
});

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Versioned URLs never change, so a good response can be kept for good.
  if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  return response;
}
