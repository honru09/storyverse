import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { GENRES, GENRE_TEMPLATES, GENRE_SHELVES } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const artwork = readFileSync(new URL('../src/components/WorldArtwork.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

// --- The 5-step shape (STARTFLOW FIX, 2026-10-27) -----------------------

test('start flow runs five steps: 题材 世界 出身 主角 开局， and no step-count text', () => {
  for (const label of ['题材', '世界', '出身', '主角', '开局']) {
    assert.match(main, new RegExp(`label: "${label}"`))
  }
  assert.doesNotMatch(main, /label: "身份"/)
  assert.doesNotMatch(main, /label: "出生点"/)
  assert.doesNotMatch(main, /label: "能力"/)
  assert.doesNotMatch(main, /共 7 步/)
  assert.doesNotMatch(main, /className="step-count"/)
})

test('step one leads with free creation; the two-level shelf is the second layer (REQ-51 revised)', () => {
  // The 2026-10-30 23:43 ruling inverted the step: the free-genre hero
  // is the main path, and the taxonomy — still a two-level shelf inside
  // — sits behind its own door in the user's words. Explanations live
  // in the step intro and the hero copy, not on the cards.
  assert.match(main, /先写你自己的题材/)
  assert.match(main, /className="step-intro"/)
  assert.match(main, /className=\{`genre-hero/)
  assert.match(main, /没灵感？试试从分类里找/)
  assert.match(main, /shelvesOpen && \(openShelf/)
  assert.match(main, /className="shelf-grid"/)
  // Single-member families go straight through; multi-member families
  // open their L2 wall, which carries the in-step way back.
  assert.match(main, /shelf\.templateIds\.length === 1/)
  assert.match(main, /换个家族/)
  // Random rolls across every L2 and shows its landing path.
  assert.match(main, /命运指到了/)
  assert.match(main, /rolledPath/)
})

test('the shelf taxonomy covers every genre template exactly once', () => {
  const ids = GENRE_SHELVES.flatMap((shelf) => shelf.templateIds)
  assert.deepEqual([...ids].sort(), GENRE_TEMPLATES.map((template) => template.id).sort())
  assert.equal(new Set(ids).size, ids.length)
})

test('template bricks carry names only: no blurb printed on the brick', () => {
  const brick = main.match(/function TemplateBrick\([\s\S]*?\n\}/)
  assert.ok(brick, 'TemplateBrick exists')
  assert.doesNotMatch(brick[0], /blurb/)
  assert.match(brick[0], /template-brick-symbol/)
})

test('step two is a dedicated world screen: cover cards, god card first, random card', () => {
  assert.match(main, /故事发生在哪个世界？/)
  assert.match(main, /className="world-grid"/)
  assert.match(main, /function WorldCard/)
  assert.match(main, /world-card-god/)
  assert.match(main, /world-card-random/)
  // The decision explanation sits above the cards, before the choice.
  const noteAt = main.indexOf('className="world-selection-note"')
  const gridAt = main.indexOf('className="world-grid"')
  assert.ok(noteAt > 0 && gridAt > noteAt, 'world note precedes the grid')
  // Leaving the world step with nothing picked rolls a world and lands it.
  assert.match(main, /const rollWorld = \(\) =>/)
  assert.match(main, /if \(step === 2 && !isCustom && !worldChosen\) rollWorld\(\)/)
  // The setting guard moved with the god form to the world step.
  assert.match(main, /if \(step === 2 && isCustom\)/)
})

test('step three merges identity and spawn point on one screen', () => {
  assert.match(main, /你以什么身份醒来？/)
  assert.match(main, /ORIGIN_IDENTITIES/)
  assert.match(main, /originIdentityId/)
  assert.match(main, /spawnPointsForIdentity/)
  // The identity card leads with the local title of this world.
  assert.match(main, /localIdentityTitle/)
  assert.match(main, /spawn-card-concept/)
  // Picking an identity expands its spawn points in place, same screen.
  assert.match(main, /从哪里醒来？/)
  assert.match(main, /className="spawn-grid"/)
  assert.match(main, /resolveStartPoint/)
  assert.match(main, /startPointName: payload\.startPointName/)
  assert.match(main, /startPointHook: payload\.startPointHook/)
  // One 出身随机 roll covers identity + its spawn point together.
  assert.match(main, /const rollOrigin = \(\) =>/)
  assert.match(main, /onClick=\{rollOrigin\}/)
  assert.match(main, /const rollIdentity = \(\) =>/)
  // Leaving the merged step with no identity rolls one and stays, so the
  // spawn section expands in place instead of being skipped past.
  assert.match(main, /if \(step === 3 && !identity\) \{\s*rollIdentity\(\);\s*return;/)
  // God mode gets the free-form spawn field plus a borrow block whose
  // source is the world the user had chosen before going god, crossed
  // with the picked identity — never a world lent by a craft template.
  assert.match(main, /出生点（选填）/)
  assert.match(main, /godBorrowWorldId/)
  assert.match(main, /spawnPointsForIdentity\(borrowGenre, identity\.id\)/)
  assert.match(main, /borrowPoints\.length > 0/)
  assert.doesNotMatch(main, /boundSpawnPoints/)
  // The summary links back to the merged step for both halves.
  assert.match(main, /aria-label="修改出身"/)
  assert.match(main, /aria-label="修改出生点"/)
})

test('step four merges protagonist and abilities: grouped pools, style descriptions on screen', () => {
  assert.match(main, /你是怎样的主角？/)
  assert.match(main, /想拥有什么能力？/)
  assert.match(main, /abilityGroupsFor/)
  assert.match(main, /ability-group-title/)
  assert.match(main, /自定义能力（选填）/)
  assert.match(main, /随机能力/)
  assert.match(main, /const rollAbility = \(\) =>/)
  // Leaving the step unpicked rolls from the current list and lands it.
  assert.match(main, /if \(step === 4 && !abilityPick\) rollAbility\(\)/)
  // 故事风格 renders the description that ships in its data — no blind picks.
  assert.match(main, /\{item\.desc\}/)
  // No preset ability is restored by default.
  assert.doesNotMatch(main, /"tide"/)
})

test('default-state governance: system defaults are badged, deliberate picks get the check', () => {
  assert.match(main, /default-badge/)
  assert.match(main, /pickedTemplate/)
  assert.match(main, /pickedTrait/)
  assert.match(main, /pickedLength/)
  // FORGE-TRIM: the 故事风格 governance retired with the cards
  // themselves — no tone state survives in the forge.
  assert.doesNotMatch(main, /pickedTone/)
  assert.doesNotMatch(main, /setToneId/)
  assert.doesNotMatch(main, /tone-card/)
  // A restored draft counts as the reader's own choices, not defaults.
  assert.match(main, /restoredDraft/)
})

test('step five is summary-first: summary and length sit above the fold, 篇幅 appears once', () => {
  assert.match(main, /确认你的故事/)
  assert.match(main, /opening-preview--summary/)
  const summaryAt = main.indexOf('opening-preview--summary')
  const detailsAt = main.indexOf('opening-details')
  const lengthAt = main.indexOf('length-picker')
  const modeAt = main.indexOf('<GenerationMode')
  assert.ok(summaryAt > 0 && detailsAt > summaryAt, 'summary block precedes the detail rows')
  assert.ok(lengthAt > detailsAt, 'length picker follows the summary')
  assert.ok(modeAt > lengthAt, 'generation mode follows the length picker')
  // The duplicated static 篇幅 row is gone from the step itself; the
  // picker is the only 篇幅 control on the page, and the side preview
  // panel steps aside on this step so nothing renders twice.
  const stepFive = main.slice(main.indexOf('step === 5 &&'), main.indexOf('className="length-picker"'))
  assert.doesNotMatch(stepFive, /篇幅/)
  assert.match(main, /step !== 5 && \(\s*<PreviewPanel/)
  // The preview sentence is built from the actual spawn hook, never the
  // old hardcoded sci-fi sample.
  assert.match(main, /spawn\?\.hook/)
  assert.doesNotMatch(main, /无法解释的信号/)
  // The summary genre line is two-segment: family · template.
  assert.match(main, /twoSegmentTemplateName/)
})

test('the length picker offers presets, a custom count and endless serialising', () => {
  assert.match(main, /一季 · 24 章/)
  assert.match(main, /长线 · 100 章/)
  assert.match(main, /pickLengthMode\("custom"\)/)
  assert.match(main, /pickLengthMode\("endless"\)/)
  assert.match(main, /无限连载/)
  assert.match(main, /commitCustomLength/)
  assert.match(main, /CUSTOM_LENGTH_MIN/)
  assert.match(main, /storyLengthMode: payload\.storyLengthMode/)
  assert.match(main, /targetChapters: payload\.targetChapters/)
  assert.match(main, /"custom", "endless"\]\.includes\(base\.storyLengthMode\)/)
})

test('reader carries the endless surfaces: serialising position and the manual finish action', () => {
  assert.match(main, /连载中 · 第 \$\{index \+ 1\} 章/)
  assert.match(main, /完结这条线/)
  assert.match(main, /finishEndlessLine/)
  assert.match(main, /mapTotalFor/)
})

test('draft compatibility: world marker kept, seven-step drafts fold into five', () => {
  assert.match(main, /worldChosen:/)
  assert.match(main, /typeof source\.worldChosen === "boolean"/)
  assert.match(main, /const SEVEN_TO_FIVE_STEP = \{ 1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5 \}/)
  assert.match(main, /const migratedDraftStep = \(source\) =>/)
  assert.match(main, /step: migratedDraftStep\(source\)/)
  // Five-step drafts stamp their version so the fold stays idempotent.
  assert.match(main, /flowVersion: 5/)
  assert.match(main, /Number\(source\?\.flowVersion\) >= 5/)
})

test('template and world picks stay decoupled: each selection moves only its own axis', () => {
  // REQ-51: picking a shelf template also clears the free-genre pin —
  // the two are alternatives on the SAME (genre) axis, so the world
  // axis stays untouched exactly as before.
  assert.match(main, /set\(\{ genreTemplateId: item\.id, customGenreText: "" \}\)/)
  assert.match(main, /const selectStage = \(genreId\) => \{\s*set\(\{ genreId, worldChosen: true \}\);/)
  assert.match(main, /const rollCombo = \(\) =>/)
  assert.doesNotMatch(main, /recommendedTemplateFor/)
  assert.doesNotMatch(main, /templateTouched/)
  assert.doesNotMatch(main, /item\.worldId/)
})

test('confirmation rows jump back to their own steps independently', () => {
  assert.match(main, /aria-label="修改题材"/)
  assert.match(main, /aria-label="修改世界"/)
  assert.match(main, /onJump/)
  assert.doesNotMatch(main, /修改题材与世界/)
})

test('every world has shipping artwork wired into WorldArtwork', () => {
  for (const genre of GENRES) assert.ok(artwork.includes(`"${genre.id}"`), genre.id)
  assert.match(styles, /\.template-wall\{/)
  assert.match(styles, /\.template-brick\.selected/)
  assert.match(styles, /\.shelf-brick/)
  assert.match(styles, /\.step-intro/)
})

test('god mode: entry, form and wiring live in the world forge step', () => {
  // Entry is a card on the world screen, not buried in a later step.
  assert.ok(main.includes('创世神模式') && main.includes('世界由你亲手写'))
  assert.ok(main.includes('world-card-god') && main.includes('enterGodMode') && main.includes('exitGodMode'))
  // The form is name, setting and the inspiration sparks. FORGE-TRIM:
  // the craft-choice chips are gone (the craft is step one's pick), and
  // the sparks draw from the 100-hook library, not the retired pool.
  assert.ok(main.includes('customWorldName') && main.includes('CUSTOM_WORLD_NAME_MAX'))
  assert.ok(main.includes('customWorldSetting') && main.includes('CUSTOM_WORLD_SETTING_MAX'))
  assert.ok(main.includes('drawInspirationFragments') && main.includes('fragmentBatch'))
  assert.ok(!main.includes('GOD_MODE_FRAGMENTS') && !main.includes('写法（选填）'))
  // Creation forwards every custom field, not just the template id.
  assert.ok(main.includes('customWorldName: payload.customWorldName'))
  assert.ok(main.includes('customWorldSetting: payload.customWorldSetting'))
})

test('god mode no longer wipes the step-one genre: entry preserves it, exit restores it', () => {
  const entry = main.match(/const enterGodMode = \(\) => \{([\s\S]*?)\};/)
  assert.ok(entry, 'enterGodMode exists')
  assert.doesNotMatch(entry[1], /genreTemplateId/)
  // FORGE-TRIM: nothing in the god form writes the template pin at all
  // any more — the 写法 chips (the only writer of an empty pin) are
  // deleted, so the step-one choice can only be changed at step one.
  assert.doesNotMatch(main, /genreTemplateId: ""/)
  assert.doesNotMatch(main, /这就是第一步选定的题材/)
})

test('god mode: the hard-line setting check gates the world step and creation', () => {
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

test('REQ-71: layered genesis hero, step motion wiring, same-name label fix', () => {
  // The hero is layered generated art now, not a pure-CSS vortex.
  for (const layer of ['hero-genesis-nebula', 'hero-genesis-dust', 'hero-genesis-ring']) {
    assert.ok(main.includes(layer), `hero layer ${layer} is wired`)
  }
  assert.match(styles, /\.genre-hero-orbit--a/)
  assert.match(styles, /sel-mark-pop/)
  // Step changes animate a keyed panel; rolls fire the settle flicker.
  assert.match(main, /className="forge-step-panel" key=\{step\}/)
  assert.match(main, /setRollFx/)
  // 「历史 · 历史」: a shelf and template sharing one name print it once.
  assert.match(main, /shelf\.name === template\.name/)
})
