// Idle prefetch for pixelfx scene chunks (PIXELFX-WAVE3, DESIGN §60).
//
// Every effect is its own lazy chunk (catalog.js), so a scene pays a
// fetch the first time it plays. Surfaces that can see a scene coming
// — the reader knows its book's family, so it knows which intervene
// burst and milestone celebration it may need — warm those chunks
// while the browser is idle, and the effect is simply there when the
// moment lands. Failures are silent by design: a cold chunk costs the
// scene one fetch, never an error.

// The catalog import is dynamic and browser-side only: catalog.js
// is built on import.meta.glob (Vite), so importing it at module
// scope would make this file unloadable in plain node tooling.
const prefetched = new Set();

export function prefetchedPixelfxIds() {
  return [...prefetched];
}

/**
 * Warm the chunks for the given effect ids at idle time. Deduped for
 * the whole session; resolves with the ids this call actually warmed.
 * Outside a browser (tests, SSR) it is a no-op.
 */
export function prefetchPixelfx(ids) {
  if (typeof window === "undefined") return Promise.resolve([]);
  const fresh = [...new Set(ids || [])].filter((id) => id && !prefetched.has(id));
  for (const id of fresh) prefetched.add(id);
  if (!fresh.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    const run = async () => {
      try {
        const { loadPixelfx } = await import("./catalog.js");
        await Promise.allSettled(fresh.map((id) => loadPixelfx(id).catch(() => null)));
      } catch {
        /* a failed warm-up is silent by design */
      }
      resolve(fresh);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      window.setTimeout(run, 600);
    }
  });
}
