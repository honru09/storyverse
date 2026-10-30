import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const aurora = readFileSync(new URL('../src/aurora.css', import.meta.url), 'utf8')
const overlay = readFileSync(new URL('../src/components/InterventionOverlay.jsx', import.meta.url), 'utf8')

// Daily bug-hunt 2026-10-30: guard assertions for the ten fixes. Each
// test names the bug so a future regression reads as the bug returning.

test('bughunt-1: plaza post author name truncates instead of crowding the menu', () => {
  assert.match(css, /\.plaza-post-person-name\{[^}]*min-width:0/)
  assert.match(css, /\.plaza-post-person-name strong\{[^}]*text-overflow:ellipsis/)
})

test('bughunt-2: plaza 60s tick merges instead of dropping paged posts', () => {
  assert.match(main, /const refreshFeed = useCallback/)
  assert.match(main, /pagedRef\.current = true/)
  assert.match(main, /void refreshFeed\(\)\.catch/)
  // loadMore dedupes so a refreshed cursor can never duplicate a page.
  assert.match(main, /filter\(\(post\) => !seen\.has\(post\.id\)\)/)
})

test('bughunt-3: friend search row follows accept/decline like send/cancel already did', () => {
  const acceptAt = main.indexOf('else if (action === "accept")')
  const block = main.slice(acceptAt, main.indexOf('reload();', acceptAt))
  assert.match(block, /friendState: "friends"/)
  assert.match(block, /friendState: "none"/)
})

test('bughunt-4: like rollback returns to the pre-tap count, not the mount-time prop', () => {
  assert.match(main, /const wasCount = likeCount/)
  assert.match(main, /setLikeCount\(wasCount\)/)
  assert.doesNotMatch(main, /setLikeCount\(post\.likeCount \|\| 0\)/)
})

test('bughunt-5: share-book picker reports load failure with a retry, never as an empty store', () => {
  assert.match(main, /const \[booksFailed, setBooksFailed\] = useState\(false\)/)
  assert.match(main, /书城这次没能打开/)
  assert.match(main, /再试一次/)
})

test('bughunt-6: plaza post menu closes on outside tap and on Escape', () => {
  assert.match(main, /menuWrapRef/)
  assert.match(main, /document\.addEventListener\("pointerdown", onPointerDown\)/)
  assert.match(main, /event\.key === "Escape"/)
})

test('bughunt-7: avatar page seeds only after sign-in, so a cold deep link cannot strand the owner on a blank form', () => {
  assert.match(main, /if \(!signedIn\) \{/)
  assert.match(main, /avatarState\.loaded, editingId, signedIn\]/)
})

test('bughunt-8: intervention overlay offers a way back to reading while the pass continues', () => {
  assert.match(overlay, /onCancel/)
  assert.match(overlay, /回到阅读/)
  assert.match(main, /interveneCancelledRef/)
  assert.match(main, /onCancel=\{\(\) => \{ interveneCancelledRef\.current = true; setIntervening\(false\); \}\}/)
  assert.match(aurora, /\.intervention-cancel\{[^}]*min-height:44px/)
})

test('bughunt-9: intervention chip no longer silently discards typed text', () => {
  assert.match(main, /提交时，你写的文字会和这个方向一并送出/)
  assert.match(main, /const combined = chip\?\.text/)
})

test('bughunt-10: shelf cell width follows the breakpoint gap, so wide shelves cannot overflow', () => {
  assert.match(css, /\.wood-shelf-books\{[^}]*gap:var\(--shelf-gap,14px\)/)
  assert.match(css, /\.wood-book-cell\{[^}]*var\(--shelf-gap,14px\)/)
  assert.match(css, /\.wood-shelf-books\{--shelf-gap:18px\}/)
  assert.match(css, /\.wood-shelf-books\{--shelf-gap:22px\}/)
  // No breakpoint may set a raw gap that the cell formula does not know about.
  assert.doesNotMatch(css, /\.wood-shelf-books\{gap:(18|22)px\}/)
})
