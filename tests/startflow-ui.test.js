import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { GENRES, GENRE_TEMPLATES } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const artwork = readFileSync(new URL('../src/components/WorldArtwork.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('start flow step one is a template brick wall with a world picker', () => {
  assert.match(main, /想写哪种故事？/)
  assert.match(main, /className="template-wall"/)
  assert.match(main, /className="stage-chips"/)
  assert.match(main, /选择世界/)
  assert.doesNotMatch(main, /故事舞台|预设舞台/)
  assert.doesNotMatch(main, /world-grid|WorldCard/)
})

test('start flow step two picks an origin identity that frames the spawn step', () => {
  assert.match(main, /你以什么身份醒来？/)
  assert.match(main, /ORIGIN_IDENTITIES/)
  assert.match(main, /originIdentityId/)
  assert.match(main, /spawnPointsForIdentity/)
  assert.match(main, /localIdentityTitle/)
  // Creation forwards the picked identity alongside the spawn point.
  assert.match(main, /originIdentityId: payload\.originIdentityId/)
  // The confirmation step links back to the identity step.
  assert.match(main, /aria-label="修改身份"/)
  // The random card and the step exit share one roll.
  assert.match(main, /const rollIdentity = \(\) =>/)
  assert.match(main, /onClick=\{rollIdentity\}/)
  // Leaving the identity step with nothing picked rolls and lands an
  // identity instead of falling through to the whole-world spawn list; an
  // identity already on the draft is never re-rolled.
  assert.match(main, /if \(step === 2 && !identity\) rollIdentity\(\)/)
})

test('start flow step three picks a spawn point for the chosen world', () => {
  assert.match(main, /故事从哪里醒来？/)
  assert.match(main, /className="spawn-grid"/)
  assert.match(main, /resolveStartPoint/)
  assert.match(main, /startPointName: payload\.startPointName/)
  assert.match(main, /startPointHook: payload\.startPointHook/)
  // God mode gets a free-form spawn field only: spawn points are never
  // borrowed from a template's world (templates are decoupled from worlds).
  assert.match(main, /出生点（选填）/)
  assert.doesNotMatch(main, /boundSpawnPoints/)
  // The confirmation step links back to the spawn step.
  assert.match(main, /aria-label="修改出生点"/)
})

test('the brick wall covers every genre template exactly once', () => {
  const orderBlock = main.match(/const TEMPLATE_WALL_ORDER = \[([\s\S]*?)\];/)
  assert.ok(orderBlock, 'wall order constant exists')
  const ids = [...orderBlock[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1])
  assert.deepEqual([...ids].sort(), GENRE_TEMPLATES.map((template) => template.id).sort())
})

test('template and world picks are decoupled: each selection moves only its own axis', () => {
  // Clicking a brick sets the category and nothing else; the stage picker
  // sets the world and nothing else. No recommendation machinery remains.
  assert.match(main, /set\(\{ genreTemplateId: item\.id \}\)/)
  assert.match(main, /const selectStage = \(genreId\) => \{\s*set\(\{ genreId \}\);/)
  assert.doesNotMatch(main, /recommendedTemplateFor/)
  assert.doesNotMatch(main, /templateTouched/)
  assert.doesNotMatch(main, /item\.worldId/)
  assert.doesNotMatch(main, /世界 · /)
})

test('the opening step offers the two length modes and defaults to a season', () => {
  assert.match(main, /一季 · 24 章/)
  assert.match(main, /长线 · 100 章/)
  assert.match(main, /storyLengthMode: payload\.storyLengthMode/)
  assert.match(main, /storyLengthMode: "season"/)
})

test('every world has shipping artwork wired into WorldArtwork', () => {
  for (const genre of GENRES) assert.ok(artwork.includes(`"${genre.id}"`), genre.id)
  assert.match(styles, /\.template-wall\{/)
  assert.match(styles, /\.template-brick\.selected/)
  assert.match(styles, /\.stage-chip\.selected/)
})

test('god mode: entry, form and wiring live in the first forge step', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  // Entry sits alongside the stage picker, not buried in a later step.
  assert.ok(main.includes('创世神模式') && main.includes('世界由你亲手写'))
  assert.ok(main.includes('god-entry') && main.includes('enterGodMode') && main.includes('exitGodMode'))
  // The form is exactly three things: name, setting, craft choice.
  assert.ok(main.includes('customWorldName') && main.includes('CUSTOM_WORLD_NAME_MAX'))
  assert.ok(main.includes('customWorldSetting') && main.includes('CUSTOM_WORLD_SETTING_MAX'))
  assert.ok(main.includes('完全自由') && main.includes('GOD_MODE_FRAGMENTS'))
  // Creation forwards every custom field, not just the template id.
  assert.ok(main.includes('customWorldName: payload.customWorldName'))
  assert.ok(main.includes('customWorldSetting: payload.customWorldSetting'))
})

test('god mode: the hard-line setting check gates step one and creation', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.ok(main.includes('findSettingViolation(draft.customWorldSetting)'))
  assert.ok(main.includes('findSettingViolation(payload.customWorldSetting)'))
  const guard = readFileSync(new URL('../src/setting-guard.js', import.meta.url), 'utf8')
  assert.ok(guard.includes('未成年') && guard.includes('真实人物'))
})
