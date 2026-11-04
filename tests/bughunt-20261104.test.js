import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createReadingLocationStore, findInChapters } from '../src/reading-location.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ReadingTools.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const pager = readFileSync(new URL('../src/components/ReaderPager.jsx', import.meta.url), 'utf8')
const plazaServer = readFileSync(new URL('../server/plaza.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-04: guard assertions for this round's fixes.
// Base: origin/main 7f8972e (bughunt-20261103 already merged); the ten
// below are the 2026-11-03 leftovers V1–V9 plus one new profile find.
// None duplicates the 20261030 / 20261031 / 20261101 / 20261102 /
// 20261103 lists.

test('bughunt-1: no anchor, no bookmark — never a silent chapter-start fallback', () => {
  const fnAt = main.indexOf('const togglePositionBookmark')
  const fn = main.slice(fnAt, main.indexOf('const toggleStoryBookmark', fnAt))
  assert.match(fn, /if \(!anchor\) return false/)
  assert.doesNotMatch(fn, /\|\| \{ paragraph: 0, offset: 0 \}/)
  assert.match(tools, /没能定位到当前位置，请稍后再试/)
})

test('bughunt-2: two positions in one paragraph are two bookmarks', () => {
  const backing = {}
  const store = createReadingLocationStore({ storage: {
    getItem: (key) => backing[key] ?? null,
    setItem: (key, value) => { backing[key] = value },
  } })
  const base = { key: 'k', storyId: 's', chapterIndex: 0, title: 'T', excerpt: 'x' }
  assert.equal(store.toggleBookmark({ ...base, anchor: { paragraph: 5, offset: 0.2 } }), true)
  assert.equal(store.toggleBookmark({ ...base, anchor: { paragraph: 5, offset: 0.6 } }), true)
  let marks = store.bookmarks('s', ['k'])
  assert.equal(marks.length, 2)
  assert.equal(store.toggleBookmark({ ...base, anchor: { paragraph: 5, offset: 0.6 } }), false)
  marks = store.bookmarks('s', ['k'])
  assert.equal(marks.length, 1)
  assert.equal(marks[0].anchor.offset, 0.2)
  store.toggleBookmark({ ...base, anchor: { paragraph: 5, offset: 0.6 } })
  store.removeBookmark('k', 5, 0.6)
  marks = store.bookmarks('s', ['k'])
  assert.equal(marks.length, 1)
  assert.equal(marks[0].anchor.offset, 0.2)
})

test('bughunt-3: in-book find returns every occurrence with its hit offset', () => {
  const chapters = [{ title: '第一章', paragraphs: ['猫在屋顶，猫在巷口。'] }]
  const results = findInChapters(chapters, '猫')
  assert.equal(results.length, 2)
  assert.equal(results[0].offset, 0)
  assert.ok(results[1].offset > 0)
  assert.ok(results[1].anchorOffset > 0 && results[1].anchorOffset < 1)
  assert.match(tools, /result\.anchorOffset \?\? 0/)
})

test('bughunt-4: the bookstore says it is refreshing instead of passing old books off as new', () => {
  assert.match(main, /store-refreshing/)
  assert.match(main, /正在刷新书城…/)
  assert.match(main, /aria-busy=\{refreshing \|\| undefined\}/)
  assert.match(css, /\.store-refreshing\{/)
})

test('bughunt-5: changing the identifier clears the old code and its cooldown', () => {
  const fnAt = panel.indexOf('const changeAccountId')
  const fn = panel.slice(fnAt, panel.indexOf('const run', fnAt))
  assert.match(fn, /setCode\(""\)/)
  assert.match(fn, /setCooldown\(0\)/)
})

test('bughunt-6: unread is only cleared after dwelling on the tab', () => {
  const effectAt = main.indexOf('const activeUnread = data?.categories?.[tab]?.unread')
  const effect = main.slice(effectAt, main.indexOf('const category = data?.categories?.[tab]', effectAt))
  assert.match(effect, /setTimeout/)
  assert.match(effect, /1500/)
  assert.match(effect, /window\.clearTimeout\(timer\)/)
})

test('bughunt-7: a notification row with no actor is not a clickable-looking button', () => {
  assert.match(main, /disabled=\{!item\.actorUid\}/)
  assert.match(css, /button\.notify-row:disabled\{cursor:default;opacity:1\}/)
})

test('bughunt-8: bookstore search matches the @handle shown on the card', () => {
  assert.match(plazaServer, /book\.authorHandle/)
  assert.match(plazaServer, /needle\.replace\(\/\^@\/, ''\)/)
})

test('bughunt-9: the reader end page hides from assistive tech like body pages', () => {
  assert.match(pager, /reader-pager-end" aria-hidden=\{pageRef\.current !== pages\.length \|\| undefined\}/)
})

test('bughunt-10: a failed handle check says so instead of looking unchecked', () => {
  const fnAt = main.indexOf('const checkHandle')
  const fn = main.slice(fnAt, main.indexOf('const pickKind', fnAt))
  assert.match(fn, /available: null/)
  assert.match(fn, /没能确认这个 ID 是否可用，保存时会再核对/)
  assert.match(main, /handleState\.available === true \? "is-ok" : handleState\.available === false \? "is-bad" : ""/)
})
