/* Storyweave offline shell (F-18, DESIGN §27).
 *
 * Scope, stated plainly: offline reading covers what is already on this
 * device — the app shell itself, the reader's cloud library payload
 * (whose chapters are the prose), and plaza lines already fetched.
 * Writes (generation, publishing, merging, auth) are never cached or
 * replayed; they simply fail offline and the app says so.
 *
 * Strategies:
 * - App shell + static assets: cache-first, filled at runtime.
 * - Navigations: network-first, falling back to the cached shell.
 * - GET /api/library and the public plaza reads: network-first,
 *   falling back to the last good copy. Only 200 responses are stored.
 */
const VERSION = 'storyweave-v1';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => ![SHELL_CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

const DATA_PATHS = [/^\/api\/library$/, /^\/api\/plaza$/, /^\/api\/plaza\/[^/]+$/];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        void cache.put('/', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (DATA_PATHS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) void cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/art/')
    || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icon')
    || url.pathname.startsWith('/favicon') || url.pathname === '/theme-init.js'
    || url.pathname === '/default-avatar.svg'
    || url.pathname === '/default-avatar.png' || url.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const fresh = await fetch(request);
      if (fresh.ok) void cache.put(request, fresh.clone());
      return fresh;
    })());
  }
});
