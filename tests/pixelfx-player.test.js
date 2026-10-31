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
import { pickFx } from '../src/fx/placements.js'

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
