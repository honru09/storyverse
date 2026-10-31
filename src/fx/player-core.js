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
 * A steppable player for one effect module.
 * options: { seed, palette, light, repeat }
 * - repeat: when a one-shot finishes, respawn it (loop-feel for effects
 *   whose meta is not itself a loop). Looping effects loop natively.
 * step(dtSeconds, target?) advances, draws, composites into target (or an
 * internal buffer) and returns that Uint8ClampedArray (w*h*4 RGBA).
 */
export function createPixelfxPlayer(mod, { seed, palette, light, repeat = false } = {}) {
  const meta = mod?.meta ?? {};
  const [w, h] = meta.size ?? [96, 96];
  const [ox, oy] = meta.origin ?? [Math.floor(w / 2), Math.floor(h / 2)];
  const frame = createFrame(w, h);
  const buffer = new Uint8ClampedArray(w * h * 4);
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
    step(dt, target) {
      if (repeat && fx.done()) spawn();
      fx.update(dt);
      clearFrame(frame);
      fx.draw(frame);
      const out = target ?? buffer;
      composite(frame, out, null);
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
