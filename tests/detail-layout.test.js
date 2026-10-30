import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// REQ-55: the book detail page order — header (with a one-line rating
// summary) → reading entry group → synopsis → the author's avatar →
// world intro → beats → ratings at the very foot. A first-time
// visitor meets the book before anyone asks them to rate it, and the
// way in is one primary button nobody has to scroll for.
// ---------------------------------------------------------------------------

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const detailSource = mainSource.slice(
  mainSource.indexOf('function PlazaDetail'),
  mainSource.indexOf('function formatProfileDate'),
)
const at = (needle) => {
  const index = detailSource.indexOf(needle)
  assert.ok(index >= 0, `detail page contains: ${needle}`)
  return index
}

test('detail order: entry group hugs the header, ratings close the page', () => {
  const cover = at('plaza-detail-cover')
  const entry = at('plaza-entry-panel')
  const synopsis = at('本书简介')
  const avatar = at('plaza-avatar-panel')
  const world = at('plaza-world-intro')
  const beats = at('id="plaza-detail-beats"')
  const ratings = at('<BookRatingsSection')
  assert.ok(cover < entry, 'entry group right after the header')
  assert.ok(entry < synopsis, 'synopsis after the entry group')
  assert.ok(synopsis < avatar, "the author's avatar after the synopsis")
  assert.ok(avatar < world, 'world intro after the avatar panel')
  assert.ok(world < beats, 'beats after the world intro')
  assert.ok(beats < ratings, 'ratings after the beats — the last content section')
})

test('detail header: the rating is one summary line off the record itself', () => {
  assert.ok(detailSource.includes('plaza-detail-rating'))
  assert.ok(detailSource.includes('ratingAverageText(detail)'))
  assert.ok(detailSource.includes('暂无评价'))
  // The ratings section mounts exactly once — at the foot, not twice.
  assert.equal(detailSource.match(/<BookRatingsSection/g)?.length, 1)
})

test("detail entry: the primary label reads this device's saved place", () => {
  assert.ok(detailSource.includes('READING_LOCATION_KEY'))
  assert.ok(detailSource.includes('public:plaza-line-${id}:'))
  assert.ok(detailSource.includes('继续阅读 · 第 ${readProgress + 1} 章'))
})

test('detail entry: the beats carry the 目录 landing id, the fusion door keeps its states', () => {
  assert.ok(detailSource.includes('scrollToBeats'))
  assert.ok(detailSource.includes('id="plaza-detail-beats"'))
  assert.ok(detailSource.includes('fusionEntry.state === "no-line"'))
})

test('detail hooks: readProgress is computed above the loading early return', () => {
  // The saved-place label needs a hook, but PlazaDetail returns early
  // while loading — a hook below that return renders more hooks than
  // the previous render once the book lands (React #310) and the
  // error boundary eats the whole page.
  const hook = detailSource.indexOf('const readProgress = useMemo')
  const earlyReturn = detailSource.indexOf('if (!detail)')
  assert.ok(hook >= 0, 'the readProgress hook exists')
  assert.ok(earlyReturn >= 0, 'the loading early return exists')
  assert.ok(hook < earlyReturn, 'the hook sits above the early return')
})

test('detail styles: entry group styles exist, the card family styles are gone', () => {
  for (const gone of ['.plaza-entry-option', '.plaza-cta-panel', '.plaza-share-row']) {
    assert.ok(!stylesSource.includes(gone), `style gone: ${gone}`)
  }
  for (const live of ['.plaza-entry-panel', '.plaza-entry-read', '.plaza-entry-action', '.plaza-detail-rating']) {
    assert.ok(stylesSource.includes(live), `style present: ${live}`)
  }
})
