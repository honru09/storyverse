import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  createMergedStory,
  createStory,
  fusionProductModeFor,
  outlineLengthFor,
  storyLengthModeOf,
  totalChaptersFor,
} from '../src/story-engine.js'

// ---------------------------------------------------------------------------
// Fusion length choice (owner ruling 2026-10-30; engine landed with the
// publish-gate batch, the picker UI at the Oct-31 integration): the
// reader picks the fused line's length — 短篇 6 章 / 一季 24 章 /
// 长线 100 章 / 无限连载. An explicit options.storyLengthMode wins
// over the combination table; untouched, the table decides (finished
// sources → short, any serialising source → endless) and the picker
// preselects exactly that.
// ---------------------------------------------------------------------------

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    current = acceptChapter(current, buildChapter(current, index), chapterKey(current, index))
  }
  return current
}
const finishedShort = (options = {}) => walkLocal(createStory({ genreId: 'mist', ...options }), 6)
const serializing = (options = {}, chapters = 3) => walkLocal(
  createStory({ genreId: 'mist', storyLengthMode: 'endless', ...options }), chapters,
)

test('an explicit length choice wins over the combination table', () => {
  const a = finishedShort({ name: '阿澜' })
  const b = finishedShort({ name: '沈砚', genreId: 'cultivation' })
  // finished × finished would table-decide short; the reader said season.
  const season = createMergedStory([a, b], { storyLengthMode: 'season' })
  assert.equal(storyLengthModeOf(season), 'season')
  assert.equal(totalChaptersFor(season), 24)
  // A finite long fusion takes the genre outline at its own total, not
  // the bespoke six beats.
  const long = createMergedStory([a, b], { storyLengthMode: 'long' })
  assert.equal(storyLengthModeOf(long), 'long')
  assert.equal(totalChaptersFor(long), 100)
  assert.equal(outlineLengthFor(long), 20)
  const endless = createMergedStory([a, b], { storyLengthMode: 'endless' })
  assert.equal(storyLengthModeOf(endless), 'endless')
  assert.equal(totalChaptersFor(endless), Infinity)
})

test('an explicit short caps even a serialising cast', () => {
  const a = serializing({ name: '陆鸣' })
  const b = finishedShort({ name: '沈砚', genreId: 'cultivation' })
  const merged = createMergedStory([a, b], { storyLengthMode: 'short' })
  assert.equal(storyLengthModeOf(merged), 'short')
  assert.equal(totalChaptersFor(merged), 6)
})

test('untouched, the combination table decides and the picker preselects it', () => {
  const doneA = finishedShort({ name: '阿澜' })
  const doneB = finishedShort({ name: '沈砚', genreId: 'cultivation' })
  assert.equal(fusionProductModeFor([doneA, doneB]), 'short')
  assert.equal(storyLengthModeOf(createMergedStory([doneA, doneB])), 'short')
  const live = serializing({ name: '陆鸣' })
  assert.equal(fusionProductModeFor([doneA, live]), 'endless')
  assert.equal(storyLengthModeOf(createMergedStory([doneA, live])), 'endless')
  // The historical two-argument form honours the choice identically.
  assert.equal(storyLengthModeOf(createMergedStory(doneA, doneB, { storyLengthMode: 'season' })), 'season')
})

test('the merge page wires the picker: four choices, fallback preselect, choice passed through', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  for (const label of ['短篇 · 6 章', '一季 · 24 章', '长线 · 100 章', '无限连载']) {
    assert.ok(main.includes(label), `picker offers ${label}`)
  }
  assert.ok(
    main.includes('const lengthMode = lengthChoice || fusionProductModeFor(selectedStories)'),
    'untouched picker falls back to the combination table',
  )
  assert.ok(
    main.includes('createMergedStory(selectedStories, { rules, lead: leadIndex, bond, storyLengthMode: lengthMode })'),
    'runMerge passes the effective length into the engine',
  )
})
