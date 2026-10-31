#!/usr/bin/env node
// PIXELFX-WAVE3 — pixelfx audit self-check (DESIGN.md §60).
//
// The runtime self-healing (src/fx/health.js) protects readers on
// their phones; this script is the offline half of the same idea: it
// walks EVERY pick the placements table can hand out — all scenes ×
// all genre families × all three shell themes (plus the forge's
// per-world chain and both chapter-upgrade grand variants) — renders
// real frames through the same player-core the browser uses, and
// asserts the three health laws:
//   1. the effect paints (non-transparent pixels in sampled frames);
//   2. its median step stays within the runtime budget
//      (PIXELFX_SLOW_STEP_MS — the same threshold the live probe
//      heals on);
//   3. loop discipline holds: ambient picks never report done,
//      one-shot picks finish within their authored duration + slack.
// Identical (fx, seed, palette) renders are de-duplicated, so the
// walk stays in the low hundreds of renders.
//
// Usage: npm run fx:selfcheck   (standalone on purpose — it is NOT
// part of `npm test`; the daily storyweave-daily-bughunt cron can
// call it after the test suite). Exit 0 + one summary line when the
// whole table is healthy; exit 1 with the anomaly list otherwise.

import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  pickFx,
  pickForgeAmbientFx,
  setPixelfxTheme,
  PIXELFX_SCENE,
  PIXELFX_THEMES,
  FORGE_AMBIENT_WORLDS,
} from "../src/fx/placements.js";
import { createPixelfxPlayer } from "../src/fx/player-core.js";
import { countNonTransparent, PIXELFX_SLOW_STEP_MS } from "../src/fx/health.js";

const FX_ROOT = fileURLToPath(new URL("../src/fx/pixelfx/fx/", import.meta.url));

const FAMILIES = [
  "xuanzhen", "wuxia", "chuanyue", "yanqing", "dushi", "yule", "lishi",
  "kehuan", "moshi", "xuanyi", "lingyi", "fuben", "dianjing", "junshi",
  "tiyu", "zhongtian", "duanpian", "fanpai", null,
];

const scenes = Object.values(PIXELFX_SCENE);

// Scene loop discipline: one-shot scenes must finish (their canvas
// leaves via onDone), ambient scenes must not (they loop in place).
// Alternates inherit the expectation of the scene they serve — since
// wave 3 they are the live healing chain, so they are audited too.
const ONE_SHOT_SCENES = new Set([
  PIXELFX_SCENE.INTERVENE, PIXELFX_SCENE.CHAPTER_UPGRADE,
  PIXELFX_SCENE.MERGE_SUCCESS, PIXELFX_SCENE.AVATAR_REVEAL,
  PIXELFX_SCENE.FORGE_OPEN, PIXELFX_SCENE.PLAZA_LIKE,
  PIXELFX_SCENE.PUBLISH_CELEBRATION, PIXELFX_SCENE.COVER_REVEAL,
  PIXELFX_SCENE.LOGIN_WELCOME,
]);

// Collect every pick with its provenance, de-duplicated by the
// render itself (fx + seed + palette): themes mostly re-shade, and
// re-rendering the identical frame set three times proves nothing.
const renders = new Map();
const addRender = (label, candidate, expect) => {
  if (!candidate?.fx) {
    renders.set(`missing:${label}`, { label, pick: null, expects: new Set() });
    return;
  }
  const key = `${candidate.fx}|${candidate.seed ?? ""}|${candidate.palette ? candidate.palette.join(",") : ""}`;
  if (!renders.has(key)) renders.set(key, { label, pick: candidate, expects: new Set() });
  renders.get(key).expects.add(expect);
};
const addPick = (label, pick, expect) => {
  addRender(label, pick, expect);
  // An ambient scene's alternates may legitimately be one-shots (the
  // player respawns them for loop-feel), so they are audited for
  // paint + budget only; a one-shot scene's alternates inherit the
  // finish-or-fail expectation in full.
  const altExpect = expect === "oneshot" ? "oneshot" : "any";
  for (const alt of pick?.alts || []) addRender(`${label} (alt)`, alt, altExpect);
};

for (const theme of PIXELFX_THEMES) {
  setPixelfxTheme(theme);
  for (const scene of scenes) {
    const expect = ONE_SHOT_SCENES.has(scene) ? "oneshot" : "loop";
    for (const family of FAMILIES) {
      addPick(`${scene}/${family ?? "default"}/${theme}`, pickFx(scene, family), expect);
      addPick(`${scene}/${family ?? "default"}/${theme}/grand`, pickFx(scene, family, { grand: true }), expect);
    }
  }
  for (const world of FORGE_AMBIENT_WORLDS) {
    for (const family of [null, "xuanzhen", "xuanyi"]) {
      addPick(`forge-world/${world}/${family ?? "default"}/${theme}`, pickForgeAmbientFx(world, family), "loop");
    }
  }
}
setPixelfxTheme("black");

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const moduleCache = new Map();
const loadModule = async (id) => {
  if (!moduleCache.has(id)) {
    moduleCache.set(id, await import(pathToFileURL(join(FX_ROOT, `${id}.js`)).href));
  }
  return moduleCache.get(id);
};

const anomalies = [];
let checked = 0;

for (const { label, pick, expects } of renders.values()) {
  if (!pick) {
    anomalies.push(`${label}: placements returned no pick`);
    continue;
  }
  let mod;
  try {
    mod = await loadModule(pick.fx);
  } catch (error) {
    anomalies.push(`${label} → ${pick.fx}: module failed to load (${error.message})`);
    continue;
  }
  const meta = mod.meta ?? {};
  const durationSteps = Math.ceil((meta.duration ?? 1.6) * 30) + 30;
  const stepCap = expects.has("oneshot")
    ? Math.min(600, Math.max(90, durationSteps))
    : 90;
  let player;
  try {
    player = createPixelfxPlayer(mod, { seed: pick.seed, palette: pick.palette });
  } catch (error) {
    anomalies.push(`${label} → ${pick.fx}: player construction threw (${error.message})`);
    continue;
  }
  const durations = [];
  let maxPixels = 0;
  let doneAt = -1;
  try {
    for (let i = 0; i < stepCap; i++) {
      const started = performance.now();
      const data = player.step(1 / 30);
      durations.push(performance.now() - started);
      if (i % 5 === 4 || i === stepCap - 1) {
        maxPixels = Math.max(maxPixels, countNonTransparent(data));
      }
      if (player.done) {
        doneAt = i;
        maxPixels = Math.max(maxPixels, countNonTransparent(data));
        break;
      }
    }
  } catch (error) {
    anomalies.push(`${label} → ${pick.fx}: step threw (${error.message})`);
    continue;
  }
  checked += 1;
  if (maxPixels <= 0) anomalies.push(`${label} → ${pick.fx}: blank (0 non-transparent px in sampled frames)`);
  const medianStep = median(durations);
  if (medianStep > PIXELFX_SLOW_STEP_MS) {
    anomalies.push(`${label} → ${pick.fx}: slow (median step ${medianStep.toFixed(1)}ms > ${PIXELFX_SLOW_STEP_MS}ms budget)`);
  }
  if (expects.has("loop") && !expects.has("oneshot") && doneAt >= 0) {
    anomalies.push(`${label} → ${pick.fx}: ambient pick reported done at step ${doneAt} (must loop)`);
  }
  if (expects.has("oneshot") && doneAt < 0) {
    anomalies.push(`${label} → ${pick.fx}: one-shot never finished within ${stepCap} steps (canvas would never leave)`);
  }
  if (expects.has("oneshot") && meta.loop) {
    anomalies.push(`${label} → ${pick.fx}: looping meta inside a one-shot scene (done() can never fire)`);
  }
}

if (anomalies.length) {
  console.error(`fx-selfcheck: ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} across ${checked} renders:`);
  for (const line of anomalies) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(
  `fx-selfcheck: OK — ${checked} unique renders across ${scenes.length} scenes × ${FAMILIES.length} families × ${PIXELFX_THEMES.length} themes all paint, step within ${PIXELFX_SLOW_STEP_MS}ms median, and hold loop discipline.`,
);
