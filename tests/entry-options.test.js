import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chapterTitleTextFor, createStory } from '../src/story-engine.js'
import { plazaFusionEntryFor } from '../src/fusion.js'
import { createGeminiGenerator } from '../server/gemini.js'

// ---------------------------------------------------------------------------
// ENTRY-OPTIONS: the plaza detail page's three ways in become one
// option-card family (quota stated inside each card, the yellow fee box
// gone, the fusion card honest about its prerequisite), and bare-number
// chapter titles stop printing as 「第 3 章 · 3」 — display falls back,
// generation refuses them outright.
// ---------------------------------------------------------------------------

// ---- Display fallback: a bare number is not a title ------------------------

test('chapterTitleTextFor keeps real titles, trimmed', () => {
  assert.equal(chapterTitleTextFor('潮汐尽头的来信'), '潮汐尽头的来信')
  assert.equal(chapterTitleTextFor('  初声  '), '初声')
  assert.equal(chapterTitleTextFor('第3章 决战'), '第3章 决战')
  assert.equal(chapterTitleTextFor('序章 · 3 号门'), '序章 · 3 号门')
})

test('chapterTitleTextFor blanks bare numbers and empties', () => {
  assert.equal(chapterTitleTextFor('3'), '')
  assert.equal(chapterTitleTextFor(' 12 '), '')
  assert.equal(chapterTitleTextFor('３'), '')
  assert.equal(chapterTitleTextFor(''), '')
  assert.equal(chapterTitleTextFor('   '), '')
  assert.equal(chapterTitleTextFor(null), '')
  assert.equal(chapterTitleTextFor(undefined), '')
  assert.equal(chapterTitleTextFor(3), '')
})

// ---- Fusion entry states ----------------------------------------------------

const line = (id, extra = {}) => ({ id, chapters: [], config: {}, ...extra })

test('fusion entry: no own line at all reads no-line', () => {
  assert.deepEqual(plazaFusionEntryFor({ stories: [], publicationId: 'pub-1' }), { state: 'no-line' })
  // Merged products and read-only copies are not fusion sources.
  assert.deepEqual(
    plazaFusionEntryFor({ stories: [line('m', { kind: 'merged' }), line('r', { readOnly: true })], publicationId: 'pub-1' }),
    { state: 'no-line' },
  )
  // Even a plaza-mine record cannot conjure a line that is not on the shelf.
  assert.deepEqual(
    plazaFusionEntryFor({ stories: [], publicationId: 'pub-1', mine: { ghost: { id: 'pub-1' } } }),
    { state: 'no-line' },
  )
})

test('fusion entry: a line of mine, this publication not yet entered, reads needs-enter', () => {
  assert.deepEqual(
    plazaFusionEntryFor({ stories: [line('mine')], publicationId: 'pub-1' }),
    { state: 'needs-enter' },
  )
})

test('fusion entry: entered or own-published reads ready', () => {
  const entered = line('entered', { config: { sourcePublicationId: 'pub-1' } })
  assert.deepEqual(
    plazaFusionEntryFor({ stories: [line('mine'), entered], publicationId: 'pub-1' }),
    { state: 'ready' },
  )
  assert.deepEqual(
    plazaFusionEntryFor({ stories: [line('mine')], publicationId: 'pub-1', mine: { mine: { id: 'pub-1' } } }),
    { state: 'ready' },
  )
})

// ---- Generation gate: bare-number titles never land -------------------------

const env = { GEMINI_API_KEY: ['unit', 'test', 'fixture'].join('-') }
const genStory = () => ({ ...createStory({ name: '阿遥' }), engine: 'gemini' })
const NARRATION = '潮水沿着石阶一级一级升起来，港里的灯次第亮了，晚归的船在雾里鸣了一声笛。'
const worldBible = {
  premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
  rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
  endingAnchor: '阿遥需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
  outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
}
const goodOutput = {
  title: '潮汐尽头的来信',
  paragraphs: Array.from({ length: 10 }, () => NARRATION.repeat(2)),
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
  worldBible,
}
const bareTitleOutput = { ...goodOutput, title: '3' }
const respond = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })

test('generation gate: a bare-number title is re-asked, then the titled chapter lands', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    random: () => 0,
    fetchImpl: async () => { calls += 1; return respond(calls === 1 ? bareTitleOutput : goodOutput) },
  })
  const result = await generator.generate({ story: genStory(), index: 0 })
  assert.equal(calls, 2, 'the bare-title attempt was retried exactly once')
  assert.equal(result.chapter.title, '潮汐尽头的来信')
})

test('generation gate: a bare-number title every time surfaces an error and nothing lands', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    random: () => 0,
    fetchImpl: async () => { calls += 1; return respond(bareTitleOutput) },
  })
  await assert.rejects(generator.generate({ story: genStory(), index: 0 }), /标题不对/)
  assert.equal(calls, 3, 'initial attempt plus the two bounded retries, then it gives up honestly')
})

// ---- Page wiring: one card family, no yellow box, no engine-speak -----------

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const detailSource = mainSource.slice(
  mainSource.indexOf('function PlazaDetail'),
  mainSource.indexOf('function formatProfileDate'),
)

test('detail page: the three ways in are one option-card family', () => {
  assert.equal(detailSource.match(/<PlazaEntryOption/g)?.length, 3)
  for (const title of ['读原作线', '带我的化身进入', '与我的线合流']) {
    assert.ok(detailSource.includes(`title="${title}"`), `card present: ${title}`)
  }
  // The quota fact rides inside the cards that spend it — and the read
  // card says plainly that it spends nothing.
  assert.ok(detailSource.includes('不消耗你的生成额度'))
  assert.equal(detailSource.match(/新章节会消耗你的生成额度/g)?.length, 2)
})

test('detail page: the yellow fee box is gone everywhere, styles included', () => {
  assert.ok(!mainSource.includes('plaza-fee-note'))
  assert.ok(!stylesSource.includes('.plaza-fee-note'))
})

test('detail and enter pages: no engine-speak in the reader-facing copy', () => {
  assert.ok(!mainSource.includes('捞出'))
  assert.ok(!detailSource.includes('重演'))
  const enterSource = mainSource.slice(
    mainSource.indexOf('function PlazaEnter'),
    mainSource.indexOf('function MergeLineCard'),
  )
  assert.ok(!enterSource.includes('重演'))
  assert.ok(enterSource.includes('新章节的生成费用计入你自己的额度'))
})
