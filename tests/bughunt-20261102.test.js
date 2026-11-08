import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ReadingTools.jsx', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-02: guard assertions for this round's fixes.
// Each test names the bug so a future regression reads as the bug returning.
// Base: origin/main 8100302 (GENFIX-20261101, already contains the
// 20261030 + 20261031 + 20261101 rounds); none of the ten below
// duplicates those lists.

test('bughunt-1: a successful fusion decision clears the pin so other rows stay usable', () => {
  const panelAt = main.indexOf('const decideFusion = async')
  const fn = main.slice(panelAt, main.indexOf('useEffect', panelAt))
  assert.match(fn, /setDecidingId\(""\)/)
  assert.match(fn, /setRetry\(\(value\) => value \+ 1\)/)
  // The pin must be cleared on the success path, not only in catch.
  assert.ok(fn.indexOf('setDecidingId("")') < fn.indexOf('setRetry('))
})

test('bughunt-2: a saved/deleted rating tells the detail header to refetch its average', () => {
  assert.match(main, /onRated/)
  assert.match(main, /if \(payload\) onRated\?\.\(\)/)
  assert.match(main, /if \(removedPayload\) onRated\?\.\(\)/)
  // BUGHUNT-20261108: the refetch gained an id guard — rate on book A,
  // jump to book B before it lands, and A's response must not overwrite
  // B. The callback still refetches; it only writes back for its own book.
  assert.match(main, /onRated=\{\(\) => \{ const wanted = id; fetchPlazaDetail\(\{ id: wanted \}\)\.then\(\(next\) => \{ if \(idRef\.current === wanted\) setDetail\(next\); \}\)/)
})

test('bughunt-3: a plaza card resyncs from fresh props after the 60s refresh, never mid-flight', () => {
  const cardAt = main.indexOf('function PlazaPostCard')
  const card = main.slice(cardAt, main.indexOf('function PlazaPostBookCard', cardAt))
  assert.match(card, /if \(!likeBusy\) \{\s+setLiked\(Boolean\(post\.viewerLiked\)\)/)
  assert.match(card, /setLikeCount\(post\.likeCount \?\? 0\)/)
  assert.match(card, /setCommentCount\(post\.commentCount \|\| 0\)/)
  assert.match(card, /if \(!editing\) \{\s+setContent\(post\.content\)/)
})

test('bughunt-4: detail ownership matches the server author uid, not only local storage', () => {
  assert.match(main, /plazaMineIds\(\)\.has\(id\) \|\| \(Boolean\(account\.user\?\.uid\) && detail\?\.authorUid === account\.user\.uid\)/)
})

test('bughunt-5: a chip-merged intervention over 120 chars is refused, not silently sliced', () => {
  const sheetAt = main.indexOf('function InterventionSheet')
  const sheet = main.slice(sheetAt, main.indexOf('function StorySettingsBook', sheetAt))
  assert.match(sheet, /if \(chip\?\.text && combined\.length > INTERVENTION_TEXT_MAX\)/)
  assert.match(sheet, /超过 .* 字上限，请先删减一点再提交/)
})

test('bughunt-6: the comment thread pages past 50 instead of dropping nextCursor', () => {
  const threadAt = main.indexOf('function PlazaCommentThread')
  const thread = main.slice(threadAt, main.indexOf('function PlazaFeed', threadAt))
  assert.match(thread, /setCommentsCursor\(result\.nextCursor\)/)
  assert.match(thread, /loadMoreComments/)
  assert.match(thread, /fetchPostComments\(\{ postId: post\.id, cursor: commentsCursor \}\)/)
  assert.match(thread, /更多评论/)
})

test('bughunt-7: a late ratings response for the previous book never lands on the new one', () => {
  const sectionAt = main.indexOf('function BookRatingsSection')
  const section = main.slice(sectionAt, main.indexOf('function PlazaDetail', sectionAt))
  assert.match(section, /const requestBook = bookId/)
  assert.match(section, /if \(bookIdRef\.current !== requestBook\) return null/)
  assert.match(section, /if \(bookIdRef\.current !== requestBook\) return;/)
})

test('bughunt-8: deleting a reader bookmark asks first and says so afterwards', () => {
  assert.match(tools, /confirmingBookmarkKey/)
  assert.match(tools, /确认删除/)
  assert.match(tools, /书签已删除。/)
  assert.doesNotMatch(tools, /onClick=\{\(\) => onRemove\(item\)\} aria-label/)
})

test('bughunt-9: book titles clip to the 40-unit budget with a unit counter at all three entries', () => {
  assert.match(main, /BOOK_TITLE_MAX_UNITS/)
  assert.match(main, /clipToUnits\(event\.target\.value, BOOK_TITLE_MAX_UNITS\)/)
  const hits = main.match(/clipToUnits\(event\.target\.value, BOOK_TITLE_MAX_UNITS\)/g) || []
  assert.ok(hits.length >= 3, `expected 3 title clip sites, got ${hits.length}`)
  assert.match(main, /textUnitsFor\(draft\.bookTitle \|\| ""\)\} \/ \{BOOK_TITLE_MAX_UNITS\}/)
  assert.match(main, /textUnitsFor\(bookTitle\)\} \/ \{BOOK_TITLE_MAX_UNITS\}/)
  assert.match(css, /\.da-unit-count\{display:block/)
})

test('bughunt-10: while one friend action flies, no other friend row looks tappable', () => {
  assert.doesNotMatch(main, /disabled=\{busyUid === person\.uid\}/)
  assert.doesNotMatch(main, /disabled=\{busyUid === entry\.person\.uid\}/)
  assert.match(main, /disabled=\{Boolean\(busyUid\)\}/)
})
