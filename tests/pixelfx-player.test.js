// PIXELFX-WAVE1: the DOM-free player core renders real frames in node.
// These are the same code paths PixelfxCanvas.jsx drives in the browser
// (createPixelfxPlayer / renderPixelfxStill over the vendored core) —
// pixels are sampled from the composited RGBA buffer, so a silently
// blank effect fails here long before it can fail on a phone.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPixelfxPlayer,
  renderPixelfxStill,
  acquireLiveSlot,
  releaseLiveSlot,
  livePixelfxCount,
  MAX_LIVE_PIXELFX,
} from '../src/fx/player-core.js'
import { pickFx, pickForgeAmbientFx, PIXELFX_SCENE } from '../src/fx/placements.js'

const load = (id) => import(`../src/fx/pixelfx/fx/${id}.js`)

const nonTransparent = (data) => {
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++
  return n
}

test('player steps a looping effect into real pixels', async () => {
  const mod = await load('arcane/rune-circle')
  // No options at all: the effect's own meta defaults must survive
  // (an explicit undefined palette once erased the default ramp and
  // the effect died inside fit() — pinned here).
  const player = createPixelfxPlayer(mod, {})
  assert.equal(player.width, 136)
  assert.equal(player.height, 100)
  let data
  for (let i = 0; i < 30; i++) data = player.step(1 / 30)
  assert.equal(data.length, 136 * 100 * 4)
  assert.ok(nonTransparent(data) > 1000, `expected a drawn rune circle, got ${nonTransparent(data)} px`)
  assert.equal(player.done, false, 'a meta loop never reports done')
})

test('player honours the placements gold palette variant', async () => {
  const mod = await load('arcane/rune-circle')
  const pick = pickFx('waiting', 'xuanzhen')
  const player = createPixelfxPlayer(mod, { seed: pick.seed, palette: pick.palette })
  let data
  for (let i = 0; i < 30; i++) data = player.step(1 / 30)
  assert.ok(nonTransparent(data) > 1000)
})

test('one-shot reports done past its duration; repeat respawns it', async () => {
  const mod = await load('arcane/magic-circle-cast')
  const once = createPixelfxPlayer(mod, { seed: 20 })
  for (let i = 0; i < 200; i++) once.step(1 / 30)
  assert.equal(once.done, true)
  const looping = createPixelfxPlayer(mod, { seed: 20, repeat: true })
  for (let i = 0; i < 200; i++) looping.step(1 / 30)
  assert.equal(looping.done, false, 'repeat must have respawned the finished one-shot')
})

test('renderPixelfxStill paints a representative frame', async () => {
  const mod = await load('critters/wisp')
  const still = renderPixelfxStill(mod, { seed: 11 })
  assert.equal(still.width, 128)
  assert.equal(still.height, 104)
  assert.ok(nonTransparent(still.data) > 500, `wisp still too empty: ${nonTransparent(still.data)} px`)
})

test('every waiting primary renders pixels (the phone never waits on a blank)', async () => {
  const families = [
    'xuanzhen', 'wuxia', 'chuanyue', 'yanqing', 'dushi', 'yule', 'lishi',
    'kehuan', 'moshi', 'xuanyi', 'lingyi', 'fuben', 'dianjing', 'junshi',
    'tiyu', 'zhongtian', 'duanpian', 'fanpai', null,
  ]
  for (const family of families) {
    const pick = pickFx('waiting', family)
    const mod = await load(pick.fx)
    const still = renderPixelfxStill(mod, { seed: pick.seed, palette: pick.palette })
    assert.ok(
      nonTransparent(still.data) > 300,
      `${family ?? 'default'} → ${pick.fx} still nearly blank (${nonTransparent(still.data)} px)`,
    )
  }
})

test('wave-2 primaries render pixels (celebrations and ambience are never blank)', async () => {
  const picks = [
    ['chapter-upgrade small', pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, null)],
    ['chapter-upgrade grand', pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, null, { grand: true })],
    ['chapter-upgrade xuanzhen grand', pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, 'xuanzhen', { grand: true })],
    ['chapter-upgrade kehuan small', pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, 'kehuan')],
    ['chapter-upgrade xuanyi small', pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, 'xuanyi')],
    ['merge-success', pickFx(PIXELFX_SCENE.MERGE_SUCCESS, null)],
    ['avatar-reveal', pickFx(PIXELFX_SCENE.AVATAR_REVEAL, null)],
    ['forge-open', pickFx(PIXELFX_SCENE.FORGE_OPEN, null)],
    ['plaza-like', pickFx(PIXELFX_SCENE.PLAZA_LIKE, null)],
    ['publish-celebration', pickFx(PIXELFX_SCENE.PUBLISH_CELEBRATION, null)],
    ['detail-ambient default', pickFx(PIXELFX_SCENE.DETAIL_AMBIENT, null)],
    ['detail-ambient xuanyi', pickFx(PIXELFX_SCENE.DETAIL_AMBIENT, 'xuanyi')],
    ['detail-ambient moshi', pickFx(PIXELFX_SCENE.DETAIL_AMBIENT, 'moshi')],
    ['forge world mist', pickForgeAmbientFx('mist', null)],
    ['forge world cultivation', pickForgeAmbientFx('cultivation', null)],
    ['forge world neon', pickForgeAmbientFx('neon', null)],
    ['forge world city', pickForgeAmbientFx('city', null)],
    ['forge world court', pickForgeAmbientFx('court', null)],
    ['forge world frontier', pickForgeAmbientFx('frontier', null)],
  ]
  for (const [label, pick] of picks) {
    const mod = await load(pick.fx)
    const still = renderPixelfxStill(mod, { seed: pick.seed, palette: pick.palette })
    assert.ok(
      nonTransparent(still.data) > 200,
      `${label} → ${pick.fx} still nearly blank (${nonTransparent(still.data)} px)`,
    )
  }
})

test('wave-2 one-shot primaries actually finish (their canvases can leave)', async () => {
  const picks = [
    pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, null),
    pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, null, { grand: true }),
    pickFx(PIXELFX_SCENE.MERGE_SUCCESS, null),
    pickFx(PIXELFX_SCENE.AVATAR_REVEAL, null),
    pickFx(PIXELFX_SCENE.FORGE_OPEN, null),
    pickFx(PIXELFX_SCENE.PLAZA_LIKE, null),
    pickFx(PIXELFX_SCENE.PUBLISH_CELEBRATION, null),
  ]
  for (const pick of picks) {
    const mod = await load(pick.fx)
    const player = createPixelfxPlayer(mod, { seed: pick.seed, palette: pick.palette })
    for (let i = 0; i < 300 && !player.done; i++) player.step(1 / 30)
    assert.equal(player.done, true, `${pick.fx} must report done within 10s of steps`)
  }
})

test('live slot cap degrades past the limit and frees on release', () => {
  const tokens = []
  for (let i = 0; i < MAX_LIVE_PIXELFX; i++) {
    const token = { i }
    tokens.push(token)
    assert.equal(acquireLiveSlot(token), true)
  }
  assert.equal(acquireLiveSlot(tokens[0]), true, 're-acquiring a held slot is a no-op success')
  assert.equal(livePixelfxCount(), MAX_LIVE_PIXELFX)
  const extra = { extra: true }
  assert.equal(acquireLiveSlot(extra), false, 'past the cap, no new animated instance')
  releaseLiveSlot(tokens[0])
  assert.equal(acquireLiveSlot(extra), true, 'a freed slot can be taken again')
  for (const token of tokens) releaseLiveSlot(token)
  releaseLiveSlot(extra)
  assert.equal(livePixelfxCount(), 0)
})

test('wave-3 primaries render pixels and one-shots finish', async () => {
  const picks = [
    ['cover-reveal', pickFx(PIXELFX_SCENE.COVER_REVEAL, null)],
    ['empty-shelf', pickFx(PIXELFX_SCENE.EMPTY_SHELF, null)],
    ['login-welcome', pickFx(PIXELFX_SCENE.LOGIN_WELCOME, null)],
  ]
  for (const [label, pick] of picks) {
    const mod = await load(pick.fx)
    const still = renderPixelfxStill(mod, { seed: pick.seed, palette: pick.palette })
    assert.ok(nonTransparent(still.data) > 200, `${label} → ${pick.fx} still nearly blank (${nonTransparent(still.data)} px)`)
  }
  for (const scene of [PIXELFX_SCENE.COVER_REVEAL, PIXELFX_SCENE.LOGIN_WELCOME]) {
    const pick = pickFx(scene, null)
    const mod = await load(pick.fx)
    const player = createPixelfxPlayer(mod, { seed: pick.seed, palette: pick.palette })
    for (let i = 0; i < 300 && !player.done; i++) player.step(1 / 30)
    assert.equal(player.done, true, `${scene} → ${pick.fx} must report done within 10s of steps`)
  }
})

test('health probe: a real effect passes, blank / slow / throwing modules fail by name', async () => {
  const { probePixelfxModule } = await import('../src/fx/health.js')
  const wisp = await load('critters/wisp')
  const healthy = probePixelfxModule(wisp, { seed: 11 })
  assert.equal(healthy.ok, true, `wisp should probe healthy: ${JSON.stringify(healthy)}`)
  assert.ok(healthy.maxPixels > 300)

  // Blank: a well-shaped module whose draw paints nothing at all.
  const blankMod = { meta: { size: [32, 32], loop: true, duration: 1 }, draw() {} }
  const blank = probePixelfxModule(blankMod, {})
  assert.equal(blank.ok, false)
  assert.equal(blank.reason, 'blank')

  // Error: construction itself explodes.
  const errorMod = {
    meta: { size: [32, 32], duration: 1 },
    create() { throw new Error('boom') },
  }
  const errored = probePixelfxModule(errorMod, {})
  assert.equal(errored.ok, false)
  assert.equal(errored.reason, 'error')

  // Slow: every draw burns ~35ms of CPU, far over the 24ms budget.
  const slowMod = {
    meta: { size: [16, 16], loop: true, duration: 1 },
    draw(p) {
      const end = performance.now() + 35
      while (performance.now() < end) { /* burn */ }
      p.px(0, 0, 0xffffffff)
    },
  }
  const slow = probePixelfxModule(slowMod, {}, { steps: 9 })
  assert.equal(slow.ok, false)
  assert.equal(slow.reason, 'slow')
})

test('health chain + registry: capped, deduplicated, counted', async () => {
  const health = await import('../src/fx/health.js')
  const chain = health.pixelfxChain({
    fx: 'a/one', seed: 1,
    alts: [{ fx: 'b/two', seed: 1 }, { fx: 'a/one', seed: 1 }, { fx: 'c/three', seed: 1 }, { fx: 'd/four', seed: 1 }],
  })
  assert.deepEqual(chain.map((c) => c.fx), ['a/one', 'b/two', 'c/three'],
    'chain = primary + at most PIXELFX_MAX_HEALS alternates, deduplicated')
  assert.equal(health.PIXELFX_MAX_HEALS, 2)
  assert.deepEqual(health.pixelfxChain(null), [])
  assert.deepEqual(health.pixelfxChain({}), [])

  assert.deepEqual(health.judgeLiveSamples({ durations: [2, 3, 2], maxPixels: 0 }), { ok: false, reason: 'blank' })
  assert.equal(health.judgeLiveSamples({ durations: [40, 42, 41], maxPixels: 10 }).reason, 'slow')
  assert.equal(health.judgeLiveSamples({ durations: [2, 3, 2], maxPixels: 10 }).ok, true)

  health.resetPixelfxHealth()
  health.recordPixelfxMount('a/one')
  health.recordPixelfxMount('a/one')
  health.recordPixelfxHeal('a/one', 'b/two', 'blank')
  health.recordPixelfxOk('b/two')
  health.recordPixelfxDeath('c/three', 'slow')
  const snap = health.pixelfxHealthSnapshot()
  assert.equal(snap.mounts, 2)
  assert.equal(snap.heals, 1)
  assert.equal(snap.deaths, 1)
  assert.equal(snap.byFx['a/one'].blank, 1)
  assert.equal(snap.byFx['a/one'].healed, 1)
  assert.equal(snap.byFx['b/two'].ok, 1)
  assert.equal(snap.byFx['c/three'].dead, 1)
  health.resetPixelfxHealth()
})

test('quality tiers: lite steps slower and caps the raster, full is authored', async () => {
  const { pixelfxQualityTier, PIXELFX_STEP_HZ, PIXELFX_LITE_STEP_HZ, PIXELFX_LITE_RASTER_CAP } = await import('../src/fx/player-core.js')
  assert.deepEqual(pixelfxQualityTier(false), { stepHz: PIXELFX_STEP_HZ, rasterCap: null })
  assert.deepEqual(pixelfxQualityTier(true), { stepHz: PIXELFX_LITE_STEP_HZ, rasterCap: PIXELFX_LITE_RASTER_CAP })
  assert.ok(PIXELFX_LITE_STEP_HZ < PIXELFX_STEP_HZ)
})

test('prefetch is a silent no-op outside a browser', async () => {
  const { prefetchPixelfx, prefetchedPixelfxIds } = await import('../src/fx/prefetch.js')
  const warmed = await prefetchPixelfx(['critters/wisp', 'arcane/rune-circle'])
  assert.deepEqual(warmed, [])
  assert.deepEqual(prefetchedPixelfxIds(), [])
})

test('wave-5 adaptive quality: ladder shape and base rungs', async () => {
  const {
    PIXELFX_TIER_LADDER, pixelfxBaseTierIndex,
    PIXELFX_STEP_HZ, PIXELFX_LITE_STEP_HZ, PIXELFX_LITE_RASTER_CAP,
  } = await import('../src/fx/player-core.js')
  assert.equal(PIXELFX_TIER_LADDER.length, 4)
  assert.deepEqual(PIXELFX_TIER_LADDER[0], { stepHz: PIXELFX_STEP_HZ, rasterCap: null })
  // Rung 2 IS the wave-3 lite tier — the ladder extends it, never redefines it.
  assert.deepEqual(PIXELFX_TIER_LADDER[2], { stepHz: PIXELFX_LITE_STEP_HZ, rasterCap: PIXELFX_LITE_RASTER_CAP })
  assert.equal(pixelfxBaseTierIndex(false), 0)
  assert.equal(pixelfxBaseTierIndex(true), 2)
  for (let i = 1; i < PIXELFX_TIER_LADDER.length; i++) {
    assert.ok(PIXELFX_TIER_LADDER[i].stepHz < PIXELFX_TIER_LADDER[i - 1].stepHz, 'each rung steps slower')
  }
})

test('wave-5 adaptive quality: debounced drops, patient rises, floor exhaustion', async () => {
  const { createAdaptiveQuality, PIXELFX_ADAPTIVE_DROP_WINDOWS, PIXELFX_ADAPTIVE_RISE_WINDOWS } = await import('../src/fx/player-core.js')
  // The controller is fed LOAD RATIOS (step CPU s per played s):
  // 0.6 = bad window (> 0.4), 0.25 = middle zone, 0.05 = good (< 0.12).
  const feed = (controller, ratio, times) => {
    let verdict
    for (let i = 0; i < times; i++) verdict = controller.observe(ratio)
    return verdict
  }
  const c = createAdaptiveQuality({ baseIndex: 0 })
  assert.equal(c.index, 0)
  // One bad window is noise: no drop until the debounce fills.
  assert.equal(feed(c, 0.6, PIXELFX_ADAPTIVE_DROP_WINDOWS - 1).changed, null)
  assert.equal(c.index, 0)
  assert.equal(feed(c, 0.6, 1).changed, 'drop')
  assert.equal(c.index, 1)
  assert.equal(c.tier.stepHz, 24)
  // The middle zone resets the counters — bad, calm, bad never drops.
  feed(c, 0.6, PIXELFX_ADAPTIVE_DROP_WINDOWS - 1)
  feed(c, 0.25, 1)
  assert.equal(feed(c, 0.6, PIXELFX_ADAPTIVE_DROP_WINDOWS - 1).changed, null)
  assert.equal(c.index, 1)
  // Rises take more good windows than drops take bad ones.
  assert.equal(feed(c, 0.05, PIXELFX_ADAPTIVE_RISE_WINDOWS - 1).changed, null)
  assert.equal(feed(c, 0.05, 1).changed, 'rise')
  assert.equal(c.index, 0)
  // Never above the base rung, however calm it gets.
  feed(c, 0.05, PIXELFX_ADAPTIVE_RISE_WINDOWS * 2)
  assert.equal(c.index, 0)
  // startIndex is honoured but clamped into [base, floor].
  assert.equal(createAdaptiveQuality({ baseIndex: 0, startIndex: 3 }).index, 3)
  assert.equal(createAdaptiveQuality({ baseIndex: 2, startIndex: 0 }).index, 2)
  // At the floor a due drop reports exhaustion instead of changing.
  const floored = createAdaptiveQuality({ baseIndex: 2, startIndex: 3 })
  assert.equal(feed(floored, 0.6, PIXELFX_ADAPTIVE_DROP_WINDOWS).exhausted, true)
  assert.equal(floored.index, 3)
})

test('wave-5 health: slow heals earn the session tier penalty; drops are counted', async () => {
  const health = await import('../src/fx/health.js')
  health.resetPixelfxHealth()
  health.recordPixelfxHeal('a/one', 'b/two', 'blank')
  health.recordPixelfxHeal('a/one', 'b/two', 'slow')
  health.recordPixelfxHeal('c/three', 'd/four', 'slow')
  assert.equal(health.pixelfxSessionSlowHeals(), 2, 'only slow heals count toward the penalty')
  assert.equal(health.pixelfxSessionTierPenalty(), 0)
  health.recordPixelfxHeal('e/five', 'f/six', 'slow')
  assert.equal(health.pixelfxSessionSlowHeals(), 3)
  assert.equal(health.pixelfxSessionTierPenalty(), 1)
  health.recordPixelfxTierDrop('a/one', 0, 1)
  health.recordPixelfxTierDrop('a/one', 1, 2)
  const snap = health.pixelfxHealthSnapshot()
  assert.equal(snap.tierDrops, 2)
  assert.equal(snap.sessionSlowHeals, 3)
  assert.equal(snap.byFx['a/one'].tierDrops, 2)
  health.resetPixelfxHealth()
  assert.equal(health.pixelfxSessionTierPenalty(), 0)
})

test('wave-5 placements: only the grand bursts carry the flash guard', () => {
  assert.equal(pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, 'xuanzhen', { grand: true }).flashGuard, true)
  assert.equal(pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, null, { grand: true }).flashGuard, true)
  assert.equal(pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, 'xuanzhen').flashGuard, undefined, 'the small beat is unguarded')
  assert.equal(pickFx(PIXELFX_SCENE.SEASON_FINALE, 'wuxia').flashGuard, true)
  assert.equal(pickFx(PIXELFX_SCENE.SEASON_FINALE, null).flashGuard, true)
  assert.equal(pickFx(PIXELFX_SCENE.WAITING, 'xuanzhen').flashGuard, undefined)
  assert.equal(pickFx(PIXELFX_SCENE.MERGE_SUCCESS, null).flashGuard, undefined)
})

test('wave-5 flash math: a full-field strobe is a swing, a gentle fade is not', async () => {
  const { measureFrameFlash, isFlashSwing, applyLuminanceClamp } = await import('../src/fx/player-core.js')
  const frame = (v) => {
    const data = new Uint8ClampedArray(8 * 8 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
    }
    return data
  }
  const strobe = measureFrameFlash(frame(255), frame(0))
  assert.equal(Math.round(strobe.meanDelta), 255)
  assert.equal(strobe.movedFraction, 1)
  assert.equal(isFlashSwing(strobe), true)
  const gentle = measureFrameFlash(frame(110), frame(100))
  assert.equal(isFlashSwing(gentle), false, 'a 10-level drift is not a flash')
  const local = measureFrameFlash(frame(255), frame(0))
  assert.ok(local.movedFraction > 0)
  // Luminance is PREMULTIPLIED: a translucent white pixel emits only
  // its alpha's worth of light. Raw-RGB luma would call the a=51
  // frame full-strength — the exact blindness that made the guard's
  // light-gain ladder unmeasurable on pure-light pixels.
  const translucent = (a) => {
    const data = frame(255)
    for (let i = 0; i < data.length; i += 4) data[i + 3] = a
    return data
  }
  assert.ok(Math.abs(measureFrameFlash(translucent(51)).mean - 51) < 1, 'a=51 white measures as 51, not 255')
  assert.equal(isFlashSwing(measureFrameFlash(translucent(255), translucent(230))), false,
    'a small alpha step of the same colour is not a flash')
  // The clamp works in premultiplied terms too: rgb255/a128 (premul
  // 128) under a ceiling of 64 halves the RGB, alpha untouched.
  const hot = frame(255)
  applyLuminanceClamp(hot, 128)
  assert.ok(hot[0] <= 129 && hot[3] === 255, `clamped pixel ${hot[0]}`)
  const glow = translucent(128)
  applyLuminanceClamp(glow, 64)
  assert.ok(Math.abs(glow[0] - 128) <= 1 && glow[3] === 128, `premul-clamped pixel ${glow[0]}/a${glow[3]}`)
  const untouched = frame(90)
  applyLuminanceClamp(untouched, 255)
  assert.equal(untouched[0], 90, 'ceiling 255 is a no-op')
})

test('wave-5 flash guard: a pure-light strobe is tamed through its alpha', async () => {
  const { createPixelfxPlayer, measureFrameFlash } = await import('../src/fx/player-core.js')
  // NO colour at all — light only, at half gain. composite()
  // normalises the RGB to 255 and carries the brightness in the
  // alpha (≈128 on, 0 off), so a raw-RGB meter sees an untameable
  // 255↔0 strobe while the emitted light is really 128↔0 — and the
  // guard's gain ladder acts on exactly that alpha.
  const pureLight = {
    meta: { size: [16, 16], duration: 3 },
    draw(p, t) {
      const on = Math.floor(t * 8) % 2 === 0
      p.shade(-16, -16, 16, 16, (x, y, o) => { if (on) { o.l = 0xffffff; o.k = 0.5 } })
    },
  }
  const raw = createPixelfxPlayer(pureLight, {})
  const guarded = createPixelfxPlayer(pureLight, { flashGuard: true })
  let rawPeak = 0
  let guardedLatePeak = 0
  for (let i = 0; i < 90; i++) {
    rawPeak = Math.max(rawPeak, measureFrameFlash(raw.step(1 / 30)).mean)
    const mean = measureFrameFlash(guarded.step(1 / 30)).mean
    if (i >= 60) guardedLatePeak = Math.max(guardedLatePeak, mean)
  }
  assert.ok(rawPeak > 100 && rawPeak < 160, `raw pure-light peak should be ≈128 (alpha-carried), got ${rawPeak}`)
  assert.equal(guarded.flash.softened, true, 'the pure-light strobe must trip the guard')
  assert.ok(guardedLatePeak < rawPeak - 40, `guarded late peak ${guardedLatePeak} should sit well under raw ${rawPeak}`)
})

test('wave-5 flash guard: a light strobe is softened in play; a calm effect never is', async () => {
  const { createFlashGuard, PIXELFX_FLASH_LIGHT_SCALES } = await import('../src/fx/player-core.js')
  // The guard escalates one level per fresh breach and restarts its window.
  const guard = createFlashGuard()
  const swing = { meanDelta: 200, movedFraction: 1 }
  let verdict
  for (let i = 0; i < 4; i++) verdict = guard.observe(swing, 0.1 * (i + 1))
  assert.equal(verdict.escalated, true)
  assert.equal(guard.level, 1)
  assert.equal(guard.lightScale, PIXELFX_FLASH_LIGHT_SCALES[1])
  assert.equal(guard.swingsInWindow, 0, 'escalation restarts the window')

  // A synthetic light strobe: opaque black colour, full-field white
  // light toggling at 4Hz — its flash lives entirely in the light
  // layer, which is exactly what the guard's gain ladder tames.
  const strobeMod = {
    meta: { size: [16, 16], duration: 3 },
    draw(p, t) {
      const on = Math.floor(t * 8) % 2 === 0
      p.shade(-16, -16, 16, 16, (x, y, o) => {
        o.c = 0xff000000
        if (on) { o.l = 0xffffff; o.k = 1 }
      })
    },
  }
  const raw = createPixelfxPlayer(strobeMod, {})
  const guarded = createPixelfxPlayer(strobeMod, { flashGuard: true })
  const meanOf = (data) => {
    let sum = 0
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3
    return sum / (data.length / 4)
  }
  let rawPeak = 0
  let guardedLatePeak = 0
  for (let i = 0; i < 90; i++) {
    rawPeak = Math.max(rawPeak, meanOf(raw.step(1 / 30)))
    const mean = meanOf(guarded.step(1 / 30))
    // Only the tail counts: the guard needs its first breach before
    // it can soften anything, so early frames legitimately run raw.
    if (i >= 60) guardedLatePeak = Math.max(guardedLatePeak, mean)
  }
  assert.ok(rawPeak > 250, `raw strobe should hit full brightness, got ${rawPeak}`)
  assert.equal(raw.flash.enabled, false)
  assert.equal(guarded.flash.softened, true, 'the strobe must trip the guard')
  assert.ok(guarded.flash.lightScale < 1, `light gain stepped down to ${guarded.flash.lightScale}`)
  assert.ok(guardedLatePeak < rawPeak - 40, `guarded late peak ${guardedLatePeak} should sit well under raw ${rawPeak}`)

  // A calm ambient effect under the guard stays at full gain.
  const wisp = await load('critters/wisp')
  const calm = createPixelfxPlayer(wisp, { seed: 11, flashGuard: true })
  for (let i = 0; i < 90; i++) calm.step(1 / 30)
  assert.equal(calm.flash.softened, false)
  assert.equal(calm.flash.lightScale, 1)
})

// ——— PIXELFX-WAVE6: persisted health log, scene stamps, keyframes ———

function stubLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
  }
  return map
}

test('health log: heal / death / tier-drop persist with scene attribution', async () => {
  const health = await import('../src/fx/health.js')
  const map = stubLocalStorage()
  try {
    health.resetPixelfxHealthLog()
    health.recordPixelfxHeal('a/one', 'b/two', 'slow', 'waiting')
    health.recordPixelfxDeath('c/three', 'blank', 'intervene')
    health.recordPixelfxTierDrop('d/four', 0, 1, 'waiting')
    const log = health.pixelfxHealthLog()
    assert.equal(log.length, 3)
    assert.deepEqual(
      log.map(({ fx, scene, type, result }) => ({ fx, scene, type, result })),
      [
        { fx: 'a/one', scene: 'waiting', type: 'heal', result: 'slow → b/two' },
        { fx: 'c/three', scene: 'intervene', type: 'death', result: 'blank' },
        { fx: 'd/four', scene: 'waiting', type: 'tier-drop', result: '0 → 1' },
      ],
    )
    assert.ok(log.every((entry) => typeof entry.at === 'string' && !Number.isNaN(Date.parse(entry.at))))
    // The record lives in storage itself, not in module memory: a
    // cold read (what an app restart sees) returns the same events.
    const raw = JSON.parse(map.get(health.PIXELFX_HEALTH_LOG_KEY))
    assert.equal(raw.length, 3)
    assert.equal(raw[0].fx, 'a/one')
    assert.deepEqual(health.pixelfxHealthLogSummary(), {
      events: 3, heals: 1, deaths: 1, tierDrops: 1, anomalies: 1,
    })
    // Events without a scene still record, stamped null.
    health.recordPixelfxDeath('e/five', 'error')
    assert.equal(health.pixelfxHealthLog().at(-1).scene, null)
    health.resetPixelfxHealthLog()
    assert.equal(health.pixelfxHealthLog().length, 0)
    assert.equal(map.has(health.PIXELFX_HEALTH_LOG_KEY), false)
  } finally {
    delete globalThis.localStorage
    health.resetPixelfxHealthLog()
  }
})

test('health log: the ring caps at the limit and drops the oldest', async () => {
  const health = await import('../src/fx/health.js')
  stubLocalStorage()
  try {
    health.resetPixelfxHealthLog()
    const total = health.PIXELFX_HEALTH_LOG_LIMIT + 5
    for (let i = 0; i < total; i++) health.recordPixelfxHeal(`fx/${i}`, 'b/two', 'blank', 'waiting')
    const log = health.pixelfxHealthLog()
    assert.equal(log.length, health.PIXELFX_HEALTH_LOG_LIMIT)
    assert.equal(log[0].fx, 'fx/5', 'the five oldest events fell off the ring')
    assert.equal(log.at(-1).fx, `fx/${total - 1}`)
    health.resetPixelfxHealthLog()
  } finally {
    delete globalThis.localStorage
    health.resetPixelfxHealthLog()
  }
})

test('health log: without storage the ring lives in session memory', async () => {
  const health = await import('../src/fx/health.js')
  delete globalThis.localStorage
  health.resetPixelfxHealthLog()
  health.recordPixelfxHeal('a/one', 'b/two', 'blank', 'waiting')
  assert.equal(health.pixelfxHealthLog().length, 1)
  assert.equal(health.pixelfxHealthLogSummary().heals, 1)
  health.resetPixelfxHealthLog()
  assert.equal(health.pixelfxHealthLog().length, 0)
})

test('placements stamp every pick with the scene it serves', () => {
  assert.equal(pickFx(PIXELFX_SCENE.WAITING, 'xuanzhen').scene, 'waiting')
  assert.equal(pickFx(PIXELFX_SCENE.SEASON_FINALE, 'xuanzhen').scene, 'season-finale')
  assert.equal(pickFx(PIXELFX_SCENE.CHAPTER_UPGRADE, 'kehuan', { grand: true }).scene, 'chapter-upgrade')
  assert.equal(pickForgeAmbientFx('mist', null).scene, 'forge-ambient')
  // A custom world falls back to the waiting table — and its stamp
  // honestly says so.
  assert.equal(pickForgeAmbientFx('no-such-world', 'xuanyi').scene, 'waiting')
})

test('keyframes: PNG codec round-trips and the diff judges drift', async () => {
  const { encodePng, decodePng, diffFrames, PIXELFX_KEYFRAME_CHANGED_FRACTION } = await import('../scripts/fx-keyframes.mjs')
  const width = 4
  const height = 3
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 37) % 256
  const decoded = decodePng(encodePng({ width, height, rgb }))
  assert.equal(decoded.width, width)
  assert.equal(decoded.height, height)
  assert.deepEqual(decoded.rgb, rgb)
  const same = diffFrames({ width, height, rgb }, { width, height, rgb })
  assert.equal(same.fraction, 0)
  const moved = Buffer.from(rgb)
  moved[0] = (moved[0] + 200) % 256
  const drift = diffFrames({ width, height, rgb }, { width, height, rgb: moved })
  assert.equal(drift.changed, 1)
  assert.ok(drift.fraction > PIXELFX_KEYFRAME_CHANGED_FRACTION)
  assert.equal(diffFrames({ width, height, rgb }, { width: 2, height, rgb }), null)
})

test('keyframes: every scene renders a non-blank portrait, deterministically', async () => {
  const { renderKeyframes } = await import('../scripts/fx-keyframes.mjs')
  const first = await renderKeyframes()
  assert.equal(first.size, Object.keys(PIXELFX_SCENE).length)
  for (const [scene, { image }] of first) {
    let painted = 0
    for (let i = 0; i < image.rgb.length; i++) if (image.rgb[i] > 0) painted += 1
    assert.ok(painted > 0, `${scene} portrait is blank`)
  }
  // Same seeds, same fixed step count: a second render must match
  // pixel for pixel, or the compare mode would cry wolf daily.
  const second = await renderKeyframes()
  const { diffFrames } = await import('../scripts/fx-keyframes.mjs')
  for (const [scene, { image }] of first) {
    assert.equal(diffFrames(image, second.get(scene).image).fraction, 0, `${scene} render is not deterministic`)
  }
})

test('settings wiring: the advanced group summarises the persisted health log', async () => {
  const { readFileSync } = await import('node:fs')
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /pixelfxHealthLogSummary/)
  assert.match(main, /settings-group-title">高级/)
  assert.match(main, /特效健康/)
  const canvas = readFileSync(new URL('../src/fx/PixelfxCanvas.jsx', import.meta.url), 'utf8')
  assert.match(canvas, /recordPixelfxHeal\(from\.fx, to\.fx, reason, sceneName\)/)
  assert.match(canvas, /recordPixelfxDeath\(from\.fx, reason, sceneName\)/)
  assert.match(canvas, /recordPixelfxTierDrop\(candidate\.fx, verdict\.index - 1, verdict\.index, sceneName\)/)
})

test('health log: method-level storage denial degrades to the memory ring', async () => {
  const health = await import('../src/fx/health.js')
  // A Storage object that exists but throws on write (zero-quota
  // private mode): events must land in the memory ring, not vanish.
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError') },
    removeItem: () => {},
  }
  try {
    health.resetPixelfxHealthLog()
    health.recordPixelfxHeal('a/one', 'b/two', 'slow', 'waiting')
    health.recordPixelfxDeath('c/three', 'blank', 'intervene')
    const log = health.pixelfxHealthLog()
    assert.equal(log.length, 2)
    assert.equal(log[0].type, 'heal')
    assert.equal(log[1].type, 'death')
    assert.deepEqual(health.pixelfxHealthLogSummary(), {
      events: 2, heals: 1, deaths: 1, tierDrops: 0, anomalies: 1,
    })
    health.resetPixelfxHealthLog()
  } finally {
    delete globalThis.localStorage
    health.resetPixelfxHealthLog()
  }
  // Same when reads throw from the start.
  globalThis.localStorage = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => {},
    removeItem: () => {},
  }
  try {
    health.recordPixelfxTierDrop('d/four', 0, 1, 'waiting')
    assert.equal(health.pixelfxHealthLog().length, 1)
    assert.equal(health.pixelfxHealthLog()[0].type, 'tier-drop')
    health.resetPixelfxHealthLog()
  } finally {
    delete globalThis.localStorage
    health.resetPixelfxHealthLog()
  }
})

test('keyframes: the decoder refuses truncated and interlaced PNGs', async () => {
  const { encodePng, decodePng } = await import('../scripts/fx-keyframes.mjs')
  const png = encodePng({ width: 2, height: 2, rgb: Buffer.alloc(12, 7) })
  assert.throws(() => decodePng(png.subarray(0, png.length - 12)), /truncated|corrupt/)
  const interlaced = Buffer.from(png)
  interlaced[28] = 1 // IHDR interlace byte: Adam7 must not unfilter as scanlines
  assert.throws(() => decodePng(interlaced), /unsupported PNG format/)
})

test('keyframes: --compare on a missing directory lists missing baselines, never crashes', async () => {
  const { spawnSync } = await import('node:child_process')
  const script = new URL('../scripts/fx-keyframes.mjs', import.meta.url).pathname
  const run = spawnSync(process.execPath, [script, '--compare', '/tmp/fx-keyframes-no-such-dir-wave6'], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /no readable baseline portrait/)
  assert.doesNotMatch(run.stderr, /ENOENT/)
})
