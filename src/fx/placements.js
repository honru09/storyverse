// Scene mapping for pixelfx: which effect plays on which surface, per
// genre family (the GENRE_SHELVES shelf ids from story-engine.js — a
// story's family is shelfForTemplate(its template id)). Pure data + pure
// functions, so tests can hold every id in this table against the
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
// - The reader's prose surface takes no pixelfx at all. One-shots that
//   fire on a chapter-open transition or over a loading surface are
//   gone when they finish and never sit on prose (wave 2: the upgrade
//   celebration is exactly that — a transition beat, not a prose
//   decoration).
// - One-shot scenes only hand out non-looping, actor-free effects: a
//   meta-loop never reports done, so its canvas would never leave.
// - Unknown / custom families fall back to a neutral default per scene.

export const PIXELFX_SCENE = {
  WAITING: "waiting",
  INTERVENE: "intervene",
  CHAPTER_UPGRADE: "chapter-upgrade",
  MERGE_SUCCESS: "merge-success",
  AVATAR_REVEAL: "avatar-reveal",
  FORGE_AMBIENT: "forge-ambient",
  FORGE_OPEN: "forge-open",
  PLAZA_LIKE: "plaza-like",
  PUBLISH_CELEBRATION: "publish-celebration",
  DETAIL_AMBIENT: "detail-ambient",
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

// ——— Wave 2 scenes (PIXELFX-WAVE2) ———

// Chapter upgrade / finale: a one-shot celebration on the chapter-open
// transition when the opened chapter closes a unit (升格) or the whole
// line (季终/终局). `fx` is the small beat, `grandFx` the finale beat;
// the caller decides which via structureFor (see chapterMilestoneKind
// in main.jsx) and asks pickFx with { grand: true }.
const CHAPTER_UPGRADE_BY_FAMILY = {
  xuanzhen: { fx: "arcane/mana-burst", palette: GOLD_RAMP, grandFx: "holy/holy-pillar", seed: 31, alt: ["explosions/firework-burst", "arcane/star-fall"] },
  wuxia: { fx: "arcane/mana-burst", grandFx: "holy/smite", seed: 32, alt: ["holy/holy-pillar"] },
  kehuan: { fx: "lightning/zap-hit", grandFx: "scifi/emp-blast", seed: 33, alt: ["explosions/firework-burst"] },
  dianjing: { fx: "lightning/zap-hit", grandFx: "scifi/emp-blast", seed: 34, alt: ["explosions/firework-burst"] },
  moshi: { fx: "arcane/mana-burst", grandFx: "shadow/dark-explosion", seed: 35, alt: ["explosions/implosion"] },
  xuanyi: { fx: "ice/snowflake-burst", grandFx: "arcane/star-fall", seed: 36, alt: ["shadow/dark-explosion"] },
  lingyi: { fx: "ice/snowflake-burst", grandFx: "shadow/dark-explosion", seed: 37, alt: ["arcane/star-fall"] },
  yanqing: { fx: "holy/feather-burst", grandFx: "arcane/star-fall", seed: 38, alt: ["explosions/firework-burst"] },
  fuben: { fx: "arcane/mana-burst", grandFx: "holy/holy-pillar", seed: 39, alt: ["arcane/star-fall"] },
};

const CHAPTER_UPGRADE_DEFAULT = { fx: "arcane/mana-burst", grandFx: "explosions/firework-burst", seed: 30, alt: ["explosions/firework-rocket", "holy/holy-pillar"] };

// Merge success: two lines converge and burst — an implosion reads as
// worlds pulling into each other; arcane/sci-fi families get their own
// outward signature instead.
const MERGE_SUCCESS_BY_FAMILY = {
  xuanzhen: { fx: "arcane/mana-burst", seed: 41, alt: ["explosions/implosion"] },
  fuben: { fx: "arcane/mana-burst", seed: 42, alt: ["explosions/implosion"] },
  kehuan: { fx: "scifi/emp-blast", seed: 43, alt: ["explosions/implosion"] },
  dianjing: { fx: "scifi/emp-blast", seed: 44, alt: ["explosions/implosion"] },
};

const MERGE_SUCCESS_DEFAULT = { fx: "explosions/implosion", seed: 40, alt: ["arcane/mana-burst"] };

// Avatar reveal: the moment a freshly painted portrait lands on the
// stage — a summoning rise, family-free (an avatar belongs to every
// world, so the beat keeps one neutral signature).
const AVATAR_REVEAL_DEFAULT = { fx: "spawn/summon-rise", seed: 50, alt: ["arcane/magic-circle-cast", "holy/holy-pillar"] };

// Forge ambient: the world / identity steps breathe with the world
// being picked. This table is keyed by WORLD id (the six preset
// worlds), not by family — pickForgeAmbientFx below owns the fallback
// chain (world → the waiting table's family pick → forge default), so
// switching worlds visibly switches the air, and a custom world still
// gets its family's weather.
const FORGE_AMBIENT_BY_WORLD = {
  mist: { fx: "water/ripples", seed: 61, alt: ["critters/wisp"] },
  cultivation: { fx: "arcane/rune-circle", palette: GOLD_RAMP, seed: 62, alt: ["arcane/arcane-orb"] },
  neon: { fx: "scifi/hologram", seed: 63, alt: ["lightning/spark-arc"] },
  city: { fx: "water/rain-splash", seed: 64, alt: ["weather/rain"] },
  court: { fx: "fire/candle", seed: 65, alt: ["fire/brazier"] },
  frontier: { fx: "scifi/energy-core", seed: 66, alt: ["scifi/hologram"] },
};

const FORGE_AMBIENT_DEFAULT = { fx: "water/water-orb", seed: 60, alt: ["weather/fireflies"] };

export const FORGE_AMBIENT_WORLDS = Object.keys(FORGE_AMBIENT_BY_WORLD);

// Forge open: the first chapter has landed and the new book's cover
// page opens — one falling-star beat over the cover stage.
const FORGE_OPEN_DEFAULT = { fx: "arcane/star-fall", seed: 70, alt: ["spawn/spawn-portal", "holy/feather-burst", "explosions/firework-burst"] };

// Plaza like: a fingertip-sized burst on the like button itself,
// throttled by the caller; never on un-like.
const PLAZA_LIKE_DEFAULT = { fx: "pickups/collect-burst", seed: 80, alt: ["pickups/power-star"] };

// Publish celebration: the toast that says a book reached the
// bookstore / a post reached the plaza gets one confetti beat anchored
// to the toast — the §37 burstParticles moment, in pixels.
const PUBLISH_CELEBRATION_DEFAULT = { fx: "ui/confetti", seed: 90, alt: ["explosions/firework-burst", "pickups/collect-burst"] };

// Detail ambient: inside the detail page's existing ambience layer
// (behind every glass panel, masked off by the layer's own gradient) —
// drifting spirit-flame / wisps at the quietest end of the catalog.
const DETAIL_AMBIENT_BY_FAMILY = {
  xuanyi: { fx: "critters/wisp", seed: 101, alt: ["critters/ghost"] },
  lingyi: { fx: "critters/ghost", seed: 102, alt: ["critters/wisp"] },
  moshi: { fx: "shadow/shadow-flames", seed: 103, alt: ["fire/spirit-flame"] },
  fanpai: { fx: "shadow/shadow-flames", seed: 104, alt: ["shadow/void-orb"] },
  zhongtian: { fx: "weather/fireflies", seed: 105, alt: ["water/fountain"] },
};

const DETAIL_AMBIENT_DEFAULT = { fx: "fire/spirit-flame", seed: 100, alt: ["weather/fireflies", "critters/wisp"] };

const TABLES = {
  waiting: { byFamily: WAITING_BY_FAMILY, fallback: WAITING_DEFAULT },
  intervene: { byFamily: INTERVENE_BY_FAMILY, fallback: INTERVENE_DEFAULT },
  "chapter-upgrade": { byFamily: CHAPTER_UPGRADE_BY_FAMILY, fallback: CHAPTER_UPGRADE_DEFAULT },
  "merge-success": { byFamily: MERGE_SUCCESS_BY_FAMILY, fallback: MERGE_SUCCESS_DEFAULT },
  "avatar-reveal": { byFamily: {}, fallback: AVATAR_REVEAL_DEFAULT },
  "forge-ambient": { byFamily: FORGE_AMBIENT_BY_WORLD, fallback: FORGE_AMBIENT_DEFAULT },
  "forge-open": { byFamily: {}, fallback: FORGE_OPEN_DEFAULT },
  "plaza-like": { byFamily: {}, fallback: PLAZA_LIKE_DEFAULT },
  "publish-celebration": { byFamily: {}, fallback: PUBLISH_CELEBRATION_DEFAULT },
  "detail-ambient": { byFamily: DETAIL_AMBIENT_BY_FAMILY, fallback: DETAIL_AMBIENT_DEFAULT },
};

/**
 * The effect pick for a scene and genre family (shelf id). Returns a
 * fresh { fx, palette?, seed? } the caller can hand straight to
 * PixelfxCanvas, or null for an unmapped scene. With { grand: true }
 * the entry's finale variant (grandFx) wins when the scene defines
 * one (chapter-upgrade); every other scene ignores the flag.
 */
export function pickFx(scene, genreFamily, { grand = false } = {}) {
  const table = TABLES[scene];
  if (!table) return null;
  const entry = table.byFamily[genreFamily] || table.fallback;
  const pick = { fx: grand && entry.grandFx ? entry.grandFx : entry.fx, seed: entry.seed };
  if (entry.palette) pick.palette = [...entry.palette];
  return pick;
}

/**
 * The forge's ambient pick: a preset world speaks for itself; a custom
 * world (or an unlisted world id) borrows the waiting table's family
 * pick, so the air still follows the story being forged.
 */
export function pickForgeAmbientFx(worldId, genreFamily) {
  if (worldId && Object.hasOwn(FORGE_AMBIENT_BY_WORLD, worldId)) {
    return pickFx(PIXELFX_SCENE.FORGE_AMBIENT, worldId);
  }
  return pickFx(PIXELFX_SCENE.WAITING, genreFamily);
}

/** Every effect id this table can hand out (primaries + alternates). */
export function placementFxIds() {
  const ids = new Set();
  for (const table of Object.values(TABLES)) {
    const addEntry = (entry) => {
      ids.add(entry.fx);
      if (entry.grandFx) ids.add(entry.grandFx);
      for (const id of entry.alt || []) ids.add(id);
    };
    addEntry(table.fallback);
    for (const entry of Object.values(table.byFamily)) addEntry(entry);
  }
  return [...ids];
}

// Scenes still noted for a future wave — deliberately not wired:
// - "cover-reveal": a finished cover swaps in (transitions/* are
//   full-frame wipes — handle with care, they are 320x180 by design).
// - "empty-shelf" / "login-welcome": critters/* and weather/* loops.
// Wave 2 landed the six enumerated scenes: chapter-upgrade,
// merge-success (the wave-1 note called it "merge-encounter"),
// avatar-reveal, forge-ambient (+ forge-open for the book-opening
// beat), plaza-like + publish-celebration, detail-ambient.
export const PLANNED_SCENES = [
  "cover-reveal",
  "empty-shelf",
  "login-welcome",
];
