// READER-PARA: display-layer paragraphing for wall-shaped legacy
// chapters, and the generation-side paragraph-shape gate. The display
// half must be lossless (whitespace aside), conservative (cuts only at
// sentence ends) and identity-preserving for healthy chapters; the
// generation half must refuse a wall chapter through the existing
// retry loop so it never lands.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptChapter,
  buildChapter,
  chapterForReading,
  chapterKey,
  createStory,
  displayParagraphsFor,
  paragraphsNeedSegmentation,
  segmentTextForDisplay,
} from '../src/story-engine.js'
import { createGeminiGenerator } from '../server/gemini.js'

const strip = (value) => String(value).replace(/\s+/g, '')
// One narration sentence, 46 characters including the full stop.
const NARRATION = '潮水沿着石阶一级一级升起来，港里的灯次第亮了，晚归的船在雾里鸣了一声笛。'
const DIALOGUE = '「今晚的潮不对。」守灯人说，「它在往回走，像有什么东西在海底拽它。」'
const wallText = (sentences = 36) => Array.from({ length: sentences }, () => NARRATION).join('')

test('need decision: healthy shapes never trigger, wall shapes always do', () => {
  assert.equal(paragraphsNeedSegmentation(null), false)
  assert.equal(paragraphsNeedSegmentation([]), false)
  // A normal generated chapter: many mid-length paragraphs.
  assert.equal(paragraphsNeedSegmentation(Array.from({ length: 10 }, () => '段'.repeat(180))), false)
  // Below the total floor even a single paragraph is left alone.
  assert.equal(paragraphsNeedSegmentation(['段'.repeat(500)]), false)
  // Three fat paragraphs (the reported shape).
  assert.equal(paragraphsNeedSegmentation(Array.from({ length: 3 }, () => '段'.repeat(650))), true)
  // Two paragraphs over the 1000-char scarce-paragraph rule.
  assert.equal(paragraphsNeedSegmentation(['段'.repeat(550), '段'.repeat(550)]), true)
  // One wall hiding among healthy paragraphs: max rule.
  assert.equal(paragraphsNeedSegmentation([...Array.from({ length: 7 }, () => '段'.repeat(150)), '段'.repeat(500)]), true)
  // Average rule: nothing extreme, everything merely long.
  assert.equal(paragraphsNeedSegmentation(Array.from({ length: 6 }, () => '段'.repeat(330))), true)
})

test('pure narration wall: re-cut into the target band, losslessly', () => {
  const wall = wallText()
  const display = segmentTextForDisplay(wall)
  assert.ok(display.length >= 10, `expected many paragraphs, got ${display.length}`)
  assert.ok(display.every((paragraph) => paragraph.length <= 200), 'no display paragraph is a wall')
  assert.ok(display.every((paragraph) => paragraph.length >= 40), 'no display paragraph is a fragment')
  assert.equal(strip(display.join('')), strip(wall), 'every character survives, only breaks are added')
})

test('dialogue stands on its own; a colon lead-in keeps its quote', () => {
  const lead = '守灯人把煤油灯放上窗台，盯着海面看了很久，终于开口说道：'
  const wall = [NARRATION.repeat(4), DIALOGUE, NARRATION.repeat(4), lead + '「明早之前，不要让任何人下水。」', NARRATION.repeat(4)].join('')
  const display = segmentTextForDisplay(wall)
  const dialogueParagraph = display.find((paragraph) => paragraph.startsWith('「今晚的潮不对。」'))
  assert.ok(dialogueParagraph, 'the quoted speech opens its own paragraph')
  assert.ok(!dialogueParagraph.includes('潮水沿着'), 'the dialogue paragraph carries no narration tail')
  const leadParagraph = display.find((paragraph) => paragraph.includes('终于开口说道：'))
  assert.ok(leadParagraph.includes('「明早之前'), 'the colon lead-in and its quote stay in one paragraph')
  assert.equal(strip(display.join('')), strip(wall))
})

test('unclosed quote: no crash, cuts still fall only on sentence ends', () => {
  const wall = '他推开门，海风灌进来。' + '「你们听我说，这件事从头到尾都是一个局，先是潮汐倒退，然后是钟声，然后是我们所有人，一个都跑不了。'.repeat(3)
    + Array.from({ length: 12 }, () => NARRATION).join('')
  const display = segmentTextForDisplay(wall)
  assert.ok(display.length >= 4, `expected several paragraphs, got ${display.length}`)
  for (const paragraph of display.slice(0, -1)) {
    assert.match(paragraph, /[。！？；…”」』]$/, `paragraph ends mid-sentence: …${paragraph.slice(-12)}`)
  }
  assert.equal(strip(display.join('')), strip(wall))
})

test('healthy chapters return the identical array; the view keeps identity', () => {
  const healthy = Array.from({ length: 9 }, (_, index) => `第${index + 1}段，海风穿过长街。` + '他记得那片海。'.repeat(12))
  assert.equal(displayParagraphsFor(healthy), healthy)
  const short = ['只有一段的极短章。']
  assert.equal(displayParagraphsFor(short), short)
})

test('only the wall paragraphs are re-cut; healthy ones pass through byte-identical', () => {
  const healthy = '短短的一段对话。「我回来了。」'
  const chapters = [healthy, wallText(20), healthy]
  const display = displayParagraphsFor(chapters)
  assert.equal(display[0], healthy)
  assert.equal(display.at(-1), healthy)
  assert.ok(display.length > chapters.length)
  assert.equal(strip(display.join('')), strip(chapters.join('')))
})

test('chapterForReading segments the view and never touches the stored chapter', () => {
  let story = { ...createStory({ name: '阿遥' }), engine: 'gemini' }
  story = acceptChapter(story, buildChapter(story, 0), chapterKey(story, 0))
  const wall = wallText()
  const stored = { ...story, chapters: [{ ...story.chapters[0], paragraphs: [wall] }] }
  const view = chapterForReading(stored, 0)
  assert.notEqual(view, stored.chapters[0])
  assert.ok(view.paragraphs.length >= 10, `view re-paragraphed (${view.paragraphs.length})`)
  assert.deepEqual(stored.chapters[0].paragraphs, [wall], 'stored paragraphs are still the wall, untouched')
  assert.equal(strip(view.paragraphs.join('')), strip(wall))
  // A healthy chapter keeps object identity through the same view.
  const healthyStory = { ...stored, chapters: [{ ...story.chapters[0], paragraphs: Array.from({ length: 9 }, () => '海风穿过长街，他放慢脚步。'.repeat(8)) }] }
  assert.equal(chapterForReading(healthyStory, 0), healthyStory.chapters[0])
})

// ---- Generation-side gate -------------------------------------------------

const env = { GEMINI_API_KEY: ['unit', 'test', 'fixture'].join('-') }
const genStory = () => ({ ...createStory({ name: '阿遥' }), engine: 'gemini' })
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
const wallOutput = {
  ...goodOutput,
  paragraphs: Array.from({ length: 3 }, () => NARRATION.repeat(13)),
}
const respond = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })

test('generation gate: a wall chapter is re-asked through the retry loop, then the good one lands', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    random: () => 0,
    fetchImpl: async () => { calls += 1; return respond(calls === 1 ? wallOutput : goodOutput) },
  })
  const result = await generator.generate({ story: genStory(), index: 0 })
  assert.equal(calls, 2, 'the wall attempt was retried exactly once before the good sample')
  assert.equal(result.chapter.paragraphs.length, 10)
  assert.ok(Math.max(...result.chapter.paragraphs.map((paragraph) => paragraph.length)) <= 420)
})

test('generation gate: a wall every time surfaces an error and nothing lands', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    random: () => 0,
    fetchImpl: async () => { calls += 1; return respond(wallOutput) },
  })
  await assert.rejects(generator.generate({ story: genStory(), index: 0 }), /段落太长/)
  assert.equal(calls, 3, 'initial attempt plus the two bounded retries, then it gives up honestly')
})
