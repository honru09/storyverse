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
import { pickFx, pickForgeAmbientFx, placementFxIds, PIXELFX_SCENE, FORGE_AMBIENT_WORLDS } from '../src/fx/placements.js'

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

test('wave-2 placements: every scene hands out effects that exist', async () => {
  const onDisk = new Set(effectFilesOnDisk())
  const families = [
    'xuanzhen', 'wuxia', 'chuanyue', 'yanqing', 'dushi', 'yule', 'lishi',
    'kehuan', 'moshi', 'xuanyi', 'lingyi', 'fuben', 'dianjing', 'junshi',
    'tiyu', 'zhongtian', 'duanpian', 'fanpai', null, 'custom',
  ]
  const scenes = [
    PIXELFX_SCENE.CHAPTER_UPGRADE, PIXELFX_SCENE.MERGE_SUCCESS,
    PIXELFX_SCENE.AVATAR_REVEAL, PIXELFX_SCENE.FORGE_OPEN,
    PIXELFX_SCENE.PLAZA_LIKE, PIXELFX_SCENE.PUBLISH_CELEBRATION,
    PIXELFX_SCENE.DETAIL_AMBIENT, PIXELFX_SCENE.COVER_REVEAL,
    PIXELFX_SCENE.EMPTY_SHELF, PIXELFX_SCENE.LOGIN_WELCOME,
  ]
  for (const scene of scenes) {
    for (const family of families) {
      for (const grand of [false, true]) {
        const pick = pickFx(scene, family, { grand })
        assert.ok(pick && onDisk.has(pick.fx), `${scene}/${family}/grand=${grand} pick must exist`)
        assert.equal(typeof pick.seed, 'number')
      }
    }
  }
  // The forge ambient chain: each preset world speaks for itself, a
  // custom world borrows its family's waiting pick.
  assert.deepEqual(FORGE_AMBIENT_WORLDS, ['mist', 'cultivation', 'neon', 'city', 'court', 'frontier'])
  for (const world of FORGE_AMBIENT_WORLDS) {
    const pick = pickForgeAmbientFx(world, 'xuanzhen')
    assert.ok(onDisk.has(pick.fx), `forge world ${world} pick must exist`)
    assert.equal(pick.fx, pickFx(PIXELFX_SCENE.FORGE_AMBIENT, world).fx)
  }
  assert.equal(pickForgeAmbientFx('custom-world', 'xuanyi').fx, 'critters/wisp')
  assert.equal(pickForgeAmbientFx('', null).fx, 'water/water-orb')
  // Wave 3 landed the last three planned scenes; the backlog is empty.
  const { PLANNED_SCENES } = await import('../src/fx/placements.js')
  assert.deepEqual(PLANNED_SCENES, [])
})

test('wave-2 one-shot primaries are actor-free and non-looping; ambient primaries loop actor-free', async () => {
  // A one-shot whose meta loops never reports done (its canvas would
  // never leave), and an effect with a stock actor would march a
  // little stock character across a reading app's chrome. Both are
  // placement bugs; pin the primaries against them.
  const oneShotScenes = [
    PIXELFX_SCENE.CHAPTER_UPGRADE, PIXELFX_SCENE.MERGE_SUCCESS,
    PIXELFX_SCENE.AVATAR_REVEAL, PIXELFX_SCENE.FORGE_OPEN,
    PIXELFX_SCENE.PLAZA_LIKE, PIXELFX_SCENE.PUBLISH_CELEBRATION,
    PIXELFX_SCENE.INTERVENE, PIXELFX_SCENE.COVER_REVEAL,
    PIXELFX_SCENE.LOGIN_WELCOME,
  ]
  const families = ['xuanzhen', 'wuxia', 'kehuan', 'moshi', 'xuanyi', 'lingyi', 'yanqing', 'fuben', 'dianjing', null]
  const loadMeta = async (id) => (await import(pathToFileURL(join(FX_ROOT, `${id}.js`)).href)).meta
  for (const scene of oneShotScenes) {
    for (const family of families) {
      for (const grand of [false, true]) {
        const pick = pickFx(scene, family, { grand })
        const meta = await loadMeta(pick.fx)
        assert.ok(!meta.actor, `${scene}/${family} → ${pick.fx} must be actor-free`)
        assert.ok(!meta.loop, `${scene}/${family} → ${pick.fx} must be a true one-shot (non-looping meta)`)
      }
    }
  }
  // Wave 3: the alt lists are the LIVE healing chain, so alternates
  // are held to the same discipline — actor-free everywhere, and
  // non-looping wherever the scene is a one-shot (a looping alternate
  // never reports done; its canvas would never leave).
  for (const scene of oneShotScenes) {
    for (const family of families) {
      for (const grand of [false, true]) {
        const pick = pickFx(scene, family, { grand })
        for (const alt of pick.alts) {
          const meta = await loadMeta(alt.fx)
          assert.ok(!meta.actor, `${scene}/${family} alt ${alt.fx} must be actor-free`)
          assert.ok(!meta.loop, `${scene}/${family} alt ${alt.fx} must be a true one-shot (non-looping meta)`)
        }
      }
    }
  }
  for (const world of FORGE_AMBIENT_WORLDS) {
    const meta = await loadMeta(pickForgeAmbientFx(world, null).fx)
    assert.ok(!meta.actor && meta.loop, `forge world ${world} ambient must loop actor-free`)
  }
  for (const family of ['xuanyi', 'lingyi', 'moshi', 'fanpai', 'zhongtian', null]) {
    const meta = await loadMeta(pickFx(PIXELFX_SCENE.DETAIL_AMBIENT, family).fx)
    assert.ok(!meta.actor && meta.loop, `detail-ambient/${family} must loop actor-free`)
  }
  const shelfMeta = await loadMeta(pickFx(PIXELFX_SCENE.EMPTY_SHELF, null).fx)
  assert.ok(!shelfMeta.actor && shelfMeta.loop, 'empty-shelf ambient must loop actor-free')
})

test('pickFx grand variant: finale picks differ where the table defines them', () => {
  const small = pickFx('chapter-upgrade', null)
  const grand = pickFx('chapter-upgrade', null, { grand: true })
  assert.equal(small.fx, 'arcane/mana-burst')
  assert.equal(grand.fx, 'explosions/firework-burst')
  assert.notEqual(small.fx, grand.fx)
  assert.equal(pickFx('chapter-upgrade', 'xuanzhen', { grand: true }).fx, 'holy/holy-pillar')
  // Scenes without a grand variant ignore the flag entirely.
  assert.equal(pickFx('merge-success', null, { grand: true }).fx, pickFx('merge-success', null).fx)
  assert.equal(pickFx('waiting', 'xuanzhen', { grand: true }).fx, 'arcane/rune-circle')
})

test('wave-2 wiring: every landed surface mounts the player through placements', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  // 1. chapter milestones in the reader + the forge-open stamp pair.
  assert.match(main, /PIXELFX_SCENE\.CHAPTER_UPGRADE/)
  assert.match(main, /chapterMilestoneKind/)
  assert.match(main, /structureFor\(story, index\)/)
  assert.match(main, /PIXELFX_SCENE\.FORGE_OPEN/)
  assert.match(main, /JUST_OPENED_KEY\(story\.id\)/)
  // 2. merge success on the started merge stage.
  assert.match(main, /PIXELFX_SCENE\.MERGE_SUCCESS/)
  assert.match(main, /className="merge-fx"/)
  // 3. avatar reveal over the stage frame.
  assert.match(main, /PIXELFX_SCENE\.AVATAR_REVEAL/)
  assert.match(main, /className="avatar-reveal-fx"/)
  // 4. forge ambient on the world / identity steps only.
  assert.match(main, /pickForgeAmbientFx\(world\?\.id/)
  assert.match(main, /step === 2 \|\| step === 3/)
  assert.match(main, /className="forge-ambient-fx"/)
  // 5. plaza like burst (throttled, like-only) + publish celebration.
  assert.match(main, /PIXELFX_SCENE\.PLAZA_LIKE/)
  assert.match(main, /className="plaza-like-fx"/)
  assert.match(main, /PIXELFX_SCENE\.PUBLISH_CELEBRATION/)
  assert.match(main, /celebrateToast/)
  assert.match(main, /onToast=\{celebrateToast\}/)
  // 6. detail ambience inside the existing ambience layer.
  assert.match(main, /PIXELFX_SCENE\.DETAIL_AMBIENT/)
  assert.match(main, /className="detail-ambience-fx"/)
  // Every wave-2 layer has a CSS home in aurora.css.
  const css = readFileSync(new URL('../src/aurora.css', import.meta.url), 'utf8')
  for (const cls of ['reader-open-fx', 'merge-fx', 'avatar-reveal-fx', 'forge-ambient-fx', 'plaza-like-fx', 'toast-fx', 'detail-ambience-fx']) {
    assert.match(css, new RegExp(`\\.${cls}\\{`), `${cls} needs a CSS rule`)
  }
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

test('wave-3 theme dimension: white inks the glow, aurora violets it, black is authored', async () => {
  const { setPixelfxTheme, pixelfxTheme, PIXELFX_THEMES } = await import('../src/fx/placements.js')
  assert.deepEqual(PIXELFX_THEMES, ['black', 'white', 'aurora'])
  try {
    setPixelfxTheme('black')
    assert.equal(pixelfxTheme(), 'black')
    const blackGold = pickFx('waiting', 'xuanzhen')
    assert.equal(blackGold.palette[4], '#eda93c', 'black keeps the authored gold ramp')
    // A palette-free glow pick carries no palette on black.
    assert.equal(pickFx('waiting', 'kehuan').palette, undefined)

    setPixelfxTheme('white')
    const whiteGold = pickFx('waiting', 'xuanzhen')
    assert.equal(whiteGold.fx, 'arcane/rune-circle', 'theme shades the palette, never the effect')
    assert.notDeepEqual(whiteGold.palette, blackGold.palette)
    // Every white-theme gold step stays in ink/amber territory — no
    // near-white step may survive (it would vanish on a light ground).
    for (const hex of whiteGold.palette) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b < 190, `${hex} too bright for the white theme`)
    }
    // Palette-free glow effects take the ink ramp on white…
    const inked = pickFx('waiting', 'kehuan')
    assert.ok(Array.isArray(inked.palette) && inked.palette.length === 8)
    // …but a non-glow effect keeps its native look (no palette forced).
    assert.equal(pickFx('waiting', 'wuxia').palette, undefined)

    setPixelfxTheme('aurora')
    const auroraGold = pickFx('waiting', 'xuanzhen')
    assert.notDeepEqual(auroraGold.palette, blackGold.palette)
    assert.notDeepEqual(auroraGold.palette, whiteGold.palette)
    const auroraGlow = pickFx('waiting', 'kehuan')
    assert.ok(Array.isArray(auroraGlow.palette) && auroraGlow.palette.length === 8)
    assert.notDeepEqual(auroraGlow.palette, inked.palette)

    // An unknown theme name falls back to black rather than breaking picks.
    setPixelfxTheme('sepia')
    assert.equal(pixelfxTheme(), 'black')
    assert.equal(pickFx('waiting', 'xuanzhen').palette[4], '#eda93c')
  } finally {
    setPixelfxTheme('black')
  }
})

test('wave-3 picks carry their self-healing alt chain (same seed, no palette)', () => {
  const pick = pickFx('waiting', 'xuanzhen')
  assert.deepEqual(pick.alts, [
    { fx: 'arcane/arcane-orb', seed: 7 },
    { fx: 'arcane/portal', seed: 7 },
  ])
  // Alternates never inherit the primary's palette: a palette is the
  // one thing that can be broken (wave 1), the chain must fall back
  // to native ramps.
  const gold = pickFx('chapter-upgrade', 'xuanzhen', { grand: true })
  assert.equal(gold.fx, 'holy/holy-pillar')
  assert.ok(gold.alts.length >= 1 && gold.alts.every((alt) => !('palette' in alt)))
  // Every alternate id in every scene exists on disk.
  const onDisk = new Set(effectFilesOnDisk())
  for (const scene of Object.values(PIXELFX_SCENE)) {
    for (const family of ['xuanzhen', 'kehuan', 'xuanyi', null]) {
      const p = pickFx(scene, family)
      assert.ok(p && onDisk.has(p.fx), `${scene} primary must exist`)
      for (const alt of p.alts) assert.ok(onDisk.has(alt.fx), `${scene} alt ${alt.fx} must exist`)
    }
  }
})

test('wave-3 wiring: cover reveal, empty shelf, login welcome, theme + prefetch', () => {
  const cover = readFileSync(new URL('../src/components/StoryCover.jsx', import.meta.url), 'utf8')
  assert.match(cover, /PIXELFX_SCENE\.COVER_REVEAL/)
  assert.match(cover, /className="story-cover-fx"/)
  assert.match(cover, /witnessedNonReady/, 'reveal only fires on a witnessed landing, never on first mount')
  assert.match(cover, /revealedCoverKeys/, 'one reveal per cover version per session')

  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /PIXELFX_SCENE\.EMPTY_SHELF/)
  assert.match(main, /className="profile-empty-fx"/)
  assert.match(main, /PIXELFX_SCENE\.LOGIN_WELCOME/)
  assert.match(main, /className="login-welcome-fx"/)
  assert.match(main, /setPixelfxTheme\(shellTheme\)/, 'App publishes the shell theme to placements')
  assert.match(main, /prefetchPixelfx\(ids\)/, 'reader warms its next scenes at idle')
  assert.match(main, /PIXELFX_SCENE\.COVER_REVEAL/, 'reader prefetches the cover reveal too')

  const canvas = readFileSync(new URL('../src/fx/PixelfxCanvas.jsx', import.meta.url), 'utf8')
  assert.match(canvas, /pixelfxChain/, 'canvas walks the healing chain')
  assert.match(canvas, /from "\.\/health\.js"/)
  assert.match(canvas, /__pixelfxHealth|recordPixelfxDeath/, 'deaths are recorded in the health table')

  const css = readFileSync(new URL('../src/aurora.css', import.meta.url), 'utf8')
  for (const cls of ['story-cover-fx', 'profile-empty-fx', 'login-welcome-fx']) {
    assert.match(css, new RegExp(`\\.${cls}\\{`), `${cls} needs a CSS rule`)
  }
})
