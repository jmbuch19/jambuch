// jambuch.in service worker: opens fast and keeps already-read chapters
// readable offline. Only public reading pages, the site's own files and
// chapter pictures are cached. Admin pages, sign-in, the API, Courtyard
// forms and member downloads (private links on other hosts) are never touched.

const VERSION = "v1";
const PAGES = `pages-${VERSION}`; // chapter and book pages, home, /continue
const STATIC = `static-${VERSION}`; // scripts, styles, fonts (hashed names never change)
const IMAGES = `images-${VERSION}`; // chapter pictures from media.jambuch.in
const LIMITS = { [PAGES]: 60, [STATIC]: 250, [IMAGES]: 80 };
const PRECACHE = ["/continue", "/offline.html", "/icons/icon-192.png"];
const NETWORK_WAIT_MS = 3500; // slower than this, open the saved copy

// Pages worth keeping for offline reading.
const READING_PAGE = /^\/(?:$|continue$|install$|library\/[^/]+(?:\/[^/]+)?$)/;
const NEVER = /^\/(?:admin|api|auth)(?:\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !Object.keys(LIMITS).includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Oldest entries go first once a cache is over its limit.
async function trim(name) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMITS[name]))) await cache.delete(key);
}

async function put(name, request, response) {
  const cache = await caches.open(name);
  // Re-adding moves the entry to the end, so recently read pages stay longest.
  await cache.delete(request);
  await cache.put(request, response);
  await trim(name);
}

// Fresh from the network when it answers quickly; otherwise the saved copy.
async function readingPage(event) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName: PAGES, ignoreSearch: true });
  const network = fetch(request).then((response) => {
    if (response.ok && !response.redirected && response.type === "basic") {
      event.waitUntil(put(PAGES, request, response.clone()));
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));

  if (!cached) {
    return network.catch(async () => (await caches.match("/offline.html", { cacheName: PAGES })) ?? Response.error());
  }
  const slow = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT_MS));
  return Promise.race([network.catch(() => cached), slow]);
}

async function cacheFirst(event, name) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName: name });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") event.waitUntil(put(name, request, response.clone()));
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (NEVER.test(url.pathname)) return;
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(event, STATIC));
      return;
    }
    if (request.mode === "navigate") {
      if (READING_PAGE.test(url.pathname)) {
        event.respondWith(readingPage(event));
      } else {
        // Other pages are never stored, but offline they get the friendly page.
        event.respondWith(
          fetch(request).catch(async () => (await caches.match("/offline.html", { cacheName: PAGES })) ?? Response.error()),
        );
      }
    }
    return;
  }

  // Chapter pictures (public bucket only).
  if (url.hostname === "media.jambuch.in" && request.destination === "image") {
    event.respondWith(cacheFirst(event, IMAGES));
  }
});
