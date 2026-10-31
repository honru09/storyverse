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
// - since PIXELFX-WAVE5 the registry also keeps the adaptive-quality
//   memory: slow heals per session (which eventually lower every new
//   mount's starting rung — pixelfxSessionTierPenalty) and the count
//   of in-place tier drops (recordPixelfxTierDrop).
// - since PIXELFX-WAVE6 every heal / death / tier-drop is also
//   appended to a persisted ring buffer in localStorage (see the
//   event-log section at the bottom): the in-memory table resets
//   with the page, but the field record of what the self-healing
//   actually did on readers' phones must survive an app restart so
//   the settings page can summarise it and a bad week leaves a
//   trace. Storage is best-effort: a denied or full localStorage
//   degrades the log to session memory and can never throw.
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
  return {
    mounts: 0,
    heals: 0,
    deaths: 0,
    // PIXELFX-WAVE5: adaptive-quality bookkeeping. sessionSlowHeals
    // counts this session's slow-driven chain swaps; tierDrops counts
    // the in-place quality drops the adaptive controller made instead.
    sessionSlowHeals: 0,
    tierDrops: 0,
    byFx: {},
    updatedAt: null,
  };
}

let health = freshHealth();

function fxBucket(id) {
  if (!health.byFx[id]) {
    health.byFx[id] = { mounts: 0, ok: 0, blank: 0, slow: 0, error: 0, healed: 0, dead: 0, tierDrops: 0 };
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

export function recordPixelfxHeal(fromId, toId, reason, scene = null) {
  health.heals += 1;
  if (reason === "slow") health.sessionSlowHeals += 1;
  const bucket = fxBucket(fromId);
  if (reason === "blank" || reason === "slow" || reason === "error") bucket[reason] += 1;
  bucket.healed += 1;
  publishPixelfxHealth();
  appendPixelfxHealthLog({ fx: fromId, scene, type: "heal", result: `${reason} → ${toId}` });
}

/** Slow heals so far this session (the adaptive-quality memory). */
export function pixelfxSessionSlowHeals() {
  return health.sessionSlowHeals;
}

/**
 * Session tier penalty (PIXELFX-WAVE5): once this session has healed
 * PIXELFX_SESSION_SLOW_HEAL_THRESHOLD effects for slowness, the device
 * has told us plainly it cannot hold the authored rate — every later
 * mount starts one ladder rung below its base instead of re-learning
 * the same lesson per effect.
 */
export const PIXELFX_SESSION_SLOW_HEAL_THRESHOLD = 3;

export function pixelfxSessionTierPenalty() {
  return health.sessionSlowHeals >= PIXELFX_SESSION_SLOW_HEAL_THRESHOLD ? 1 : 0;
}

/** Record an adaptive quality drop (player-core's ladder, one rung). */
export function recordPixelfxTierDrop(fxId, fromIndex, toIndex, scene = null) {
  health.tierDrops += 1;
  fxBucket(fxId).tierDrops += 1;
  publishPixelfxHealth();
  appendPixelfxHealthLog({ fx: fxId, scene, type: "tier-drop", result: `${fromIndex} → ${toIndex}` });
}

export function recordPixelfxDeath(fxId, reason, scene = null) {
  health.deaths += 1;
  const bucket = fxBucket(fxId);
  if (reason === "blank" || reason === "slow" || reason === "error") bucket[reason] += 1;
  bucket.dead += 1;
  publishPixelfxHealth();
  appendPixelfxHealthLog({ fx: fxId, scene, type: "death", result: reason });
}

// ——— Persisted event log (PIXELFX-WAVE6) ———
//
// A ring of the last PIXELFX_HEALTH_LOG_LIMIT heal / death /
// tier-drop events, each { at, fx, scene, type, result }, kept in
// localStorage so the record survives an app restart. Reads go back
// to storage every time (the buffer is tiny and events are rare), so
// what the settings page summarises is always what is actually on
// disk. Without a usable localStorage (node tests, privacy modes)
// the log degrades to a session-memory ring of the same shape.

export const PIXELFX_HEALTH_LOG_KEY = "storyweave:pixelfx-health-log";
export const PIXELFX_HEALTH_LOG_LIMIT = 100;

const HEALTH_LOG_TYPES = new Set(["heal", "death", "tier-drop"]);
let memoryHealthLog = [];
// Latched the first time storage misbehaves at the METHOD level:
// a localStorage object can exist while getItem/setItem throw
// (zero-quota private modes, a full origin). From then on the log
// lives in the session-memory ring, as §60 promises — the mirror is
// kept current on every append so the latch loses no history.
let storageDegraded = false;

function healthLogStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isHealthLogEntry(entry) {
  return Boolean(
    entry &&
      typeof entry.at === "string" &&
      typeof entry.fx === "string" &&
      HEALTH_LOG_TYPES.has(entry.type),
  );
}

function readPixelfxHealthLog() {
  const store = healthLogStorage();
  if (!store || storageDegraded) return memoryHealthLog;
  try {
    const raw = store.getItem(PIXELFX_HEALTH_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHealthLogEntry).slice(-PIXELFX_HEALTH_LOG_LIMIT);
  } catch {
    storageDegraded = true;
    return memoryHealthLog;
  }
}

function appendPixelfxHealthLog({ fx, scene, type, result }) {
  const entry = {
    at: new Date().toISOString(),
    fx,
    scene: scene ?? null,
    type,
    result: result ?? null,
  };
  const log = [...readPixelfxHealthLog(), entry].slice(-PIXELFX_HEALTH_LOG_LIMIT);
  memoryHealthLog = log;
  const store = healthLogStorage();
  if (!store || storageDegraded) return;
  try {
    store.setItem(PIXELFX_HEALTH_LOG_KEY, JSON.stringify(log));
  } catch {
    storageDegraded = true;
  }
}

/** The persisted heal / death / tier-drop events, oldest first. */
export function pixelfxHealthLog() {
  return [...readPixelfxHealthLog()];
}

/** Aggregate over the persisted log, for the settings summary line. */
export function pixelfxHealthLogSummary() {
  const log = readPixelfxHealthLog();
  const summary = { events: log.length, heals: 0, deaths: 0, tierDrops: 0, anomalies: 0 };
  for (const entry of log) {
    if (entry.type === "heal") summary.heals += 1;
    else if (entry.type === "death") summary.deaths += 1;
    else if (entry.type === "tier-drop") summary.tierDrops += 1;
  }
  summary.anomalies = summary.deaths;
  return summary;
}

/** Clear the persisted log (tests; the settings surface never does). */
export function resetPixelfxHealthLog() {
  memoryHealthLog = [];
  storageDegraded = false;
  try {
    healthLogStorage()?.removeItem(PIXELFX_HEALTH_LOG_KEY);
  } catch {
    /* ignore */
  }
}
