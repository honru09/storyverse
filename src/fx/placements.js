// Scene mapping for pixelfx: which effect plays on which surface, per
// genre family (the GENRE_SHELVES shelf ids from story-engine.js — a
// story's family is shelfForTemplate(its template id)). Pure data + one
// pure function, so tests can hold every id in this table against the
// vendored catalog on disk.
//
// Placement principles (DESIGN.md §60):
// - Ambient loops are actor-free effects at modest native sizes: the
//   little stock character some effects act with never wanders into a
//   reading app's chrome.
// - Ambient primaries stay off the 320x180 full-frame weather scenes:
//   pretty, but they paint an opaque rectangle and cost several times
//   the per-frame time of the compact object effects (measured in
//   PIXELFX-WAVE1.md). They remain listed as alternates for surfaces
//   that can afford them. One exception: zhongtian's fireflies, sparse
//   dots on a small particle count, kept for flavour.
// - One scene, one effect. Atmosphere supports the surface; it never
//   competes with text or progress affordances.
// - The reader's prose surface takes no pixelfx at all. The intervention
//   overlay is a loading surface, not prose — that is why it qualifies.
// - Unknown / custom families fall back to a neutral default per scene.

export const PIXELFX_SCENE = {
  WAITING: "waiting",
  INTERVENE: "intervene",
};

// A gold ramp in the arcane family's 8-step shape: 修仙/玄幻 reads gold,
// the library's native violet serves 副本 (a summoning circle) as-is.
const GOLD_RAMP = ["#160d04", "#38200a", "#6e4410", "#b57f1e", "#eda93c", "#ffd873", "#ffefb0", "#ffffff"];

// Generation wait: a quiet loop ringing the waiting card's orb, keyed
// to the family of the book being written. `alt` lists runner-up
// candidates for later waves; pickFx always takes the primary.
const WAITING_BY_FAMILY = {
  xuanzhen: { fx: "arcane/rune-circle", palette: GOLD_RAMP, seed: 7, alt: ["arcane/arcane-orb", "arcane/portal"] },
  wuxia: { fx: "water/ripples", seed: 3, alt: ["weather/falling-leaves", "critters/butterfly"] },
  chuanyue: { fx: "arcane/portal", seed: 5, alt: ["arcane/rune-circle", "spawn/spawn-portal"] },
  yanqing: { fx: "critters/butterfly", seed: 2, alt: ["weather/cherry-blossoms", "holy/sunburst"] },
  dushi: { fx: "water/rain-splash", seed: 4, alt: ["weather/rain", "lightning/spark-arc"] },
  yule: { fx: "pickups/power-star", seed: 6, alt: ["weather/shooting-stars", "weather/fireflies"] },
  lishi: { fx: "fire/campfire", seed: 8, alt: ["fire/brazier", "weather/falling-leaves"] },
  kehuan: { fx: "scifi/energy-core", seed: 9, alt: ["lightning/plasma-ball", "scifi/hologram"] },
  moshi: { fx: "shadow/shadow-flames", seed: 10, alt: ["weather/storm", "fire/campfire"] },
  xuanyi: { fx: "critters/wisp", seed: 11, alt: ["critters/ghost", "shadow/necro-skulls"] },
  lingyi: { fx: "critters/ghost", seed: 12, alt: ["critters/wisp", "shadow/shadow-flames"] },
  fuben: { fx: "arcane/rune-circle", seed: 13, alt: ["arcane/portal", "scifi/teleporter-pad"] },
  dianjing: { fx: "scifi/hologram", seed: 14, alt: ["lightning/plasma-ball", "scifi/energy-core"] },
  junshi: { fx: "fire/brazier", seed: 15, alt: ["fire/campfire", "weather/storm"] },
  tiyu: { fx: "holy/sunburst", seed: 16, alt: ["pickups/power-star", "weather/shooting-stars"] },
  zhongtian: { fx: "weather/fireflies", seed: 17, alt: ["weather/falling-leaves", "water/fountain"] },
  duanpian: { fx: "arcane/arcane-orb", seed: 18, alt: ["critters/butterfly", "weather/fireflies"] },
  fanpai: { fx: "shadow/void-orb", seed: 19, alt: ["shadow/shadow-flames", "shadow/black-hole"] },
};

const WAITING_DEFAULT = { fx: "water/water-orb", seed: 1, alt: ["weather/fireflies", "arcane/arcane-orb"] };

// The intervention beat: one one-shot burst over the intervention
// sequence's weave, gone when it finishes. Arcane by default — an
// unnamed force reaches in — with family-flavoured variants.
const INTERVENE_BY_FAMILY = {
  xuanzhen: { fx: "arcane/magic-circle-cast", seed: 21, alt: ["arcane/mana-burst"] },
  wuxia: { fx: "arcane/mana-burst", seed: 22, alt: ["arcane/magic-circle-cast"] },
  xuanyi: { fx: "shadow/hex-sigil", seed: 23, alt: ["shadow/grasping-hands"] },
  lingyi: { fx: "shadow/grasping-hands", seed: 24, alt: ["shadow/hex-sigil"] },
  kehuan: { fx: "scifi/emp-blast", seed: 25, alt: ["explosions/implosion"] },
  moshi: { fx: "explosions/implosion", seed: 26, alt: ["shadow/dark-explosion"] },
  yanqing: { fx: "arcane/star-fall", seed: 27, alt: ["arcane/magic-circle-cast"] },
  fuben: { fx: "spawn/spawn-portal", seed: 28, alt: ["arcane/magic-circle-cast"] },
  dianjing: { fx: "transitions/glitch-wipe", seed: 29, alt: ["scifi/emp-blast"] },
};

const INTERVENE_DEFAULT = { fx: "arcane/magic-circle-cast", seed: 20, alt: ["arcane/mana-burst"] };

const TABLES = {
  waiting: { byFamily: WAITING_BY_FAMILY, fallback: WAITING_DEFAULT },
  intervene: { byFamily: INTERVENE_BY_FAMILY, fallback: INTERVENE_DEFAULT },
};

/**
 * The effect pick for a scene and genre family (shelf id). Returns a
 * fresh { fx, palette?, seed? } the caller can hand straight to
 * PixelfxCanvas, or null for an unmapped scene.
 */
export function pickFx(scene, genreFamily) {
  const table = TABLES[scene];
  if (!table) return null;
  const entry = table.byFamily[genreFamily] || table.fallback;
  const pick = { fx: entry.fx, seed: entry.seed };
  if (entry.palette) pick.palette = [...entry.palette];
  return pick;
}

/** Every effect id this table can hand out (primaries + alternates). */
export function placementFxIds() {
  const ids = new Set();
  for (const table of Object.values(TABLES)) {
    ids.add(table.fallback.fx);
    for (const id of table.fallback.alt || []) ids.add(id);
    for (const entry of Object.values(table.byFamily)) {
      ids.add(entry.fx);
      for (const id of entry.alt || []) ids.add(id);
    }
  }
  return [...ids];
}

// Scenes noted for later waves — deliberately not wired in wave 1:
// - "publish-celebration": a book lands on the bookstore shelf
//   (ui/* bursts, pickups/* glints).
// - "merge-encounter": the 合流 generation wait (GenerationOverlay
//   kind="merge" — the waiting table above already keys off the merged
//   line's lead family when a caller passes one).
// - "chapter-upgrade": the 6/12/18/24-chapter ascension beats
//   (holy/*, arcane/* one-shots).
// - "cover-reveal": a finished cover swaps in (transitions/* are
//   full-frame wipes — handle with care, they are 320x180 by design).
// - "empty-shelf" / "login-welcome": critters/* and weather/* loops.
export const PLANNED_SCENES = [
  "publish-celebration",
  "merge-encounter",
  "chapter-upgrade",
  "cover-reveal",
  "empty-shelf",
  "login-welcome",
];
