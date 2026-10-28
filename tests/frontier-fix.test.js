import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiGenerator } from '../server/gemini.js'
import {
  acceptChapter,
  advanceOpenedThrough,
  beginChapterReroll,
  buildChapter,
  chapterKey,
  createStory,
  frontierChapterIndex,
  isFrontierChapter,
  openedThroughIndex,
  replaceFrontierChapter,
  updateChapterProse,
} from '../src/story-engine.js'
import { acceptRerolledChapter, nextGenerationIndex } from '../src/generation.js'
import { moveReadingPosition, readerIndexFor } from '../src/reading-flow.js'
import { emptyLibrary, validateLibrary } from '../src/persistence.js'

// ---------------------------------------------------------------------------
// FRONTIER-FIX (回归 P2 / N-02 / F-30): the frontier finalises when the
// reader OPENS the next chapter, not when the next chapter is generated.
// Four paths: (1) a landed pre-generation leaves the chapter being read
// editable; (2) opening the next chapter locks it; (3) changing the
// frontier chapter first retires the landed pre-generation, which is
// then rebuilt from the new text; (4) read-only lines are untouched.
// ---------------------------------------------------------------------------

const env = { GEMINI_API_KEY: 'test-key-never-used-on-network' }
const accept = (story, index) => acceptChapter(story, buildChapter(story, index), chapterKey(story, index))
const prose = (marker) => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    `${marker}：阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。`,
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
})
const response = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 })
const generatorCapturing = (capture, marker = '新版正文') => createGeminiGenerator({
  env,
  fetchImpl: async (_url, options) => {
    capture.body = JSON.parse(options.body)
    capture.input = capture.body.contents[0].parts[0].text
    return response(prose(marker))
  },
})

// A Gemini book whose reader stands on chapter two (index 1) while
// chapter three (index 2) has already been pre-generated into the
// record — the exact state that used to lock chapter two instantly.
const storyWithLandedPregeneration = () => {
  let story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  story = moveReadingPosition(story, 1)
  story = accept(story, 2)
  return { ...story, engine: 'gemini' }
}

// --- the watermark itself ---------------------------------------------------

test('watermark: advancing is monotonic and clamps to the chapters on record', () => {
  let story = accept(accept(createStory({ name: '阿遥' }), 0), 1)
  story = advanceOpenedThrough(story, 1)
  assert.equal(story.openedThrough, 1)
  const back = advanceOpenedThrough(story, 0)
  assert.strictEqual(back, story, 'wandering back re-opens nothing')
  const shrunk = { ...story, chapters: story.chapters.slice(0, 1), openedThrough: 9 }
  assert.equal(openedThroughIndex(shrunk), 0, 'the resolved watermark never points past the last chapter')
  assert.equal(openedThroughIndex({ ...story, openedThrough: undefined }), 1, 'no field: the legacy fallback is the last chapter')
})

test('watermark: the first recorded open on a legacy record seeds behind the last chapter', () => {
  // Four chapters written, no watermark: chapters 0-2 were necessarily
  // opened for chapter 3 to exist; chapter 3 itself may be an unopened
  // pre-generation, so re-reading chapter 0 must not unlock history —
  // the seed lands on 2, and only truly opening chapter 3 advances it.
  let story = accept(accept(accept(accept(createStory({ name: '阿遥' }), 0), 1), 2), 3)
  assert.equal(story.openedThrough, undefined)
  const rereading = advanceOpenedThrough(story, 0)
  assert.equal(rereading.openedThrough, 2)
  assert.equal(frontierChapterIndex(rereading), 2)
  assert.equal(isFrontierChapter(rereading, 0), false)
  assert.equal(isFrontierChapter(rereading, 3), false)
  const opened = advanceOpenedThrough(rereading, 3)
  assert.equal(opened.openedThrough, 3)
  assert.equal(frontierChapterIndex(opened), 3)
})

test('watermark: the field validates and persists like readerIndex', () => {
  const story = storyWithLandedPregeneration()
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), stories: [story] }), [])
  const negative = { ...story, openedThrough: -1 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [negative] })
    .some((error) => error.includes('openedThrough must be a non-negative integer')))
  const fractional = { ...story, openedThrough: 1.5 }
  assert.ok(validateLibrary({ ...emptyLibrary(), stories: [fractional] })
    .some((error) => error.includes('openedThrough must be a non-negative integer')))
})

// --- path 1: pre-generated, unopened — the chapter stays editable -----------

test('path 1: a landed pre-generation does not lock the chapter being read', async () => {
  const story = storyWithLandedPregeneration()
  assert.equal(story.chapters.length, 3, 'the next chapter is already in the record')
  assert.equal(openedThroughIndex(story), 1)
  assert.equal(frontierChapterIndex(story), 1)
  assert.equal(isFrontierChapter(story, 1), true)
  assert.equal(isFrontierChapter(story, 2), false, 'the unopened pre-generation is not the frontier either')
  // Both levers work on chapter two.
  const edited = updateChapterProse(story, 1, ['阿遥改过的第二章第一段。', '第二段也换了。'])
  assert.notStrictEqual(edited, story)
  assert.doesNotThrow(() => beginChapterReroll(story, 1))
  // The server judges by the same rule: a re-roll of chapter two is
  // accepted even with chapter three still attached to the record.
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story, index: 1, mode: 'reroll' })
  assert.equal(result.chapter.index, 1)
  assert.equal(result.key, chapterKey(story, 1))
})

// --- path 2: opening the next chapter finalises this one ---------------------

test('path 2: opening the next chapter locks the previous one, for good', async () => {
  const story = storyWithLandedPregeneration()
  const opened = moveReadingPosition(story, 2)
  assert.equal(opened.openedThrough, 2)
  assert.equal(frontierChapterIndex(opened), 2)
  assert.equal(isFrontierChapter(opened, 1), false)
  assert.strictEqual(updateChapterProse(opened, 1, ['改不动了。']), opened)
  assert.throws(() => beginChapterReroll(opened, 1), /只有正在读的这一章还能换一版/)
  // Wandering back to re-read changes nothing: the lock is permanent.
  const back = moveReadingPosition(opened, 0)
  assert.equal(back.openedThrough, 2)
  assert.strictEqual(updateChapterProse(back, 1, ['还是改不动。']), back)
  // The server agrees: chapter two refuses, the frontier (chapter
  // three, now being read) accepts — the frontier moved on, not away.
  const generator = createGeminiGenerator({ env, fetchImpl: async () => response(prose('新版正文')) })
  await assert.rejects(generator.generate({ story: opened, index: 1, mode: 'reroll' }),
    (error) => error.status === 409)
  const result = await generator.generate({ story: opened, index: 2, mode: 'reroll' })
  assert.equal(result.chapter.index, 2)
  // And the unopened pre-generation itself was never a re-roll target.
  await assert.rejects(generator.generate({ story, index: 2, mode: 'reroll' }),
    (error) => error.status === 409)
})

test('path 2 (race): a re-roll in flight loses to the reader opening the next chapter', () => {
  const story = storyWithLandedPregeneration()
  const rotated = beginChapterReroll(story, 1)
  const rerolled = buildChapter(rotated, 1)
  const key = chapterKey(rotated, 1)
  // The preparation rebuilds chapter three, the reader opens it — and
  // only then does the late re-roll answer arrive. It is refused whole.
  const reprepared = accept(rotated, 2)
  const opened = moveReadingPosition(reprepared, 2)
  assert.strictEqual(replaceFrontierChapter(opened, rerolled, key), opened)
  assert.strictEqual(acceptRerolledChapter(opened, { chapter: rerolled, key }), opened)
  // Without the opening, the same answer lands cleanly.
  const landed = replaceFrontierChapter(reprepared, rerolled, key)
  assert.notStrictEqual(landed, reprepared)
  assert.deepEqual(landed.chapters[1], rerolled)
})

test('path 2 (race): a preparation fired mid-re-roll cannot land behind the new telling', () => {
  const story = storyWithLandedPregeneration()
  const rotated = beginChapterReroll(story, 1)
  // While the re-roll pass is in flight, the preparation effect fires
  // against the rotated record and its answer lands first — briefed on
  // the old telling, keyed to the rotated revision.
  const midPass = accept(rotated, 2)
  assert.equal(midPass.chapters.length, 3)
  // The re-roll answer lands: the swap drops that copy whole…
  const landed = acceptRerolledChapter(midPass, { chapter: buildChapter(rotated, 1), key: chapterKey(rotated, 1) })
  assert.notStrictEqual(landed, midPass)
  assert.equal(landed.chapters.length, 2)
  assert.equal(landed.revision, rotated.revision + 1, 'landing the swap rotated the revision again')
  // …and a second copy of the mid-pass answer, arriving late, is stale:
  // its key predates the swap, so the accept refuses it and the slot
  // re-prepares from the new telling instead.
  const lateCopy = buildChapter(rotated, 2)
  assert.strictEqual(acceptChapter(landed, lateCopy, chapterKey(rotated, 2)), landed)
  const rebuilt = accept(landed, 2)
  assert.equal(rebuilt.chapters.length, 3)
})

// --- path 3: changing the frontier retires the landed pre-generation ---------

test('path 3: a prose edit drops the landed pre-generation and it is rebuilt from the edited text', async () => {
  const story = storyWithLandedPregeneration()
  const edited = updateChapterProse(story, 1, [
    'EDITED_TAIL_2：阿遥亲手改过的第二章结尾——守灯人把那封信推回她手里，说，烧了吧。',
    '她没有烧。她把信塞进钟楼的齿轮里，让它跟着潮汐一起转。',
  ])
  // The retirement is plain, checkable record state.
  assert.equal(edited.chapters.length, 2, 'the stale pre-generation is out of the record')
  assert.equal(edited.chapterIndex, 2, 'the acceptance pointer rewound to the dropped slot')
  assert.equal(edited.revision, story.revision + 1)
  assert.equal(edited.openedThrough, 1, 'the watermark did not move')
  // The preparation machinery re-arms for exactly that slot, and the
  // rebuilt chapter is briefed from the edited tail.
  assert.equal(nextGenerationIndex(edited, readerIndexFor(edited)), 2)
  const capture = {}
  const generator = generatorCapturing(capture)
  const result = await generator.generate({ story: edited, index: 2 })
  const context = JSON.parse(capture.input)
  assert.ok(context.recentChapter.text.includes('EDITED_TAIL_2'), 'the rebuilt chapter continues from the edited prose')
  const rebuilt = acceptChapter(edited, { ...buildChapter(edited, 2), paragraphs: result.chapter.paragraphs }, chapterKey(edited, 2))
  assert.equal(rebuilt.chapters.length, 3)
})

test('path 3: a re-roll drops the landed pre-generation at the rotation, before the pass runs', async () => {
  const story = storyWithLandedPregeneration()
  const rotated = beginChapterReroll(story, 1)
  assert.equal(rotated.chapters.length, 2, 'the stale copy is retired by the rotation itself')
  assert.equal(rotated.chapterIndex, 2)
  assert.equal(rotated.openedThrough, 1)
  const capture = {}
  const generator = generatorCapturing(capture, '换版正文')
  const result = await generator.generate({ story: rotated, index: 1, mode: 'reroll' })
  const landed = acceptRerolledChapter(rotated, result)
  assert.equal(landed.chapters[1].paragraphs[0].startsWith('换版正文'), true)
  assert.equal(nextGenerationIndex(landed, readerIndexFor(landed)), 2, 'the next chapter re-prepares from the new telling')
  const reprepared = accept(landed, 2)
  assert.equal(reprepared.chapters.length, 3)
})

// --- path 4: read-only lines are untouched -----------------------------------

test('path 4: read-only lines expose no lever and refuse every pass', async () => {
  const story = { ...storyWithLandedPregeneration(), readOnly: true }
  assert.strictEqual(beginChapterReroll(story, 1), story)
  assert.strictEqual(updateChapterProse(story, 1, ['改不动。']), story)
  const rotatedShape = { ...story, readOnly: false }
  const rerolled = buildChapter(rotatedShape, 1)
  assert.strictEqual(replaceFrontierChapter(story, rerolled, chapterKey(story, 1)), story)
  const generator = createGeminiGenerator({ env, fetchImpl: async () => response(prose('新版正文')) })
  await assert.rejects(generator.generate({ story, index: 1, mode: 'reroll' }),
    (error) => error.status === 403)
})
