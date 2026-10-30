// GENRE-FREEDOM (REQ-51, 2026-10-30): the genre step's open door.
// Engine-side contracts:
//  - a free genre pins genreTemplateId='custom' + customGenreText and
//    survives the create/restore normalisation verbatim;
//  - a pin without words is not a pin (no empty custom ghosts);
//  - legacy drafts (a stock template, no customGenreText field at all)
//    normalise exactly as before;
//  - the keyword map lands free words on their nearest family, the
//    longest keyword wins, unmapped words fall back to the platform's
//    home family — filing never blocks creating;
//  - a published custom-genre book files under that same family and
//    its enter-template carries the words, so entrants keep telling
//    the entered book's own genre;
//  - the expanded taxonomy (18 families / 26 templates) is complete:
//    every template is a full knowledge-base entry, every family has
//    card art on disk, and the card face carries no internal counts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  CUSTOM_TEMPLATE_ID,
  GENRE_TEMPLATES,
  GENRE_SHELVES,
  createStory,
  plazaSnapshot,
  genreTemplateById,
  shelfArtBase,
  shelfForTemplate,
  customGenreShelfFor,
  customGenreHomeShelfFor,
  customGenreAnchorTemplateId,
} from '../src/story-engine.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const knowledge = JSON.parse(readFileSync(join(root, 'knowledge/genres.json'), 'utf8'))

test('free genre pins custom and survives story creation verbatim', () => {
  const story = createStory({ name: '阿遥', genreTemplateId: CUSTOM_TEMPLATE_ID, customGenreText: '民国谍战' })
  assert.equal(story.config.genreTemplateId, 'custom')
  assert.equal(story.config.customGenreText, '民国谍战')
})

test('a custom pin without words falls back to a stock template', () => {
  const story = createStory({ name: '阿遥', genreTemplateId: CUSTOM_TEMPLATE_ID, customGenreText: '   ' })
  assert.notEqual(story.config.genreTemplateId, 'custom')
  assert.equal(story.config.customGenreText, '')
})

test('legacy drafts normalise exactly as before', () => {
  const story = createStory({ name: '阿遥', genreTemplateId: 'gaowu' })
  assert.equal(story.config.genreTemplateId, 'gaowu')
  assert.equal(story.config.customGenreText, '')
})

test('keyword map lands free words on the nearest family', () => {
  const cases = [
    ['民国谍战', 'lishi'],
    ['赛博侦探', 'xuanyi'],
    ['末世种田', 'moshi'],
    ['灵异复苏', 'lingyi'],
    ['电竞少年', 'dianjing'],
    ['武侠江湖', 'wuxia'],
    ['宫斗', 'yanqing'],
    ['娱乐圈逆袭', 'yule'],
    ['军事演习', 'junshi'],
    ['足球少年', 'tiyu'],
    ['种田经营', 'zhongtian'],
    ['穿书自救', 'chuanyue'],
    ['规则怪谈', 'xuanyi'],
    ['反派洗白', 'fanpai'],
    ['无限副本', 'fuben'],
  ]
  for (const [text, shelfId] of cases) {
    assert.equal(customGenreShelfFor(text)?.id, shelfId, `${text} should file under ${shelfId}`)
  }
})

test('the longest keyword wins over a shorter cross-family hit', () => {
  // 重生 (chuanyue, 2) vs nothing longer in dushi — the rebirth frame
  // is the reader premise of 重生都市， so it files as 穿越重生.
  assert.equal(customGenreShelfFor('重生都市')?.id, 'chuanyue')
  // 规则怪谈 (4) beats any 2-char stray.
  assert.equal(customGenreShelfFor('深夜规则怪谈实录')?.id, 'xuanyi')
})

test('unmapped words never block: home shelf and anchor fall back', () => {
  assert.equal(customGenreShelfFor('蒸汽朋克黄铜城'), null)
  assert.equal(customGenreHomeShelfFor('蒸汽朋克黄铜城')?.id, 'xuanzhen')
  assert.equal(customGenreAnchorTemplateId('蒸汽朋克黄铜城'), 'xuanhuan')
  assert.equal(customGenreAnchorTemplateId('民国谍战'), 'lishi')
  assert.equal(customGenreAnchorTemplateId('赛博侦探'), 'horror')
})

test('a published custom-genre book files under its home shelf', () => {
  const story = createStory({ name: '阿遥', genreTemplateId: CUSTOM_TEMPLATE_ID, customGenreText: '民国谍战' })
  const snapshot = plazaSnapshot(story)
  assert.equal(snapshot.genreTemplateId, 'custom')
  assert.equal(snapshot.config.manualShelfId, 'lishi')
  assert.equal(snapshot.enterTemplate.config.customGenreText, '民国谍战')
  assert.equal(snapshot.enterTemplate.config.genreTemplateId, 'custom')
})

test('a published stock-template book carries no custom filing', () => {
  const story = createStory({ name: '阿遥', genreTemplateId: 'gaowu' })
  const snapshot = plazaSnapshot(story)
  assert.equal(snapshot.genreTemplateId, 'gaowu')
  assert.equal(snapshot.enterTemplate.config.customGenreText, '')
})

test('the taxonomy is 18 families and 26 complete templates', () => {
  assert.equal(GENRE_SHELVES.length, 18)
  assert.equal(GENRE_TEMPLATES.length, 26)
  assert.equal(knowledge.genres.length, 26)
  const knowledgeIds = new Set(knowledge.genres.map((entry) => entry.id))
  for (const template of GENRE_TEMPLATES) {
    assert.ok(knowledgeIds.has(template.id), `${template.id} missing from knowledge/genres.json`)
    assert.equal(shelfForTemplate(template.id)?.templateIds.includes(template.id), true)
  }
  for (const entry of knowledge.genres) {
    assert.equal(entry.archetypes.length, 3, `${entry.id} archetypes`)
    assert.equal(entry.beats.length, 6, `${entry.id} beats`)
    assert.ok(entry.beats.every((beat, index) => beat.chapter === index + 1), `${entry.id} beat chapters`)
    assert.ok(entry.conflictEngine?.want && entry.conflictEngine?.obstacle && entry.conflictEngine?.cost, `${entry.id} conflict engine`)
    assert.ok(entry.pleasures.length >= 5, `${entry.id} pleasures`)
    assert.ok(entry.worldSkeleton.length >= 5, `${entry.id} world skeleton`)
    assert.ok(entry.hooks.length >= 3 && entry.pitfalls.length >= 3, `${entry.id} hooks/pitfalls`)
    assert.ok(entry.readerPromise.length > 20, `${entry.id} reader promise`)
  }
})

test('every family has card art on disk at both sizes', () => {
  for (const shelf of GENRE_SHELVES) {
    const base = shelfArtBase(shelf)
    assert.ok(existsSync(join(root, 'public/art', `${base}-640.webp`)), `${shelf.id} art 640 (${base})`)
    assert.ok(existsSync(join(root, 'public/art', `${base}-1122.webp`)), `${shelf.id} art 1122 (${base})`)
  }
})

test('card faces carry no internal counts and the step leads with free creation', () => {
  const main = readFileSync(join(root, 'src/main.jsx'), 'utf8')
  assert.ok(!main.includes('种写法'), 'the 「N 种写法」 count copy is gone')
  assert.ok(main.includes('自由创世'), 'the free-creation hero leads the step')
  assert.ok(main.includes('没灵感？试试从分类里找'), 'the shelves sit behind the user-worded door')
  assert.ok(main.includes('genre-hero-vortex'), 'the black-hole vortex region exists')
  assert.ok(genreTemplateById('wuxia') && genreTemplateById('zhongtian'), 'expansion templates resolve')
})
