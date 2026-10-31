// PIXELFX-WAVE1: the vendored pixelfx catalog contract.
// - The vendored tree on disk holds the full upstream library at the
//   pinned commit (VENDOR.md), counted exactly: 244 effect modules.
// - Every effect module imports cleanly in plain node (the library is
//   pure ESM with only relative imports) and has a playable shape:
//   a meta object plus create() or draw()/drawBack().
// - src/fx/catalog.js enumerates that same tree via import.meta.glob
//   (a Vite-only API, so the module itself is source-asserted here
//   rather than imported — the enumeration pattern and the _lib
//   exclusion are pinned as text).
// - Every effect id placements.js can hand out exists in the tree.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pickFx, placementFxIds, PIXELFX_SCENE } from '../src/fx/placements.js'

const FX_ROOT = fileURLToPath(new URL('../src/fx/pixelfx/fx/', import.meta.url))
const VENDOR_DIR = fileURLToPath(new URL('../src/fx/pixelfx/', import.meta.url))

function effectFilesOnDisk() {
  const files = []
  for (const category of readdirSync(FX_ROOT, { withFileTypes: true })) {
    if (!category.isDirectory()) continue
    for (const name of readdirSync(join(FX_ROOT, category.name))) {
      if (name.endsWith('.js') && !name.startsWith('_')) {
        files.push(`${category.name}/${name.replace(/\.js$/, '')}`)
      }
    }
  }
  return files.sort()
}

test('vendored tree: full library at the pinned commit', () => {
  const vendor = readFileSync(join(VENDOR_DIR, 'VENDOR.md'), 'utf8')
  assert.match(vendor, /a84159688af3ca37a4be05a0d422b94451b2e24e/)
  assert.ok(existsSync(join(VENDOR_DIR, 'LICENSE')), 'upstream LICENSE vendored alongside')
  const ids = effectFilesOnDisk()
  assert.ok(ids.length >= 232, `catalog floor: expected >=232 effects, found ${ids.length}`)
  assert.equal(ids.length, 244, 'pinned commit ships exactly 244 effect modules')
})

test('every vendored effect module imports with a playable shape', async () => {
  const ids = effectFilesOnDisk()
  const bad = []
  for (const id of ids) {
    const mod = await import(pathToFileURL(join(FX_ROOT, `${id}.js`)).href)
    const meta = mod.meta
    const playable = typeof mod.create === 'function' || typeof mod.draw === 'function' || typeof mod.drawBack === 'function'
    const sized = Array.isArray(meta?.size) && meta.size[0] > 0 && meta.size[1] > 0
    if (!meta || typeof meta !== 'object' || !playable || !sized) bad.push(id)
  }
  assert.deepEqual(bad, [], `unplayable or unshaped modules: ${bad.join(', ')}`)
})

test('catalog.js enumerates the vendored tree via import.meta.glob', () => {
  const source = readFileSync(new URL('../src/fx/catalog.js', import.meta.url), 'utf8')
  assert.match(source, /import\.meta\.glob\("\.\/pixelfx\/fx\/\*\/\*\.js"\)/)
  assert.match(source, /_lib\.js/, 'catalog excludes the per-category _lib helpers')
  assert.match(source, /PIXELFX_CATALOG/)
  assert.match(source, /loadPixelfx/)
})

test('placements only hand out effects that exist, for every family', async () => {
  const onDisk = new Set(effectFilesOnDisk())
  for (const id of placementFxIds()) {
    assert.ok(onDisk.has(id), `placements reference missing effect ${id}`)
  }
  const families = [
    'xuanzhen', 'wuxia', 'chuanyue', 'yanqing', 'dushi', 'yule', 'lishi',
    'kehuan', 'moshi', 'xuanyi', 'lingyi', 'fuben', 'dianjing', 'junshi',
    'tiyu', 'zhongtian', 'duanpian', 'fanpai',
  ]
  for (const scene of [PIXELFX_SCENE.WAITING, PIXELFX_SCENE.INTERVENE]) {
    for (const family of families) {
      const pick = pickFx(scene, family)
      assert.ok(pick && onDisk.has(pick.fx), `${scene}/${family} pick must exist`)
      assert.equal(typeof pick.seed, 'number')
    }
  }
})

test('pickFx: fallbacks, scene guard, palette variants, fresh copies', () => {
  // Unknown / custom / missing family falls back to the scene default.
  assert.equal(pickFx('waiting', null).fx, 'water/water-orb')
  assert.equal(pickFx('waiting', 'custom').fx, 'water/water-orb')
  assert.equal(pickFx('waiting', 'no-such-family').fx, 'water/water-orb')
  assert.equal(pickFx('intervene', null).fx, 'arcane/magic-circle-cast')
  // Unmapped scene yields null, never a wrong effect.
  assert.equal(pickFx('reader-prose', 'xuanzhen'), null)
  // The two pilot families named in the wave brief.
  assert.equal(pickFx('waiting', 'xuanyi').fx, 'critters/wisp')
  assert.equal(pickFx('waiting', 'kehuan').fx, 'scifi/energy-core')
  assert.equal(pickFx('intervene', 'xuanyi').fx, 'shadow/hex-sigil')
  // Palette variant: xuanzhen's waiting pick carries the gold ramp;
  // fuben's same effect keeps the library's own violet (no palette key).
  const gold = pickFx('waiting', 'xuanzhen')
  assert.equal(gold.fx, 'arcane/rune-circle')
  assert.ok(Array.isArray(gold.palette) && gold.palette.length === 8)
  assert.equal(pickFx('waiting', 'fuben').palette, undefined)
  // Picks are fresh copies: mutating one must not poison the table.
  gold.palette[0] = '#000000'
  gold.fx = 'tampered'
  const again = pickFx('waiting', 'xuanzhen')
  assert.equal(again.fx, 'arcane/rune-circle')
  assert.notEqual(again.palette[0], '#000000')
})

test('pilot wiring: overlays mount the player through placements', () => {
  const generation = readFileSync(new URL('../src/components/GenerationOverlay.jsx', import.meta.url), 'utf8')
  assert.match(generation, /PIXELFX_SCENE\.WAITING/)
  assert.match(generation, /PixelfxCanvas/)
  assert.match(generation, /family/, 'generation wait receives the book family')
  const intervention = readFileSync(new URL('../src/components/InterventionOverlay.jsx', import.meta.url), 'utf8')
  assert.match(intervention, /PIXELFX_SCENE\.INTERVENE/)
  assert.match(intervention, /loop=\{false\}/, 'intervention burst is a one-shot')
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /GenerationOverlay kind="story" family=\{shelfForTemplate\(draft\.genreTemplateId\)/)
  assert.match(main, /GenerationOverlay kind="story" family=\{shelfForTemplate\(detail\?\.genreTemplateId/)
  assert.match(main, /family=\{shelfForTemplate\(story\?\.genreTemplateId/)
})
