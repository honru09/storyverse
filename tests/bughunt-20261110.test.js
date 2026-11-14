import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createReadingLocationStore, MAX_BOOKMARKS } from '../src/reading-location.js'
import { requestChapter } from '../src/generation.js'
import { createStory } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const aurora = readFileSync(new URL('../src/aurora.css', import.meta.url), 'utf8')
const storyMap = readFileSync(new URL('../src/components/StoryMap.jsx', import.meta.url), 'utf8')
const generation = readFileSync(new URL('../src/generation.js', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-10: guard assertions for this round's fixes.
// Base: origin/main a87ca1c (bughunt-20261109 already merged and live).
// Lanes: audit A (reader/forge/write-desk/avatar/shelf) and audit B
// (plaza/store/detail/profile/friends/messages/settings/login).
// None duplicates the 20261030–20261109 lists. Verified already fixed
// in this base, not counted: Q1/Q3/Q4/Q6 (share picker cap note,
// system-share failure, profile-window scroll lock, unfollow note),
// Q5 (fragment full/near-full feedback), and U2 (profile bio expand,
// fixed 20261103 #6 — the LOG's "still pending" note is stale).
// Left for next round: A6 (search "exactly 60 hits" copy) and the
// same-millisecond createdAt cursor (needs a runtime repro).

const slice = (startMarker, endMarker) => {
  const at = main.indexOf(startMarker)
  assert.notEqual(at, -1, `missing ${startMarker}`)
  const end = endMarker ? main.indexOf(endMarker, at) : main.length
  return main.slice(at, end === -1 ? main.length : end)
}

test('bughunt-1: a failed pre-generation is its own star-map state, and 502 has its own words', async () => {
  // The star map used to call a failed pre-generation "下一章待生成"
  // — identical to "not started yet" — while only the chapter-end
  // button knew it had failed. And 502 fell through to the generic
  // line in generation.js.
  assert.match(storyMap, /error = ""/)
  assert.match(storyMap, /if \(error\) return \{ key: "error", label: "下一章没能备好", className: "is-error" \}/)
  assert.match(aurora, /\.gen-state\.is-error\{color:var\(--danger\)\}/)
  const reader = slice('function Reader(', 'function PlazaDetail(')
  assert.match(reader, /error: generationError/)
  assert.match(generation, /502: '网关暂时没能接上，进度已保留，请重试。'/)
  // Behavioural: a 502 that survives every retry surfaces the 502
  // line, not the generic one.
  const story = { ...createStory({ name: '旅人' }), engine: 'gemini' }
  const fetchImpl = async () => Response.json({ error: 'bad gateway' }, { status: 502 })
  await assert.rejects(
    requestChapter(story, 0, { fetchImpl, retryDelaysMs: [0, 0, 0] }),
    (failure) => failure.message === '网关暂时没能接上，进度已保留，请重试。',
  )
})

test('bughunt-2: a refused revision / re-roll swap reports failure, never "settled"', () => {
  // requestChapterRevision/Reroll validate against the queued
  // snapshot, but the swap still has to land on the library's
  // CURRENT story. A revision that moved on mid-flight used to be
  // refused silently in the second accept while the overlay
  // reported the intervention settled (and the re-roll comment
  // claimed "the caller hears about it" when it did not).
  const reviseAt = main.indexOf('const reviseChapter = useCallback')
  assert.notEqual(reviseAt, -1)
  const revise = main.slice(reviseAt, main.indexOf('const rerollChapter = useCallback', reviseAt))
  assert.match(revise, /const next = latest \? acceptRevisedChapter\(latest, result\) : null/)
  assert.match(revise, /if \(!next \|\| next === latest\) throw new Error\("这次重写没能换上，介入还排在队列里。"\)/)
  assert.doesNotMatch(revise, /if \(next === latest\) return current;/)
  const rerollAt = main.indexOf('const rerollChapter = useCallback')
  const reroll = main.slice(rerollAt, main.indexOf('// Cover painting runs beside reading', rerollAt))
  assert.match(reroll, /const next = latest \? acceptRerolledChapter\(latest, result\) : null/)
  assert.match(reroll, /if \(!next \|\| next === latest\) throw new Error\("这一章没能换成新的一版。"\)/)
  assert.doesNotMatch(reroll, /if \(next === latest\) return current;/)
})

test('bughunt-3: a full bookmark shelf refuses the 81st bookmark instead of evicting the oldest', () => {
  // toggleBookmark used to slice(-80) after pushing, so the 81st
  // bookmark silently dropped the oldest one — possibly another
  // book's — while reporting success.
  assert.equal(MAX_BOOKMARKS, 80)
  const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }
  const store = createReadingLocationStore({ storage: memory() })
  for (let i = 0; i < MAX_BOOKMARKS; i++) {
    assert.equal(store.toggleBookmark({ key: `k${i}`, storyId: 'book', chapterIndex: 0, anchor: { paragraph: i, offset: 0 }, title: '章', excerpt: '文' }), true)
  }
  assert.equal(store.bookmarks('book').length, MAX_BOOKMARKS)
  assert.equal(store.toggleBookmark({ key: 'k81', storyId: 'book', chapterIndex: 0, anchor: { paragraph: 81, offset: 0 }, title: '章', excerpt: '文' }), 'full')
  assert.equal(store.bookmarks('book').length, MAX_BOOKMARKS)
  assert.equal(store.bookmarks('book', ['k0']).length, 1)
  // Removing an existing bookmark at a full shelf still works.
  assert.equal(store.toggleBookmark({ key: 'k0', storyId: 'book', chapterIndex: 0, anchor: { paragraph: 0, offset: 0 }, title: '章', excerpt: '文' }), false)
  assert.equal(store.bookmarks('book').length, MAX_BOOKMARKS - 1)
  assert.equal(store.toggleBookmark({ key: 'k81', storyId: 'book', chapterIndex: 0, anchor: { paragraph: 81, offset: 0 }, title: '章', excerpt: '文' }), true)
})

test('bughunt-4: the write-desk foot counts toward the 100k chapter cap', () => {
  // The foot showed only the running word count, so an author
  // writing toward the cap learned about it only when every
  // autosave started failing.
  const desk = slice('function WriteDesk(', 'function App()')
  assert.match(desk, /\{draftWords\} \/ \{MANUAL_CHAPTER_TEXT_MAX\} 字/)
  assert.match(main, /MANUAL_CHAPTER_TEXT_MAX,/)
})

test('bughunt-5: the lorebook add button stops at 200 entries with a word', () => {
  // Save truncates at LOREBOOK_MAX_ENTRIES, but "+ write one more"
  // was uncapped — entries 201+ could be typed and were then
  // silently dropped on save.
  const book = slice('function StorySettingsBook(', 'function PlazaDetail(')
  assert.match(book, /if \(entries\.length >= LOREBOOK_MAX_ENTRIES\) return;/)
  assert.match(book, /disabled=\{entries\.length >= LOREBOOK_MAX_ENTRIES\}/)
  assert.match(book, /世界书条目已到 \{LOREBOOK_MAX_ENTRIES\} 条上限，先删一条再加。/)
  assert.match(main, /LOREBOOK_MAX_ENTRIES,/)
})

test('bughunt-6: a partially landed profile save names what landed and syncs the page', () => {
  // Staged uploads land before the field patch; when the patch
  // failed the sheet said only "not saved" while the avatar/banner
  // had already changed server-side, and closing the sheet
  // ("discard the draft") could not undo it.
  // BUGHUNT-20261111: landed is a list now (20261111 #3) — the old
  // single string overwrote the avatar with the banner, so a
  // two-step save named only the banner. The single-step wording is
  // unchanged ("头像已经换上了…"); both steps join with 和.
  const sheet = slice('function EditProfileSheet(', 'function FriendsPanel(')
  const saveAt = sheet.indexOf('const save = async')
  assert.notEqual(saveAt, -1)
  const save = sheet.slice(saveAt, sheet.indexOf('return (', saveAt))
  assert.match(save, /let landed = \[\]/)
  assert.match(save, /landed\.push\("头像"\)/)
  assert.match(save, /landed\.push\("头图"\)/)
  assert.match(save, /if \(landed\.length\) \{\s+if \(next\) onSaved\(next\);/)
  assert.match(save, /setError\(`\$\{landed\.join\("和"\)\}已经换上了，资料的其他部分没能保存。`\)/)
})

test('bughunt-7: the comment-thread head wraps instead of clipping its confirm buttons', () => {
  // A long name + full date + the two delete-confirm buttons ran
  // past 360px and overflow-x:clip cut "再想想" off entirely.
  assert.match(styles, /\.plaza-thread-head\{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px\}/)
  assert.match(styles, /\.plaza-thread-head strong\{font-size:13\.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/)
})

test('bughunt-8: the profile ··· menu closes on an outside tap or Esc', () => {
  // The menu closed only on a second tap, on report, or on
  // switching profiles — the same missing close the plaza post
  // menu grew out of (20261030 #6).
  const page = slice('function ProfilePage(', 'function WriteDesk(')
  const menuAt = page.indexOf('const [menuOpen, setMenuOpen]')
  assert.notEqual(menuAt, -1)
  const block = page.slice(menuAt, page.indexOf('const [bioExpanded', menuAt))
  assert.match(block, /const menuWrapRef = useRef\(null\)/)
  assert.match(block, /const menuRef = useRef\(null\)/)
  assert.match(block, /menuWrapRef\.current\?\.contains\(event\.target\)/)
  assert.match(block, /menuRef\.current\?\.contains\(event\.target\)/)
  assert.match(block, /if \(event\.key === "Escape"\) setMenuOpen\(false\)/)
  assert.match(page, /<span className="ryan-topbar-actions" ref=\{menuWrapRef\}>/)
  assert.match(page, /<div className="ryan-menu" role="menu" ref=\{menuRef\}>/)
})

test('bughunt-9: a failed header refetch after rating is visible and retryable', () => {
  // onRated's refetch swallowed failures, so the header kept saying
  // "暂无评价" above a saved 5★ until the page was left and re-entered.
  // BUGHUNT-20261114: the banner copy is neutral now — a deleted rating
  // feeds the same stale-head path, so "评分已保存" no longer fits.
  const detail = slice('function PlazaDetail(', 'function ProfilePage(')
  assert.match(detail, /const \[ratingsHeadStale, setRatingsHeadStale\] = useState\(false\)/)
  assert.match(detail, /const refreshHead = useCallback\(\(\) => \{/)
  assert.match(detail, /catch\(\(\) => \{ if \(idRef\.current === wanted\) setRatingsHeadStale\(true\); \}\)/)
  assert.match(detail, /onRated=\{refreshHead\}/)
  assert.match(detail, /评价刚有变化，但头部数据没能刷新。 <button type="button" className="small-link" onClick=\{refreshHead\}>再试一次<\/button>/)
})

test('bughunt-10: the copy-link fallback note can break its URL', () => {
  // The fallback pastes a ~61-char unbroken URL into the note; at
  // 360px the post id at the tail was clipped off.
  assert.match(styles, /\.plaza-inline-note\{[^}]*overflow-wrap:anywhere\}/)
})

test('bughunt-11: store and picker copy say a @handle can be searched', () => {
  // The server has searched authorHandle since 20261104 #8, but no
  // visible copy said so — and the handle is often the only author
  // identifier a store card shows.
  const store = slice('function Store(', 'function PlazaDetail(')
  assert.match(store, /placeholder="搜书名、作者、世界或 @handle"/)
  assert.match(store, /搜书名、作者、世界名或 @handle 能缩小范围找到其余的书。/)
  assert.match(main, /只显示前 12 本，搜书名、作者或 @handle 能缩小范围找到其余的书。/)
})
