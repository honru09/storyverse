// Self-healing core for pixelfx (PIXELFX-WAVE3, DESIGN.md §60).
//
// The vendored library is code, and code can fail at runtime in ways
// the build-time tests cannot see on a phone: an effect that throws
// on a specific palette, paints nothing on a specific seed, or steps
// so slowly it would jank the surface it decorates. This module is
// the DOM-free half of the defence:
//
// - probePixelfxModule steps a fresh player and renders a verdict —
//   'blank' (no non-transparent pixel in any sampled frame), 'slow'
//   (median step over the frame budget), 'error' (threw), or ok.
// - pixelfxChain flattens a placements pick ({ fx, alts }) into the
//   ordered candidate list the canvas walks when a probe fails: the
//   primary first, then at most PIXELFX_MAX_HEALS alternates.
// - a module-level health registry counts mounts / heals / deaths per
//   effect and mirrors itself to window.__pixelfxHealth (when a
//   window exists) for field diagnosis. PixelfxCanvas.jsx owns the
//   live-loop half (sampling real rAF steps); everything here is
//   plain data + player-core, so node tests drive it directly.
//
// Discipline: healing is capped (PIXELFX_MAX_HEALS swaps per mount),
// exhausting the chain removes the layer silently, and nothing in
// this module can throw into a host surface.

import { createPixelfxPlayer } from "./player-core.js";

/** Frames stepped for a probe verdict (~1.5s at the authored rate). */
export const PIXELFX_PROBE_STEPS = 45;
/** A frame is painted if it holds at least one non-transparent px. */
export const PIXELFX_BLANK_PIXEL_FLOOR = 0;
/** Median per-step budget; the heaviest measured catalog effect
 *  (full-frame weather) steps in ~12ms, compact effects in 1–5ms. */
export const PIXELFX_SLOW_STEP_MS = 24;
/** Alternate swaps allowed per mount before the layer gives up. */
export const PIXELFX_MAX_HEALS = 2;

export function countNonTransparent(data) {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Verdict for one effect module under one set of player options.
 * Never throws: any failure becomes { ok: false, reason: 'error' }.
 * Returns { ok, reason?, maxPixels, medianStepMs, error? } where
 * maxPixels is the largest non-transparent count across the sampled
 * frames (every 5th step and the last).
 */
export function probePixelfxModule(mod, options = {}, { steps = PIXELFX_PROBE_STEPS } = {}) {
  let player;
  try {
    player = createPixelfxPlayer(mod, options);
  } catch (error) {
    return { ok: false, reason: "error", maxPixels: 0, medianStepMs: 0, error };
  }
  const durations = [];
  let maxPixels = 0;
  try {
    for (let i = 0; i < steps; i++) {
      const started = performance.now();
      const data = player.step(1 / 30);
      durations.push(performance.now() - started);
      if (i % 5 === 4 || i === steps - 1) {
        maxPixels = Math.max(maxPixels, countNonTransparent(data));
      }
      if (player.done) break;
    }
  } catch (error) {
    return { ok: false, reason: "error", maxPixels, medianStepMs: median(durations), error };
  }
  const medianStepMs = median(durations);
  if (maxPixels <= PIXELFX_BLANK_PIXEL_FLOOR) {
    return { ok: false, reason: "blank", maxPixels, medianStepMs };
  }
  if (medianStepMs > PIXELFX_SLOW_STEP_MS) {
    return { ok: false, reason: "slow", maxPixels, medianStepMs };
  }
  return { ok: true, maxPixels, medianStepMs };
}

/**
 * Judge live step samples collected by the canvas during real play:
 * the same thresholds as the module probe, over caller-kept books
 * { durations: number[], maxPixels: number }.
 */
export function judgeLiveSamples({ durations, maxPixels }) {
  if (maxPixels <= PIXELFX_BLANK_PIXEL_FLOOR) return { ok: false, reason: "blank" };
  const medianStepMs = median(durations);
  if (medianStepMs > PIXELFX_SLOW_STEP_MS) return { ok: false, reason: "slow", medianStepMs };
  return { ok: true, medianStepMs };
}

/**
 * The ordered candidates for one mount: the pick itself, then its
 * alternates, deduplicated by effect id and capped at
 * 1 + PIXELFX_MAX_HEALS entries.
 */
export function pixelfxChain(pick) {
  if (!pick?.fx) return [];
  const chain = [];
  const seen = new Set();
  const push = (candidate) => {
    if (!candidate?.fx || seen.has(candidate.fx)) return;
    seen.add(candidate.fx);
    const entry = { fx: candidate.fx, seed: candidate.seed };
    if (candidate.palette) entry.palette = candidate.palette;
    chain.push(entry);
  };
  push(pick);
  for (const alt of pick.alts || []) push(alt);
  return chain.slice(0, 1 + PIXELFX_MAX_HEALS);
}

// ——— Health registry (in-memory, mirrored to window.__pixelfxHealth)

function freshHealth() {
  return { mounts: 0, heals: 0, deaths: 0, byFx: {}, updatedAt: null };
}

let health = freshHealth();

function fxBucket(id) {
  if (!health.byFx[id]) {
    health.byFx[id] = { mounts: 0, ok: 0, blank: 0, slow: 0, error: 0, healed: 0, dead: 0 };
  }
  return health.byFx[id];
}

function publishPixelfxHealth() {
  health.updatedAt = new Date().toISOString();
  if (typeof window !== "undefined") {
    try {
      window.__pixelfxHealth = pixelfxHealthSnapshot();
    } catch {
      /* a read-only window proxy must never break a surface */
    }
  }
}

export function pixelfxHealthSnapshot() {
  return JSON.parse(JSON.stringify(health));
}

export function resetPixelfxHealth() {
  health = freshHealth();
  publishPixelfxHealth();
}

export function recordPixelfxMount(fxId) {
  health.mounts += 1;
  fxBucket(fxId).mounts += 1;
  publishPixelfxHealth();
}

export function recordPixelfxOk(fxId) {
  fxBucket(fxId).ok += 1;
  publishPixelfxHealth();
}

export function recordPixelfxHeal(fromId, toId, reason) {
  health.heals += 1;
  const bucket = fxBucket(fromId);
  if (reason === "blank" || reason === "slow" || reason === "error") bucket[reason] += 1;
  bucket.healed += 1;
  publishPixelfxHealth();
}

export function recordPixelfxDeath(fxId, reason) {
  health.deaths += 1;
  const bucket = fxBucket(fxId);
  if (reason === "blank" || reason === "slow" || reason === "error") bucket[reason] += 1;
  bucket.dead += 1;
  publishPixelfxHealth();
}
