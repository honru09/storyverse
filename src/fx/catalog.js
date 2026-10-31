// The build-time catalog of the vendored pixelfx library (src/fx/pixelfx,
// pinned in its VENDOR.md). Vite's import.meta.glob enumerates every effect
// module at build time; each entry lazy-loads its module on first use, so
// the 244 effects cost no initial bundle weight — a scene pays only for the
// one effect it actually plays.
//
// Entry shape: { id: "ice/frost-nova", category: "ice", name: "frost-nova",
// load: () => Promise<module> }. The module itself carries the display
// metadata (meta.name / meta.size / meta.loop / …); `name` here is the file
// stem, which is also the stable half of the id used by placements.js.
//
// _lib.js files are per-category shared helpers, not effects, and are
// excluded. tests/pixelfx-catalog.test.js re-walks the vendored tree on
// disk and asserts this enumeration stays in exact sync with it.

const modules = import.meta.glob("./pixelfx/fx/*/*.js");

export const PIXELFX_CATALOG = Object.entries(modules)
  .filter(([path]) => !path.endsWith("/_lib.js"))
  .map(([path, load]) => {
    const match = path.match(/\/fx\/([^/]+)\/([^/]+)\.js$/);
    const category = match[1];
    const name = match[2];
    return { id: `${category}/${name}`, category, name, load };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export const pixelfxById = new Map(PIXELFX_CATALOG.map((entry) => [entry.id, entry]));

export function hasPixelfx(id) {
  return pixelfxById.has(id);
}

/** Load an effect module by catalog id; null when the id is unknown. */
export async function loadPixelfx(id) {
  const entry = pixelfxById.get(id);
  if (!entry) return null;
  return entry.load();
}
