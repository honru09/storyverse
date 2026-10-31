// The DOM-free heart of the pixelfx player: a live instance of one vendored
// effect, stepped by hand and composited into a plain RGBA buffer. Keeping
// this layer free of canvas/DOM lets the unit tests render real frames in
// node (tests/pixelfx-player.test.js) and keeps PixelfxCanvas.jsx a thin
// shell: buffers and timing here, pixels-to-screen there.
//
// Rendering model (the library's own): an effect draws into a small pixel
// frame at its native meta.size, composite() flattens colour+light over
// transparency, and the component scales the result up with
// image-rendering: pixelated. Internal buffers stay at the effect's native
// size — median 160px on the long edge across the catalog — never at
// display resolution.

import { createFrame, clearFrame, createFx, composite } from "./pixelfx/core/index.js";

/**
 * Cap on simultaneously *animated* instances. Pixel effects are cheap but
 * not free (each step is a full-frame draw + composite), and several
 * surfaces could stack them; past the cap, new players degrade to a
 * static frame instead of starting another rAF loop.
 */
export const MAX_LIVE_PIXELFX = 6;

const liveTokens = new Set();

export function acquireLiveSlot(token) {
  if (liveTokens.has(token)) return true;
  if (liveTokens.size >= MAX_LIVE_PIXELFX) return false;
  liveTokens.add(token);
  return true;
}

export function releaseLiveSlot(token) {
  liveTokens.delete(token);
}

export function livePixelfxCount() {
  return liveTokens.size;
}

/**
 * Quality tiers (PIXELFX-WAVE3). Full tier: the authored 30 steps/s
 * and the effect's native raster. Lite tier (MotionProvider's
 * is-lite-gpu verdict: deviceMemory ≤ 4 or hardwareConcurrency ≤ 4):
 * 20 steps/s — a third fewer full-frame draws per second, the step
 * being where the CPU actually goes — and the visible canvas's
 * backing store capped at 144px on the long edge (the internal pixel
 * frame stays native; only the final blit raster shrinks, which is
 * invisible at pixelated scaling on the small surfaces fx live on).
 */
export const PIXELFX_STEP_HZ = 30;
export const PIXELFX_LITE_STEP_HZ = 20;
export const PIXELFX_LITE_RASTER_CAP = 144;

/**
 * The adaptive quality ladder (PIXELFX-WAVE5). Index 0 is the authored
 * look; each rung down trades step rate and blit raster for CPU. A
 * device starts at its base rung — 0 for standard hardware, 2 for the
 * lite tier below (which is exactly the wave-3 lite verdict: 20 steps/s
 * + a 144px raster cap) — and the adaptive controller walks it down
 * under sustained step cost and back up, never above the base, when
 * the cost subsides. The internal pixel frame is never touched: only
 * the step rate and the final blit raster move.
 */
export const PIXELFX_TIER_LADDER = [
  { stepHz: 30, rasterCap: null },
  { stepHz: 24, rasterCap: 192 },
  { stepHz: 20, rasterCap: 144 },
  { stepHz: 16, rasterCap: 120 },
];

export function pixelfxBaseTierIndex(lite) {
  return lite ? 2 : 0;
}

export function pixelfxQualityTier(lite) {
  const tier = PIXELFX_TIER_LADDER[pixelfxBaseTierIndex(lite)];
  return { stepHz: tier.stepHz, rasterCap: tier.rasterCap };
}

/** Steps per adaptive evaluation window (one window ≈ 1s at 30 steps/s). */
export const PIXELFX_ADAPTIVE_WINDOW = 30;
/**
 * The controller judges LOAD — step CPU seconds divided by played
 * seconds over the window — never per-step milliseconds. Per-step
 * cost is the wrong signal twice over: a lower rung's benefit IS
 * fewer steps per second (invisible to a per-step median), and a
 * simulated effect runs MORE 120Hz substeps per step at a lower
 * rate, so its per-step cost RISES as the rung drops — a fixed ms
 * line would walk such an effect deterministically to `exhausted`.
 * A window eating more than this fraction of real time is bad.
 */
export const PIXELFX_ADAPTIVE_DROP_RATIO = 0.4;
/** A window eating less than this fraction of real time is good. */
export const PIXELFX_ADAPTIVE_RISE_RATIO = 0.12;
/** Consecutive bad windows before a drop (debounce: never seesaw). */
export const PIXELFX_ADAPTIVE_DROP_WINDOWS = 2;
/** Consecutive good windows before a rise (slower to trust recovery). */
export const PIXELFX_ADAPTIVE_RISE_WINDOWS = 4;

/**
 * The adaptive quality controller: pure bookkeeping over window
 * load ratios, so node tests drive it directly. observe(loadRatio)
 * returns { index, changed: 'drop' | 'rise' | null, exhausted } —
 * `exhausted` is true when a drop was due but the ladder is already
 * at its floor (the caller decides what that means: a looping mount
 * can hand the candidate to the slow-heal; a one-shot rides the
 * floor out).
 */
export function createAdaptiveQuality({ baseIndex = 0, startIndex = null } = {}) {
  const floor = PIXELFX_TIER_LADDER.length - 1;
  const clampIndex = (value) => Math.max(baseIndex, Math.min(floor, value));
  let index = clampIndex(startIndex ?? baseIndex);
  let bad = 0;
  let good = 0;
  return {
    get index() {
      return index;
    },
    get tier() {
      return PIXELFX_TIER_LADDER[index];
    },
    observe(loadRatio) {
      let changed = null;
      let exhausted = false;
      if (loadRatio > PIXELFX_ADAPTIVE_DROP_RATIO) {
        bad += 1;
        good = 0;
        if (bad >= PIXELFX_ADAPTIVE_DROP_WINDOWS) {
          bad = 0;
          if (index < floor) {
            index += 1;
            changed = "drop";
          } else {
            exhausted = true;
          }
        }
      } else if (loadRatio < PIXELFX_ADAPTIVE_RISE_RATIO) {
        good += 1;
        bad = 0;
        if (good >= PIXELFX_ADAPTIVE_RISE_WINDOWS && index > baseIndex) {
          good = 0;
          index -= 1;
          changed = "rise";
        }
      } else {
        bad = 0;
        good = 0;
      }
      return { index, changed, exhausted };
    },
  };
}

// ——— Flash guard (PIXELFX-WAVE5) ———
// Grand one-shot bursts (chapter-upgrade grand, season-finale) are the
// catalog's brightest moments: additive light stacked on opaque
// colour. A burst that strobes — large-area luminance swinging hard
// several times a second — is a photosensitivity hazard, so a guarded
// player watches its own composited output: a "swing" is a frame
// whose mean PREMULTIPLIED luminance jumps by at least
// PIXELFX_FLASH_MEAN_DELTA while at least PIXELFX_FLASH_AREA_FRACTION
// of its pixels jump by PIXELFX_FLASH_AREA_DELTA each. More than
// PIXELFX_FLASH_MAX_PER_SECOND swings inside a sliding second of
// played time escalates the softening ladder: the light layer's gain
// steps down (composite's lightK), and from the third rung the peak
// premultiplied luminance of the whole frame is clamped as well.
// Stats are measured on the final (post-softening) buffer, so a
// tamed burst stops escalating; the guard never touches colour
// content below the clamp.

/** Swings per played second tolerated before softening escalates. */
export const PIXELFX_FLASH_MAX_PER_SECOND = 3;
/** Mean-luminance jump (0–255) that counts as a swing. */
export const PIXELFX_FLASH_MEAN_DELTA = 24;
/** Per-pixel luminance jump that counts as "this pixel swung". */
export const PIXELFX_FLASH_AREA_DELTA = 64;
/** Fraction of pixels that must swing for the frame to count. */
export const PIXELFX_FLASH_AREA_FRACTION = 0.2;
/** Light-gain ladder, one entry per softening level. */
export const PIXELFX_FLASH_LIGHT_SCALES = [1, 0.6, 0.35, 0.2];
/** Peak-luminance clamp per softening level (255 = no clamp). */
export const PIXELFX_FLASH_CLAMPS = [255, 255, 208, 176];

const lumaOf = (data, i) => (data[i] * 54 + data[i + 1] * 183 + data[i + 2] * 19) >> 8;

/**
 * A pixel's PREMULTIPLIED luminance: its RGB weighted by its alpha.
 * This is the only honest brightness for a composited pixelfx frame —
 * composite() normalises a pure-light pixel's RGB by its alpha (the
 * light gain survives only in the alpha channel), so raw RGB luma is
 * blind to exactly the softening the guard applies, and counts a
 * faint translucent pixel as a full-strength flash. Premultiplied
 * luma is the light the pixel actually emits over a dark ground, and
 * it scales linearly with both the light gain and the clamp.
 */
const premulLumaOf = (data, i) => (lumaOf(data, i) * data[i + 3]) / 255;

/**
 * One pass over two consecutive composited frames: the mean
 * premultiplied luminance of `data` and how far it moved from `prev`
 * ({ mean, meanDelta, movedFraction } — meanDelta/movedFraction are
 * 0 without a previous frame). Pure; the self-check audit measures
 * raw bursts with the same math the live guard judges by.
 */
export function measureFrameFlash(data, prev) {
  const pixels = data.length / 4;
  let sum = 0;
  let moved = 0;
  let prevSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = premulLumaOf(data, i);
    sum += lum;
    if (prev) {
      const prevLum = premulLumaOf(prev, i);
      prevSum += prevLum;
      if (Math.abs(lum - prevLum) >= PIXELFX_FLASH_AREA_DELTA) moved += 1;
    }
  }
  const mean = pixels ? sum / pixels : 0;
  if (!prev) return { mean, meanDelta: 0, movedFraction: 0 };
  return {
    mean,
    meanDelta: Math.abs(mean - (pixels ? prevSum / pixels : 0)),
    movedFraction: pixels ? moved / pixels : 0,
  };
}

/** Is this frame-to-frame move a flash swing? (measureFrameFlash output) */
export function isFlashSwing(stats) {
  return (
    stats.meanDelta >= PIXELFX_FLASH_MEAN_DELTA &&
    stats.movedFraction >= PIXELFX_FLASH_AREA_FRACTION
  );
}

/**
 * The guard's bookkeeping: swing timestamps inside a sliding played-
 * second, and the softening level they have earned. observe(stats,
 * atSeconds) is fed the stats of the frame just produced; when the
 * swing rate breaches, the level steps up and the window restarts (a
 * fresh breach is required to escalate further).
 */
export function createFlashGuard() {
  let level = 0;
  let swings = [];
  return {
    get level() {
      return level;
    },
    get lightScale() {
      return PIXELFX_FLASH_LIGHT_SCALES[level];
    },
    get clamp() {
      return PIXELFX_FLASH_CLAMPS[level];
    },
    get softened() {
      return level > 0;
    },
    get swingsInWindow() {
      return swings.length;
    },
    observe(stats, atSeconds) {
      if (isFlashSwing(stats)) swings.push(atSeconds);
      swings = swings.filter((t) => atSeconds - t < 1);
      let escalated = false;
      if (
        swings.length > PIXELFX_FLASH_MAX_PER_SECOND &&
        level < PIXELFX_FLASH_LIGHT_SCALES.length - 1
      ) {
        level += 1;
        swings = [];
        escalated = true;
      }
      return {
        level,
        lightScale: this.lightScale,
        clamp: this.clamp,
        softened: this.softened,
        swingsInWindow: swings.length,
        escalated,
      };
    },
  };
}

/** Scale any pixel whose premultiplied luminance exceeds `ceiling` back to it. */
export function applyLuminanceClamp(data, ceiling) {
  if (ceiling >= 255) return data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const lum = premulLumaOf(data, i);
    if (lum > ceiling) {
      const k = ceiling / lum;
      data[i] = Math.round(data[i] * k);
      data[i + 1] = Math.round(data[i + 1] * k);
      data[i + 2] = Math.round(data[i + 2] * k);
    }
  }
  return data;
}

/**
 * A steppable player for one effect module.
 * options: { seed, palette, light, repeat, flashGuard }
 * - repeat: when a one-shot finishes, respawn it (loop-feel for effects
 *   whose meta is not itself a loop). Looping effects loop natively.
 * - flashGuard: watch the composited output for strobing and soften
 *   it (see createFlashGuard). The frame that trips the guard is
 *   re-composited at the new softening level before it is returned,
 *   so a tripping frame is never shown raw.
 * step(dtSeconds, target?) advances, draws, composites into target (or an
 * internal buffer) and returns that Uint8ClampedArray (w*h*4 RGBA).
 * The current guard state rides along as player.flash ({ enabled,
 * level, lightScale, clamp, softened, swingsInWindow }).
 */
export function createPixelfxPlayer(mod, { seed, palette, light, repeat = false, flashGuard = false } = {}) {
  const meta = mod?.meta ?? {};
  const [w, h] = meta.size ?? [96, 96];
  const [ox, oy] = meta.origin ?? [Math.floor(w / 2), Math.floor(h / 2)];
  const frame = createFrame(w, h);
  const buffer = new Uint8ClampedArray(w * h * 4);
  const guard = flashGuard ? createFlashGuard() : null;
  let prevFrame = null;
  let playedSeconds = 0;
  let fx = null;
  const spawn = () => {
    // Only set options the caller actually gave: createFx merges caller
    // options over the effect's meta defaults, and an explicit
    // `palette: undefined` would erase the effect's own ramp (found the
    // hard way — arcane/rune-circle draws with fit(o.palette) and died).
    const opts = { x: ox, y: oy };
    if (seed !== undefined) opts.seed = seed;
    if (palette !== undefined) opts.palette = palette;
    if (light !== undefined) opts.light = light;
    fx = createFx(mod, opts);
  };
  spawn();
  return {
    meta,
    width: w,
    height: h,
    get done() {
      return fx.done();
    },
    get flash() {
      if (!guard) return { enabled: false, level: 0, lightScale: 1, clamp: 255, softened: false, swingsInWindow: 0 };
      return {
        enabled: true,
        level: guard.level,
        lightScale: guard.lightScale,
        clamp: guard.clamp,
        softened: guard.softened,
        swingsInWindow: guard.swingsInWindow,
      };
    },
    step(dt, target) {
      if (repeat && fx.done()) spawn();
      fx.update(dt);
      clearFrame(frame);
      fx.draw(frame);
      const out = target ?? buffer;
      if (!guard) {
        composite(frame, out, null);
        return out;
      }
      playedSeconds += dt;
      composite(frame, out, null, guard.lightScale);
      if (guard.clamp < 255) applyLuminanceClamp(out, guard.clamp);
      const verdict = guard.observe(measureFrameFlash(out, prevFrame), playedSeconds);
      if (verdict.escalated) {
        // Re-composite THIS frame at the new level: the frame that
        // tripped the guard is never the frame the reader sees. The
        // softened frame is NOT observed again — it only becomes the
        // new prevFrame baseline, so the restarted window is not
        // pre-charged with the tripping frame's swing.
        composite(frame, out, null, guard.lightScale);
        if (guard.clamp < 255) applyLuminanceClamp(out, guard.clamp);
      }
      if (!prevFrame || prevFrame.length !== out.length) {
        prevFrame = new Uint8ClampedArray(out.length);
      }
      prevFrame.set(out);
      return out;
    },
  };
}

/**
 * One representative still of an effect, for the motion-off / reduced-
 * motion / over-cap path: advance in fixed 1/30s steps to a moment where
 * the effect is visibly itself (≈45% through a one-shot, 0.8s into a
 * loop), then return the composited frame.
 */
export function renderPixelfxStill(mod, options = {}) {
  const player = createPixelfxPlayer(mod, options);
  const duration = player.meta.duration ?? 1.6;
  const until = player.meta.loop ? 0.8 : Math.min(1.5, Math.max(0.3, duration * 0.45));
  const step = 1 / 30;
  let data = null;
  for (let t = 0; t < until; t += step) data = player.step(step);
  return { width: player.width, height: player.height, data };
}
