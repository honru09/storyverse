import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const plaza = readFileSync(new URL('../src/plaza.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-01: guard assertions for this round's fixes.
// Each test names the bug so a future regression reads as the bug returning.
// Base: origin/main c74a335 (already contains the 20261030 + 20261031
// rounds); none of the ten below duplicates those lists.

test('bughunt-1: deleting a plaza comment asks first, pins the flight, and confirms success', () => {
  assert.match(main, /confirmingRemoveId/)
  assert.match(main, /确认删除/)
  assert.match(main, /这条评论已删除。/)
  assert.match(main, /setRemovingId\(comment\.id\)/)
  const threadAt = main.indexOf('function PlazaCommentThread')
  const thread = main.slice(threadAt, main.indexOf('function PlazaFeed', threadAt))
  assert.doesNotMatch(thread, /onClick=\{\(\) => void remove\(comment\)\}>[\s\S]{0,40}删除\n/)
})

test('bughunt-2: a plaza like cannot race itself and a failed like says so', () => {
  assert.match(main, /likeBusy/)
  assert.match(main, /if \(likeBusy\) return/)
  assert.match(main, /disabled=\{likeBusy\}/)
  assert.match(main, /点赞没能保存，请稍后再试。/)
})

test('bughunt-3: a failed plaza load-more says so instead of silently re-arming the button', () => {
  assert.match(main, /loadMoreError/)
  assert.match(main, /更多帖子没能打开，请稍后再试。/)
  const feedAt = main.indexOf('function PlazaFeed')
  const feed = main.slice(feedAt, main.indexOf('function RatingStars', feedAt))
  assert.doesNotMatch(feed, /catch \{ \/\* the button stays/)
})

test('bughunt-4: a dead plaza permalink says the post is gone instead of silently showing the stream', () => {
  assert.match(main, /focusFailed/)
  assert.match(main, /这条帖子已删除或不存在/)
})

test('bughunt-5: the bookstore discloses its filtered total when the 60-book page cuts it off', () => {
  assert.match(plaza, /total: Number\.isInteger\(result\?\.total\)/)
  assert.match(main, /data\.total > books\.length/)
  assert.match(main, /先显示前 \{books\.length\} 本/)
})

test('bughunt-6: a saved rating confirms in words, not only with a motion-gated beat', () => {
  assert.match(main, /saveNote/)
  assert.match(main, /评价已保存。/)
})

test('bughunt-7: the plaza comment box counts its 300-char budget like the other composers', () => {
  const threadAt = main.indexOf('function PlazaCommentThread')
  const thread = main.slice(threadAt, main.indexOf('function PlazaFeed', threadAt))
  assert.match(thread, /plaza-composer-count/)
  assert.match(thread, /\[\.\.\.draft\]\.length\} \/ 300/)
  assert.match(css, /\.plaza-thread-composer \.plaza-composer-count\{align-self:center;flex:none\}/)
})

test('bughunt-8: the profile display-name field counts the 18-unit clip budget', () => {
  assert.match(main, /textUnitsFor\(displayName\)\} \/ 18/)
})

test('bughunt-9: a failed fusion decision in the message centre says so', () => {
  assert.match(main, /decideError/)
  assert.match(main, /这次没能完成，请再试一次。/)
})

test('bughunt-10: Escape in the login overlay stops there and never closes the profile window behind it', () => {
  const dialogAt = main.indexOf('function AccountSceneDialog')
  const dialog = main.slice(dialogAt, main.indexOf('function InterventionSheet', dialogAt))
  assert.match(dialog, /event\.stopPropagation\(\)/)
  assert.match(dialog, /if \(event\.key !== "Escape"\) return/)
})
