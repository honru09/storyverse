import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiGenerator } from '../server/gemini.js'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chapterTitleBandDistanceFor,
  chapterTitleBandRangeFor,
  chapterTitleFitFor,
  createStory,
  queueIntervention,
} from '../src/story-engine.js'

/*
 * 章节标题分档校验 (title-band check): the KB bands of §57 steered
 * titles by prompt alone, and the REQ-69 walkthrough measured a 都市
 * book landing 19–20 字 titles against the long band's 8–16. The
 * generator now checks each validated chapter's title against the
 * same band the prompt named, re-asks ONCE inside the same request
 * for the title only, and — when the answer still misses — keeps the
 * closer of the two. The chapter itself is never blocked.
 */

const vertexEnv = {
  GENAI_BACKEND: 'vertex',
  GOOGLE_CLOUD_PROJECT: 'storyweave-fixture',
  GOOGLE_CLOUD_LOCATION: 'global',
}
const devEnv = { GEMINI_API_KEY: 'title-band-test-key' }

const PARAGRAPHS = [
  '阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。',
  '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
  '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
]
const SUMMARY = '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。'
const BIBLE = {
  premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
  rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
  endingAnchor: '阿遥需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
  outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
}
const chapterOutput = (title, opening) => ({
  title,
  paragraphs: PARAGRAPHS,
  summary: SUMMARY,
  ...(opening ? { worldBible: BIBLE } : {}),
})

const len = (text) => [...text].length

const gaowuStory = () => ({ ...createStory({ name: '沈砚', genreId: 'mist', genreTemplateId: 'gaowu' }), engine: 'gemini' })
const xianxiaStory = () => ({ ...createStory({ name: '沈砚', genreId: 'cultivation', genreTemplateId: 'xianxia' }), engine: 'gemini' })
const urbanStory = () => ({ ...createStory({ name: '陆鸣', genreId: 'city', genreTemplateId: 'urban' }), engine: 'gemini' })
const acceptLocal = (current, index) => acceptChapter(current, buildChapter(current, index), chapterKey(current, index))

/*
 * A Vertex stub that serves one chapter and, for the title-only
 * re-ask (recognised by its small output budget), one replacement
 * title. `calls` records the sequence so a test can prove whether
 * the re-ask happened at all.
 */
const makeVertexGenerator = ({ chapterTitle, retryTitle = '', retryError = null, opening = true }) => {
  const calls = []
  const generator = createGeminiGenerator({
    env: vertexEnv,
    sleep: async () => {},
    vertexGenerate: async (request) => {
      const isTitleCall = request.config.maxOutputTokens === 256
      calls.push({ kind: isTitleCall ? 'title' : 'chapter', input: request.contents[0].parts[0].text })
      if (isTitleCall) {
        if (retryError) throw retryError
        return {
          text: JSON.stringify({ title: retryTitle }),
          finishReason: 'STOP',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }
      }
      return {
        text: JSON.stringify(chapterOutput(chapterTitle, opening)),
        finishReason: 'STOP',
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
      }
    },
  })
  return { calls, generator }
}

// --- engine: band ranges and distance are one source ----------------------

test('band ranges: three bands, upgrade shifts, unknown template falls back to standard', () => {
  assert.deepEqual(chapterTitleBandRangeFor('gaowu'), { band: 'standard', label: '标准事件档', min: 4, max: 10 })
  assert.deepEqual(chapterTitleBandRangeFor('gaowu', { upgrade: true }), { band: 'standard', label: '标准事件档', min: 6, max: 14 })
  assert.deepEqual(chapterTitleBandRangeFor('xianxia'), { band: 'duizhang', label: '对仗档', min: 4, max: 13 })
  assert.deepEqual(chapterTitleBandRangeFor('xianxia', { upgrade: true }), { band: 'duizhang', label: '对仗档', min: 8, max: 16 })
  assert.deepEqual(chapterTitleBandRangeFor('urban'), { band: 'long', label: '长解说档', min: 8, max: 16 })
  assert.deepEqual(chapterTitleBandRangeFor('urban', { upgrade: true }), { band: 'long', label: '长解说档', min: 10, max: 16 })
  assert.equal(chapterTitleBandRangeFor('no-such-template').band, 'standard')
})

test('band distance: zero inside, distance to the nearer edge outside', () => {
  assert.equal(chapterTitleBandDistanceFor(7, 'urban'), 1) // below the 8 floor
  assert.equal(chapterTitleBandDistanceFor(20, 'urban'), 4) // above the 16 ceiling
  assert.equal(chapterTitleBandDistanceFor(12, 'gaowu'), 2)
  assert.equal(chapterTitleBandDistanceFor(12, 'gaowu', { upgrade: true }), 0) // upgrade band 6–14 holds it
  assert.equal(chapterTitleBandDistanceFor(2, 'xianxia'), 2)
  assert.equal(chapterTitleBandDistanceFor(9, 'xianxia'), 0)
})

// --- generator: the check on every shape of chapter ------------------------

test('a fitting title is never re-asked (standard band)', async () => {
  const title = '沈砚借到第一缕火'
  assert.equal(len(title), 8)
  assert.equal(chapterTitleFitFor(title, 'gaowu').fits, true)
  const { calls, generator } = makeVertexGenerator({ chapterTitle: title })
  const result = await generator.generate({ story: gaowuStory(), index: 0 })
  assert.equal(result.chapter.title, title)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter'])
})

test('standard band: an over-band title is re-asked once, the fitting answer lands, usage merges', async () => {
  const original = '沈砚在雨夜里借到第一缕火光'
  const retry = '沈砚借到火'
  assert.equal(len(original), 13)
  assert.equal(len(retry), 5)
  assert.equal(chapterTitleFitFor(original, 'gaowu').fits, false)
  const { calls, generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: retry })
  const logged = []
  const write = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { logged.push(String(chunk)); return true }
  let result
  try {
    result = await generator.generate({ story: gaowuStory(), index: 0 })
  } finally {
    process.stderr.write = write
  }
  assert.equal(result.chapter.title, retry)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter', 'title'])
  // The re-ask carries the explicit band and the offending title.
  assert.match(calls[1].input, /4–10 字/)
  assert.match(calls[1].input, new RegExp(original))
  // Both provider calls meter into the chapter's usage.
  assert.equal(result.usage.promptTokenCount, 110)
  assert.equal(result.usage.totalTokenCount, 165)
  // The miss left its observable record (lengths only, no title text).
  const record = logged.map((line) => { try { return JSON.parse(line) } catch { return null } }).find((entry) => entry?.type === 'chapter-title-band')
  assert.ok(record, 'a chapter-title-band log line is written')
  assert.equal(record.band, 'standard')
  assert.equal(record.originalLength, 13)
  assert.equal(record.candidateLength, 5)
  assert.equal(record.chosenLength, 5)
  assert.equal(record.outcome, 'reasked-fits')
  assert.equal(JSON.stringify(record).includes(original), false)
})

test('long band (the walkthrough case): a 20-字 title, a still-over but closer answer lands', async () => {
  const original = '陆鸣被裁那天回到长宁街当众算清了三年的账'
  const retry = '陆鸣被裁那天在长宁街算清了三年的账'
  assert.equal(len(original), 20)
  assert.equal(len(retry), 17)
  assert.equal(chapterTitleFitFor(original, 'urban').fits, false)
  assert.equal(chapterTitleFitFor(retry, 'urban').fits, false) // 17 still misses 8–16…
  const { calls, generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: retry })
  const result = await generator.generate({ story: urbanStory(), index: 0 })
  assert.equal(result.chapter.title, retry) // …but it is closer, so it lands and the chapter ships
  assert.deepEqual(calls.map((call) => call.kind), ['chapter', 'title'])
  assert.match(calls[1].input, /8–16 字/)
})

test('long band: a farther re-ask answer loses to the original title', async () => {
  const original = '陆鸣被裁那天回到长宁街当众算清了三年的账'
  const retry = '陆鸣被裁那天回到长宁街当着所有人的面算清了三年的账'
  assert.equal(len(original), 20)
  assert.equal(len(retry), 25)
  const { generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: retry })
  const result = await generator.generate({ story: urbanStory(), index: 0 })
  assert.equal(result.chapter.title, original)
})

test('duizhang band: a below-band title is re-asked and the fitting answer lands', async () => {
  const original = '开战'
  const retry = '秘境开启沈砚借火'
  assert.equal(len(original), 2)
  assert.equal(len(retry), 8)
  assert.deepEqual(chapterTitleFitFor(original, 'xianxia').issues, ['below-band'])
  const { calls, generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: retry })
  const result = await generator.generate({ story: xianxiaStory(), index: 0 })
  assert.equal(result.chapter.title, retry)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter', 'title'])
})

test('upgrade chapter: a title past the plain band but inside the shifted band is NOT re-asked', async () => {
  const title = '沈砚登台当众夺下本季头名'
  assert.equal(len(title), 12)
  assert.equal(chapterTitleFitFor(title, 'gaowu').fits, false) // plain standard band 4–10 misses it
  assert.equal(chapterTitleFitFor(title, 'gaowu', { upgrade: true }).fits, true) // finale band 6–14 holds it
  let story = gaowuStory()
  for (let index = 0; index < 5; index += 1) story = acceptLocal(story, index)
  const { calls, generator } = makeVertexGenerator({ chapterTitle: title, opening: false })
  const result = await generator.generate({ story, index: 5 })
  assert.equal(result.chapter.title, title)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter'])
})

test('continuation (the pre-generation shape): the check fires past the opening too', async () => {
  const original = '沈砚在雨夜里借到第一缕火光'
  const retry = '沈砚借到火'
  let story = gaowuStory()
  story = acceptLocal(story, 0)
  const { calls, generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: retry, opening: false })
  const result = await generator.generate({ story, index: 1 })
  assert.equal(result.chapter.title, retry)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter', 'title'])
})

test('intervention revision: the regenerated chapter is checked on the same path', async () => {
  const original = '灯塔在午夜熄灭之后港口的人第一次听见潮汐说话'
  const retry = '灯塔熄灭那一夜'
  assert.equal(len(original), 22) // past every plain band's ceiling
  let story = { ...createStory({ name: '阿遥' }), engine: 'gemini', readerIndex: 0 }
  story = acceptLocal(acceptLocal(story, 0), 1)
  story = queueIntervention(story, { text: '让灯塔的灯今晚熄灭一次', readerIndex: 0 })
  const { calls, generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: retry, opening: false })
  const result = await generator.generate({ story, index: 1, mode: 'revise' })
  assert.equal(result.chapter.title, retry)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter', 'title'])
  assert.deepEqual(result.chapter.interventions, [{ text: '让灯塔的灯今晚熄灭一次', kind: 'text' }])
})

test('a failing re-ask never blocks the chapter: the original title ships', async () => {
  const original = '沈砚在雨夜里借到第一缕火光'
  const { calls, generator } = makeVertexGenerator({ chapterTitle: original, retryError: new Error('provider down') })
  const result = await generator.generate({ story: gaowuStory(), index: 0 })
  assert.equal(result.chapter.title, original)
  assert.equal(result.chapter.paragraphs.length, 3)
  assert.deepEqual(calls.map((call) => call.kind), ['chapter', 'title'])
})

test('a bare-number re-ask answer is refused as a candidate, the original ships', async () => {
  const original = '沈砚在雨夜里借到第一缕火光'
  const { generator } = makeVertexGenerator({ chapterTitle: original, retryTitle: '3' })
  const result = await generator.generate({ story: gaowuStory(), index: 0 })
  assert.equal(result.chapter.title, original)
})

test('developer API path: the same check and re-ask run over fetch', async () => {
  const original = '沈砚在雨夜里借到第一缕火光'
  const retry = '沈砚借到火'
  const kinds = []
  const reply = (value, usageMetadata) => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
    ...(usageMetadata ? { usageMetadata } : {}),
  }), { status: 200 })
  const generator = createGeminiGenerator({
    env: devEnv,
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      const isTitleCall = body.generationConfig.maxOutputTokens === 256
      kinds.push(isTitleCall ? 'title' : 'chapter')
      return isTitleCall
        ? reply({ title: retry }, { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 })
        : reply(chapterOutput(original, true), { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 })
    },
  })
  const result = await generator.generate({ story: gaowuStory(), index: 0 })
  assert.equal(result.chapter.title, retry)
  assert.deepEqual(kinds, ['chapter', 'title'])
  assert.equal(result.usage.totalTokenCount, 165)
})
