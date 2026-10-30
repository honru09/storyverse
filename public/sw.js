/* Storyweave offline shell (F-18, DESIGN §27) + local media cache
 * (LOCAL-CACHE, REQ-50).
 *
 * Scope, stated plainly: offline reading covers what is already on this
 * device — the app shell itself, the reader's cloud library payload
 * (whose chapters are the prose), and plaza lines already fetched.
 * Writes (generation, publishing, merging, auth) are never cached or
 * replayed; they simply fail offline and the app says so.
 *
 * Strategies:
 * - App shell: precached at install (the '/' document plus the hashed
 *   bundles it names — exactly one current shell, rebuilt from scratch
 *   on every install), cache-first at runtime for the remaining static
 *   files. Navigations stay network-first, so a fresh deploy reaches
 *   the client on the next open and nobody is stranded on an old shell.
 * - Public images (world art under /art/, plaza/store covers and
 *   portraits, public profile portraits/pictures/banners):
 *   cache-first with background revalidation, in a media cache with a
 *   hard budget (MEDIA_MAX_BYTES / MEDIA_MAX_ENTRIES, oldest copies
 *   evicted first). Reopening the app shows the pictures already on
 *   the device instead of downloading them again.
 * - Private account images (/api/cover, /api/avatar/image) are never
 *   stored by this worker: Cache Storage is not separated by account,
 *   so they ride the browser's own private HTTP cache instead (the
 *   server marks them `private` and gives them an ETag).
 * - GET /api/library and the public plaza reads: network-first,
 *   falling back to the last good copy. Only 200 responses are stored.
 */
/* DEVICE-FIX3 (REQ-35): v2 — the version had never moved since the
 * shell shipped, so every installed client kept its first runtime
 * caches forever. LOCAL-CACHE (REQ-50): v3 — same lesson applied: the
 * bump makes the activate handler retire the v2 shell/data caches on
 * next launch. The media cache deliberately carries NO shell version:
 * pictures do not change when the app does, and wiping them on every
 * deploy would defeat the cache; the size budget below is what keeps
 * that cache honest. */
const VERSION = 'storyweave-v3';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const MEDIA_CACHE = 'media-v1';
const MEDIA_MAX_BYTES = 40 * 1024 * 1024;
const MEDIA_MAX_ENTRIES = 300;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    try {
      /* Exactly one current shell: rebuild the cache from scratch,
       * then precache the document and the hashed bundles it names so
       * the second open needs no network for the shell at all. Any
       * failure degrades to the old runtime fill — never to a broken
       * install. */
      await caches.delete(SHELL_CACHE);
      const cache = await caches.open(SHELL_CACHE);
      const core = ['/', '/theme-init.js', '/manifest.webmanifest', '/icon.svg', '/default-avatar.svg'];
      try {
        const html = await (await fetch('/')).text();
        const assets = [...html.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)].map((match) => match[0]);
        await cache.addAll([...new Set([...core, ...assets])]);
      } catch {
        await cache.addAll(core).catch(() => {});
      }
    } catch { /* runtime fill remains as the fallback */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => ![SHELL_CACHE, DATA_CACHE, MEDIA_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

const DATA_PATHS = [/^\/api\/library$/, /^\/api\/plaza$/, /^\/api\/plaza\/[^/]+$/];

const MEDIA_PATHS = [
  /^\/api\/(?:plaza|store)\/[^/]+\/(?:cover|portrait)$/,
  /^\/api\/users\/[^/]+\/(?:portrait|picture|banner)$/,
];
const isMediaRequest = (url) => url.pathname.startsWith('/art/')
  || MEDIA_PATHS.some((pattern) => pattern.test(url.pathname));

/* Eviction is by the response's own Date/Content-Length headers (both
 * always set by our server): oldest copy out first. A background
 * revalidation replaces the copy and refreshes its Date, so the order
 * tracks last-network-refresh — an approximation of LRU that costs no
 * bookkeeping writes on cache hits. */
async function trimMediaCache(cache) {
  const keys = await cache.keys();
  const entries = [];
  let total = 0;
  for (const request of keys) {
    const response = await cache.match(request);
    if (!response) continue;
    const size = Number(response.headers.get('content-length')) || 0;
    const at = Date.parse(response.headers.get('date') || '') || 0;
    entries.push({ request, size, at });
    total += size;
  }
  entries.sort((a, b) => a.at - b.at);
  while (entries.length > MEDIA_MAX_ENTRIES || total > MEDIA_MAX_BYTES) {
    const victim = entries.shift();
    if (!victim) break;
    total -= victim.size;
    await cache.delete(victim.request);
  }
}

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

  if (isMediaRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const hit = await cache.match(request);
      const revalidate = (async () => {
        const fresh = await fetch(request);
        if (fresh.ok) {
          try {
            await cache.put(request, fresh.clone());
            await trimMediaCache(cache);
          } catch { /* quota pressure: the HTTP cache still has it */ }
        }
        return fresh;
      })();
      if (hit) {
        event.waitUntil(revalidate.catch(() => {}));
        return hit;
      }
      return revalidate;
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')
    || url.pathname.startsWith('/icon') || url.pathname.startsWith('/favicon')
    || url.pathname === '/theme-init.js'
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
