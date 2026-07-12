// Backtrace service worker — offline is a baseline, not a feature (CRESEARCH.md §4.5).
//
// Strategy:
//  - App shell (same-origin HTML/JS/CSS + the self-hosted fonts): stale-while-revalidate.
//    The first (online) visit populates the cache as the shell loads; every later load —
//    including offline — is served from cache, then refreshed in the background. So after
//    one online visit the whole app runs with no network.
//  - Basemap tiles (CARTO / Esri hillshade): opportunistic runtime cache, cache-first with
//    a bounded size, so recently-viewed areas survive offline. Never blocks: a missing tile
//    just fails softly (a map gap), it never stalls the app.
//  - Nothing here talks to a server for data; persistence + sharing are files (v5 S1).
//
// NOTE: this raster-tile cache is best-effort. True field-grade offline basemaps
// (PMTiles + MapLibre vector tiles, SOURCES.MD §9) are a later field-mode item, not built
// here — see NOW.md.

const SHELL_CACHE = "backtrace-shell-v1";
const TILE_CACHE = "backtrace-tiles-v1";
const TILE_HOSTS = ["basemaps.cartocdn.com", "server.arcgisonline.com"];
const TILE_MAX = 500;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.add("/")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(tileStrategy(req));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(shellStrategy(req));
  }
  // other cross-origin GETs: default network handling
});

async function shellStrategy(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    network; // revalidate in the background
    return cached;
  }
  const res = await network;
  if (res) return res;
  if (req.mode === "navigate") {
    const idx = await cache.match("/");
    if (idx) return idx; // offline navigation → the cached app shell
  }
  return new Response("", { status: 504, statusText: "offline" });
}

async function tileStrategy(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone());
      trimCache(cache, TILE_MAX);
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const excess = keys.length - max;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
