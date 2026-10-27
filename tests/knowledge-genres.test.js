import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GENRE_TEMPLATES } from '../src/story-engine.js'

// The knowledge base and the engine's category list are two views of the
// same fourteen templates; this file locks their agreement and the shape
// conventions every template (old and new) must keep.
const knowledge = JSON.parse(readFileSync(new URL('../knowledge/genres.json', import.meta.url), 'utf8'))
const byId = Object.fromEntries(knowledge.genres.map((genre) => [genre.id, genre]))
const NEW_IDS = ['gaowu', 'campus', 'horror', 'guize-guatan', 'wuxianliu', 'lishi']

test('knowledge base holds exactly the fourteen engine templates, in sync', () => {
  assert.equal(knowledge.genres.length, 14)
  assert.deepEqual(
    knowledge.genres.map((genre) => genre.id).sort(),
    GENRE_TEMPLATES.map((template) => template.id).sort(),
  )
})

test('every template keeps the shared shape and the season-beat conventions', () => {
  for (const genre of knowledge.genres) {
    assert.equal(genre.archetypes.length, 3, genre.id)
    assert.equal(genre.beats.length, 6, genre.id)
    assert.deepEqual(genre.beats.map((beat) => beat.chapter), [1, 2, 3, 4, 5, 6], genre.id)
    assert.equal(genre.hooks.length, 3, genre.id)
    assert.equal(genre.pleasures.length, 5, genre.id)
    assert.equal(genre.pitfalls.length, 3, genre.id)
    assert.ok(genre.readerPromise.length >= 10, genre.id)
    assert.ok(genre.worldSkeleton.length >= 5, genre.id)
    for (const field of ['want', 'obstacle', 'cost']) assert.ok(genre.conflictEngine[field], `${genre.id}.${field}`)
    // Chapters 2 and 4 end on the eve of a reader decision (all templates).
    assert.ok(genre.beats[1].hook.includes('选择前夜'), `${genre.id} beat 2 hook`)
    assert.ok(genre.beats[3].hook.includes('选择前夜'), `${genre.id} beat 4 hook`)
  }
})

test('the six new templates follow the shuangwen conventions end to end', () => {
  for (const id of NEW_IDS) {
    const genre = byId[id]
    assert.ok(genre, id)
    // Beats 3 and 5 open by cashing in the reader's previous choice, and
    // the season closes with an explicit settlement.
    assert.ok(genre.beats[2].beat.startsWith('兑现选择后果'), `${id} beat 3`)
    assert.ok(genre.beats[4].beat.startsWith('兑现选择后果'), `${id} beat 5`)
    assert.ok(genre.beats[5].beat.includes('结算'), `${id} beat 6 settlement`)
    // Every new template names an enumerable ruler somewhere in its skeleton.
    assert.ok(genre.worldSkeleton.some((line) => /标尺|榜|排名|名次|等级|积分|官品|点数|阶位/.test(line)), `${id} ruler`)
  }
})

test('no template carries a world binding anywhere in the knowledge base', () => {
  for (const genre of knowledge.genres) {
    assert.equal('engineGenres' in genre, false, genre.id)
    assert.equal('worldId' in genre, false, genre.id)
  }
})

test('xianxia carries the default 爽口径 pace preset; scifi carries the cyber branch', () => {
  const pace = byId.xianxia.pacePreset
  assert.ok(pace, 'xianxia pacePreset')
  assert.ok(pace.name.includes('爽口径'))
  assert.ok(pace.goldenFinger.includes('第 1 章明牌'))
  assert.ok(pace.receipt.includes('回执'))
  assert.ok(pace.cost.includes('操作化'))
  const cyber = byId.scifi.branches?.find((branch) => branch.id === 'cyber')
  assert.ok(cyber, 'scifi cyber branch')
  assert.ok(cyber.ruler.includes('义体档位'))
  assert.ok(cyber.note.includes('身份跃升'))
})
