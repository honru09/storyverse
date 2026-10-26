import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { GENRES, GENRE_TEMPLATES } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const artwork = readFileSync(new URL('../src/components/WorldArtwork.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('start flow step one is only a template brick wall: no world picking on the category screen', () => {
  assert.match(main, /想写哪种故事？/)
  assert.match(main, /className="template-wall"/)
  // The world picker left step one entirely: no stage chips, no picker
  // label, no god entry — the category screen carries no world at all.
  assert.doesNotMatch(main, /stage-picker/)
  assert.doesNotMatch(main, /选择世界/)
  assert.doesNotMatch(main, /故事舞台|预设舞台/)
})

test('start flow step two is a dedicated world screen: cover cards, god card, random card', () => {
  assert.match(main, /故事发生在哪个世界？/)
  assert.match(main, /className="world-grid"/)
  assert.match(main, /function WorldCard/)
  assert.match(main, /world-card-god/)
  assert.match(main, /world-card-random/)
  // Leaving the world step with nothing picked rolls a world and lands it —
  // the same rule the identity step already had; a chosen world is never
  // re-rolled.
  assert.match(main, /const rollWorld = \(\) =>/)
  assert.match(main, /if \(step === 2 && !isCustom && !worldChosen\) rollWorld\(\)/)
  // The setting guard moved with the god form to the world step.
  assert.match(main, /if \(step === 2 && isCustom\)/)
})

test('start flow runs seven steps with a step-count-independent stepper', () => {
  for (const label of ['题材', '世界', '身份', '出生点', '主角', '能力', '开局']) {
    assert.match(main, new RegExp(`label: "${label}"`))
  }
  assert.match(main, /共 7 步/)
})

test('draft compatibility: the world marker and the six-to-seven step migration', () => {
  // New drafts record whether a world was deliberately chosen.
  assert.match(main, /worldChosen:/)
  assert.match(main, /typeof source\.worldChosen === "boolean"/)
  // Legacy drafts (no marker) keep their world and shift steps 2..6 by one.
  assert.match(main, /const migratedDraftStep = \(source\) =>/)
  assert.match(main, /step <= 1 \? 1 : Math\.min\(7, step \+ 1\)/)
  assert.match(main, /step: migratedDraftStep\(source\)/)
})

test('start flow step three picks an origin identity that frames the spawn step', () => {
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
  assert.match(main, /if \(step === 3 && !identity\) rollIdentity\(\)/)
})

test('start flow step four picks a spawn point for the chosen world', () => {
  assert.match(main, /故事从哪里醒来？/)
  assert.match(main, /className="spawn-grid"/)
  assert.match(main, /resolveStartPoint/)
  assert.match(main, /startPointName: payload\.startPointName/)
  assert.match(main, /startPointHook: payload\.startPointHook/)
  // God mode gets the free-form spawn field plus a borrow block whose
  // source is the world the user had chosen before going god, crossed with
  // the picked identity — never a world lent by a craft template.
  assert.match(main, /出生点（选填）/)
  assert.match(main, /godBorrowWorldId/)
  assert.match(main, /spawnPointsForIdentity\(borrowGenre, identity\.id\)/)
  assert.match(main, /borrowPoints\.length > 0/)
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
  // Clicking a brick sets the category and nothing else — the source must
  // not touch the world field or the world marker on that path. Picking a
  // world sets the world and lands its marker, nothing else. The random
  // combo is the only place that rolls all four axes, each independently.
  assert.match(main, /set\(\{ genreTemplateId: item\.id \}\)/)
  assert.match(main, /const selectStage = \(genreId\) => \{\s*set\(\{ genreId, worldChosen: true \}\);/)
  assert.match(main, /const rollCombo = \(\) =>/)
  assert.match(main, /worldChosen: true,\s*originIdentityId: nextIdentity\.id/)
  assert.doesNotMatch(main, /recommendedTemplateFor/)
  assert.doesNotMatch(main, /templateTouched/)
  assert.doesNotMatch(main, /item\.worldId/)
  assert.doesNotMatch(main, /世界 · /)
})

test('confirmation and preview rows jump back to category and world independently', () => {
  assert.match(main, /aria-label="修改题材"/)
  assert.match(main, /aria-label="修改世界"/)
  assert.match(main, /onJump/)
  assert.doesNotMatch(main, /修改题材与世界/)
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

test('god mode: entry, form and wiring live in the world forge step', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  // Entry is a card on the world screen, not buried in a later step.
  assert.ok(main.includes('创世神模式') && main.includes('世界由你亲手写'))
  assert.ok(main.includes('world-card-god') && main.includes('enterGodMode') && main.includes('exitGodMode'))
  // The form is exactly three things: name, setting, craft choice.
  assert.ok(main.includes('customWorldName') && main.includes('CUSTOM_WORLD_NAME_MAX'))
  assert.ok(main.includes('customWorldSetting') && main.includes('CUSTOM_WORLD_SETTING_MAX'))
  assert.ok(main.includes('完全自由') && main.includes('GOD_MODE_FRAGMENTS'))
  // Creation forwards every custom field, not just the template id.
  assert.ok(main.includes('customWorldName: payload.customWorldName'))
  assert.ok(main.includes('customWorldSetting: payload.customWorldSetting'))
})

test('god mode: the hard-line setting check gates the world step and creation', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.ok(main.includes('findSettingViolation(draft.customWorldSetting)'))
  assert.ok(main.includes('findSettingViolation(payload.customWorldSetting)'))
  const guard = readFileSync(new URL('../src/setting-guard.js', import.meta.url), 'utf8')
  assert.ok(guard.includes('未成年') && guard.includes('真实人物'))
})

test('protagonist step has no origin picker: the identity step is the only origin source', () => {
  assert.doesNotMatch(main, /const origins =/)
  assert.doesNotMatch(main, /origin-grid/)
  assert.doesNotMatch(main, /draft\.origin === origin/)
  assert.doesNotMatch(main, /<dt>出身<\/dt>/)
})

test('ability step composes its list from world and template, with custom text and a roll', () => {
  assert.match(main, /const abilityCandidates = abilityCandidatesFor\(/)
  assert.match(main, /abilityCandidates\.map/)
  assert.match(main, /自定义能力（选填）/)
  assert.match(main, /随机能力/)
  assert.match(main, /const rollAbility = \(\) =>/)
  // Leaving the step unpicked rolls from the current list and lands it.
  assert.match(main, /if \(step === 6 && !abilityPick\) rollAbility\(\)/)
  // No preset ability is restored by default.
  assert.doesNotMatch(main, /"tide"/)
})
