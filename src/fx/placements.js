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
// - Ambient picks stay off the 320x180 full-frame weather scenes:
//   pretty, but they paint an opaque rectangle (fireflies even fills
//   a dark haze via drawBack) and cost several times the per-frame
//   time of the compact object effects (measured in PIXELFX-WAVE1.md).
//   Since wave 3 the `alt` lists are the LIVE self-healing chain, so
//   alternates follow the same discipline as primaries — compact and
//   transparent, never a full-frame weather scene. One pre-existing
//   exception: zhongtian's fireflies PRIMARY (wave 1, kept as
//   authored; it is a primary, never a heal target).
// - Alternates also respect the scene's loop discipline: a one-shot
//   scene's alternates must be non-looping (a looping alternate
//   never reports done and its canvas would never leave), and every
//   alternate everywhere must be actor-free.
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
  COVER_REVEAL: "cover-reveal",
  EMPTY_SHELF: "empty-shelf",
  LOGIN_WELCOME: "login-welcome",
  RATING_SUCCESS: "rating-success",
  SHELF_COLLECT: "shelf-collect",
  REDEEM_SUCCESS: "redeem-success",
  SEASON_FINALE: "season-finale",
  SEARCH_EMPTY: "search-empty",
  FOLLOW_SUCCESS: "follow-success",
};

// A gold ramp in the arcane family's 8-step shape: 修仙/玄幻 reads gold,
// the library's native violet serves 副本 (a summoning circle) as-is.
const GOLD_RAMP = ["#160d04", "#38200a", "#6e4410", "#b57f1e", "#eda93c", "#ffd873", "#ffefb0", "#ffffff"];

// ——— Theme dimension (PIXELFX-WAVE3) ———
// The shell theme (src/theme.js: 'black' | 'white' | 'aurora') reaches
// this table through setPixelfxTheme, wired once by App; pickFx then
// shades its palettes per theme:
// - white: glow effects wash out on a light ground, so gold goes deep
//   amber (DEEP_GOLD_RAMP, no near-white steps) and palette-free glow
//   effects take the ink ramp (INK_RAMP — smoke/ink tones).
// - aurora: the deep-navy glass theme takes blue-violet shades
//   (VIOLET_RAMP for gold entries, AURORA_RAMP for palette-free glow).
// - black: the authored look, untouched.
// An entry may pin its own per-theme palette via `themes: { white:
// { palette }, aurora: { palette } }`; that beats both its base
// palette and the generic glow rule below.
const DEEP_GOLD_RAMP = ["#140a02", "#2e1a06", "#54300c", "#7d4d12", "#a06a1c", "#bd8327", "#d29c33", "#e0aa3d"];
const VIOLET_RAMP = ["#0d0618", "#241040", "#3d1f74", "#5a34a8", "#7d55d6", "#a586ec", "#cdbcf8", "#ffffff"];
const INK_RAMP = ["#0a0d16", "#182036", "#2a3a5f", "#42598a", "#5d78a8", "#7e99c2", "#a3b9d6", "#c9d8e8"];
const AURORA_RAMP = ["#050a24", "#0e1a4d", "#1d2f85", "#2f4bc0", "#4f6fe8", "#7d97ff", "#b3c4ff", "#eef2ff"];

// Categories whose light is the picture: on white they need ink, on
// aurora they need blue-violet — but only when the entry carries no
// palette of its own (an authored palette is a deliberate choice).
const GLOW_CATEGORIES = new Set(["arcane", "holy", "lightning", "scifi", "fire", "shadow"]);

export const PIXELFX_THEMES = ["black", "white", "aurora"];

let currentTheme = "black";

/** Set the theme pickFx shades for (App wires the shell theme here). */
export function setPixelfxTheme(theme) {
  currentTheme = PIXELFX_THEMES.includes(theme) ? theme : "black";
  return currentTheme;
}

export function pixelfxTheme() {
  return currentTheme;
}

const GOLD_THEMES = { white: { palette: DEEP_GOLD_RAMP }, aurora: { palette: VIOLET_RAMP } };

function themedPaletteFor(entry, fxId) {
  const override = entry.themes?.[currentTheme];
  if (override?.palette) return [...override.palette];
  if (entry.palette) return [...entry.palette];
  const category = fxId.split("/")[0];
  if (currentTheme === "white" && GLOW_CATEGORIES.has(category)) return [...INK_RAMP];
  if (currentTheme === "aurora" && GLOW_CATEGORIES.has(category)) return [...AURORA_RAMP];
  return undefined;
}

// Generation wait: a quiet loop ringing the waiting card's orb, keyed
// to the family of the book being written. `alt` lists runner-up
// candidates for later waves; pickFx always takes the primary.
const WAITING_BY_FAMILY = {
  xuanzhen: { fx: "arcane/rune-circle", palette: GOLD_RAMP, themes: GOLD_THEMES, seed: 7, alt: ["arcane/arcane-orb", "arcane/portal"] },
  wuxia: { fx: "water/ripples", seed: 3, alt: ["critters/butterfly", "holy/sunburst"] },
  chuanyue: { fx: "arcane/portal", seed: 5, alt: ["arcane/rune-circle", "spawn/spawn-portal"] },
  yanqing: { fx: "critters/butterfly", seed: 2, alt: ["holy/sunburst", "pickups/power-star"] },
  dushi: { fx: "water/rain-splash", seed: 4, alt: ["lightning/spark-arc", "scifi/hologram"] },
  yule: { fx: "pickups/power-star", seed: 6, alt: ["holy/sunburst", "critters/butterfly"] },
  lishi: { fx: "fire/campfire", seed: 8, alt: ["fire/brazier", "critters/butterfly"] },
  kehuan: { fx: "scifi/energy-core", seed: 9, alt: ["lightning/plasma-ball", "scifi/hologram"] },
  moshi: { fx: "shadow/shadow-flames", seed: 10, alt: ["fire/campfire", "shadow/necro-skulls"] },
  xuanyi: { fx: "critters/wisp", seed: 11, alt: ["critters/ghost", "shadow/necro-skulls"] },
  lingyi: { fx: "critters/ghost", seed: 12, alt: ["critters/wisp", "shadow/shadow-flames"] },
  fuben: { fx: "arcane/rune-circle", seed: 13, alt: ["arcane/portal", "scifi/teleporter-pad"] },
  dianjing: { fx: "scifi/hologram", seed: 14, alt: ["lightning/plasma-ball", "scifi/energy-core"] },
  junshi: { fx: "fire/brazier", seed: 15, alt: ["fire/campfire", "critters/butterfly"] },
  tiyu: { fx: "holy/sunburst", seed: 16, alt: ["pickups/power-star", "critters/butterfly"] },
  zhongtian: { fx: "weather/fireflies", seed: 17, alt: ["water/fountain", "critters/butterfly"] },
  duanpian: { fx: "arcane/arcane-orb", seed: 18, alt: ["critters/butterfly", "arcane/portal"] },
  fanpai: { fx: "shadow/void-orb", seed: 19, alt: ["shadow/shadow-flames", "shadow/black-hole"] },
};

const WAITING_DEFAULT = { fx: "water/water-orb", seed: 1, alt: ["arcane/arcane-orb", "critters/butterfly"] };

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
  xuanzhen: { fx: "arcane/mana-burst", palette: GOLD_RAMP, themes: GOLD_THEMES, grandFx: "holy/holy-pillar", seed: 31, alt: ["explosions/firework-burst", "arcane/star-fall"] },
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
  cultivation: { fx: "arcane/rune-circle", palette: GOLD_RAMP, themes: GOLD_THEMES, seed: 62, alt: ["arcane/arcane-orb"] },
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
const PLAZA_LIKE_DEFAULT = { fx: "pickups/collect-burst", seed: 80, alt: ["ui/coin-collect"] };

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

const DETAIL_AMBIENT_DEFAULT = { fx: "fire/spirit-flame", seed: 100, alt: ["critters/wisp", "water/fountain"] };

// ——— Wave 3 scenes (PIXELFX-WAVE3): the last three planned scenes ———

// Cover reveal: the moment a finished painting swaps into a cover
// frame (auto-paint landing, a manual re-roll, a meta adoption) — one
// short glint burst over the frame. Family-free: the painting itself
// already carries the family's flavour; the beat only says "new".
// (transitions/* wipes were considered and rejected again: they are
// 320x180 landscape wipes and would sit ON the picture, not over its
// frame.)
const COVER_REVEAL_DEFAULT = { fx: "pickups/collect-burst", seed: 110, alt: ["holy/feather-burst", "ui/quest-complete"] };

// Empty shelf: the profile shelf's empty state breathes very quietly
// behind its art and copy — a single butterfly drifting on
// transparency. (weather/fireflies was the first draft's pick and was
// rejected on inspection: its drawBack fills the whole 320x180 frame
// with a dark-green haze, which reads as a hard-edged box inside the
// light empty-state card, worst on the white theme.)
const EMPTY_SHELF_DEFAULT = { fx: "critters/butterfly", seed: 120, alt: ["holy/sunburst", "critters/wisp"] };

// Login welcome: sign-in / registration lands and the account sheet
// closes — one soft feather beat at the top of the app, gone before
// it can block anything. Family-free (no book is in hand yet).
const LOGIN_WELCOME_DEFAULT = { fx: "holy/feather-burst", seed: 130, alt: ["ui/quest-complete", "explosions/firework-burst"] };

// ——— Wave 4 scenes (PIXELFX-WAVE4): the small human moments ———
// Rating, collecting, redeeming, following: the reader did a small
// deliberate thing and it landed. Each is one fingertip-sized beat on
// the control that was used, family-free (the surface, not the book,
// owns the moment) except where a palette carries the meaning.

// Rating success: golden star-dust over the star picker — the house
// glint burst wearing the gold ramp (white theme deepens it via
// GOLD_THEMES, aurora violets it, exactly like the waiting circle).
const RATING_SUCCESS_DEFAULT = { fx: "pickups/collect-burst", palette: GOLD_RAMP, themes: GOLD_THEMES, seed: 140, alt: ["ui/coin-collect", "holy/feather-burst"] };

// Shelf collect: saving a book to the favourites shelf — one soft
// feather beat inside the collect button (the login welcome's effect,
// reused at button scale; the moment, not the pixels, is the point).
const SHELF_COLLECT_DEFAULT = { fx: "holy/feather-burst", seed: 150, alt: ["pickups/collect-burst"] };

// Redeem success: coins actually arriving — the coin-collect beat
// over the redeem note, quest-complete as the wider alternate.
const REDEEM_SUCCESS_DEFAULT = { fx: "ui/coin-collect", seed: 160, alt: ["ui/quest-complete", "pickups/collect-burst"] };

// Season finale: a book's finished state is presented on a shelf for
// the first time (the stamp/claim ledger lives in
// fx/finish-celebration.js — App stamps the moment a line flips to
// complete, whichever shelf surface presents it first claims it, and
// it never plays twice). These are the chapter-upgrade GRAND effects
// promoted to their own scene: same signatures, own seeds, because
// the moment differs — the upgrade beat fires when the final chapter
// OPENS; this one fires when the finished book is first SEEN done.
const SEASON_FINALE_BY_FAMILY = {
  xuanzhen: { fx: "holy/holy-pillar", seed: 171, alt: ["explosions/firework-burst", "arcane/star-fall"] },
  fuben: { fx: "holy/holy-pillar", seed: 172, alt: ["explosions/firework-burst", "arcane/star-fall"] },
  wuxia: { fx: "holy/smite", seed: 173, alt: ["holy/holy-pillar", "explosions/firework-burst"] },
  kehuan: { fx: "scifi/emp-blast", seed: 174, alt: ["explosions/firework-burst"] },
  dianjing: { fx: "scifi/emp-blast", seed: 175, alt: ["explosions/firework-burst"] },
  moshi: { fx: "shadow/dark-explosion", seed: 176, alt: ["explosions/implosion", "arcane/star-fall"] },
  lingyi: { fx: "shadow/dark-explosion", seed: 177, alt: ["arcane/star-fall"] },
  xuanyi: { fx: "arcane/star-fall", seed: 178, alt: ["shadow/dark-explosion"] },
  yanqing: { fx: "arcane/star-fall", seed: 179, alt: ["explosions/firework-burst"] },
};

const SEASON_FINALE_DEFAULT = { fx: "explosions/firework-burst", seed: 170, alt: ["holy/holy-pillar", "arcane/mana-burst"] };

// Search empty: a store / shelf search that found nothing keeps the
// same quiet company as the empty shelf — one butterfly drifting
// behind the art and copy, never a full-frame weather scene.
const SEARCH_EMPTY_DEFAULT = { fx: "critters/butterfly", seed: 180, alt: ["critters/wisp", "holy/sunburst"] };

// Follow success: the profile follow button earns a rose spark — the
// house glint burst in a rose ramp (deepened on white so it survives
// the light ground; on aurora's navy the native rose reads as-is).
// Unfollow stays silent, exactly like un-like.
const ROSE_RAMP = ["#170510", "#38091f", "#6e1238", "#a81f55", "#e04a86", "#ff8fb5", "#ffc7da", "#ffffff"];
const DEEP_ROSE_RAMP = ["#12030a", "#2b0716", "#4d0f27", "#701a3a", "#93284f", "#b03a64", "#c4527a", "#d4698f"];
const ROSE_THEMES = { white: { palette: DEEP_ROSE_RAMP } };

const FOLLOW_SUCCESS_DEFAULT = { fx: "pickups/collect-burst", palette: ROSE_RAMP, themes: ROSE_THEMES, seed: 190, alt: ["ui/coin-collect", "holy/feather-burst"] };

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
  "cover-reveal": { byFamily: {}, fallback: COVER_REVEAL_DEFAULT },
  "empty-shelf": { byFamily: {}, fallback: EMPTY_SHELF_DEFAULT },
  "login-welcome": { byFamily: {}, fallback: LOGIN_WELCOME_DEFAULT },
  "rating-success": { byFamily: {}, fallback: RATING_SUCCESS_DEFAULT },
  "shelf-collect": { byFamily: {}, fallback: SHELF_COLLECT_DEFAULT },
  "redeem-success": { byFamily: {}, fallback: REDEEM_SUCCESS_DEFAULT },
  "season-finale": { byFamily: SEASON_FINALE_BY_FAMILY, fallback: SEASON_FINALE_DEFAULT },
  "search-empty": { byFamily: {}, fallback: SEARCH_EMPTY_DEFAULT },
  "follow-success": { byFamily: {}, fallback: FOLLOW_SUCCESS_DEFAULT },
};

/**
 * The effect pick for a scene and genre family (shelf id). Returns a
 * fresh { fx, palette?, seed, alts, flashGuard? } the caller can hand
 * straight to PixelfxCanvas, or null for an unmapped scene. The palette is shaded
 * for the current shell theme (see setPixelfxTheme). `alts` is the
 * self-healing chain (PIXELFX-WAVE3): the entry's runner-up ids as
 * ready picks with the same seed and NO palette — if the primary
 * fails its health probe, the player retries the alternates with
 * their native ramps, so a broken palette can never poison the chain.
 * With { grand: true } the entry's finale variant (grandFx) wins when
 * the scene defines one (chapter-upgrade); every other scene ignores
 * the flag.
 */
export function pickFx(scene, genreFamily, { grand = false } = {}) {
  const table = TABLES[scene];
  if (!table) return null;
  const entry = table.byFamily[genreFamily] || table.fallback;
  const usedGrand = grand && Boolean(entry.grandFx);
  const fx = usedGrand ? entry.grandFx : entry.fx;
  const pick = { fx, seed: entry.seed, alts: [] };
  // PIXELFX-WAVE5 (§60): the grand bursts — a chapter-upgrade pick
  // that resolved to its grandFx, and every season-finale pick (that
  // scene is grand signatures end to end) — carry the flash guard:
  // PixelfxCanvas hands the flag to the player, which watches its own
  // output for strobing and softens the light layer before a harsh
  // frame can reach the reader.
  if (usedGrand || scene === PIXELFX_SCENE.SEASON_FINALE) pick.flashGuard = true;
  const palette = themedPaletteFor(entry, fx);
  if (palette) pick.palette = palette;
  const seen = new Set([fx]);
  for (const altId of entry.alt || []) {
    if (seen.has(altId)) continue;
    seen.add(altId);
    pick.alts.push({ fx: altId, seed: entry.seed });
  }
  // PIXELFX-WAVE6: the pick carries its scene so PixelfxCanvas can
  // attribute heal / death / tier-drop events in the persisted
  // health log (health.js) without every call site repeating it.
  pick.scene = scene;
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

// Scene backlog: empty since wave 3. Wave 1 landed waiting +
// intervene; wave 2 landed chapter-upgrade, merge-success (the wave-1
// note called it "merge-encounter"), avatar-reveal, forge-ambient
// (+ forge-open), plaza-like + publish-celebration, detail-ambient;
// wave 3 landed the last three — cover-reveal, empty-shelf,
// login-welcome. Wave 4 added the small-moment scenes —
// rating-success, shelf-collect, redeem-success, season-finale,
// search-empty, follow-success. Every scene in PIXELFX_SCENE is wired.
export const PLANNED_SCENES = [];
