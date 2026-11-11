import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-03: guard assertions for this round's fixes.
// Each test names the bug so a future regression reads as the bug returning.
// Base: origin/main 5e9f4ae (bughunt-20261102 already merged); none of
// the ten below duplicates the 20261030 / 20261031 / 20261101 / 20261102 lists.

test('bughunt-1: the share picker says so when it only shows the first 12 books', () => {
  // BUGHUNT-20261110: the disclosure now also names @handle as a
  // searchable field (the picker has searched handles since
  // 20261105 #4); the 12-book cap disclosure itself is unchanged.
  // BUGHUNT-20261111: with a search the disclosure also reports the
  // server total ("共 N 本符合…"), so the no-query branch is a
  // ternary arm now — the copy and the 12-book slice are unchanged.
  assert.match(main, /只显示前 12 本，搜书名、作者或 @handle 能缩小范围找到其余的书/)
  assert.match(main, /pickable\.length > 12 \?/)
  assert.match(main, /pickable\.slice\(0, 12\)/)
})

test('bughunt-2: an inspiration fragment that does not fit says so instead of slicing silently', () => {
  const forgeAt = main.indexOf('const appendFragment')
  const fn = main.slice(forgeAt, main.indexOf('const [rolled', forgeAt))
  assert.match(fn, /设定已经写满了，先删减一点再加碎片/)
  assert.match(fn, /碎片只加了能放下的部分，设定已到上限/)
  assert.match(main, /fragmentNote/)
})

test('bughunt-3: a real system-share failure is reported, a dismissal is not', () => {
  const sheetAt = main.indexOf('function ShareProfileSheet')
  const sheet = main.slice(sheetAt, main.indexOf('const responsiveDefaultBannerUrl', sheetAt))
  assert.match(sheet, /failure\?\.name !== "AbortError"/)
  assert.match(sheet, /onShareFailed\?\.?\(\)/)
  assert.match(main, /系统分享没能完成，请稍后再试/)
})

test('bughunt-4: the profile window locks body scroll and returns focus on close', () => {
  const effectAt = main.indexOf('if (!profileRoute) return undefined;')
  const effect = main.slice(effectAt, main.indexOf('const [cloudSync]', effectAt))
  assert.match(effect, /document\.body\.style\.overflow = "hidden"/)
  assert.match(effect, /trigger\.focus\(\{ preventScroll: true \}\)/)
})

test('bughunt-5: Escape over an open native dialog does not also close the profile window', () => {
  const effectAt = main.indexOf('if (!profileRoute) return undefined;')
  const effect = main.slice(effectAt, main.indexOf('const [cloudSync]', effectAt))
  assert.match(effect, /document\.querySelector\("dialog\[open\]\"\)/)
})

test('bughunt-6: a clamped profile bio offers an expand control', () => {
  assert.match(main, /bioClamped/)
  assert.match(main, /bioExpanded/)
  assert.match(main, /展开全文/)
  assert.match(css, /\.profile-hero-bio\.is-expanded\{display:block;-webkit-line-clamp:unset;overflow:visible\}/)
})

test('bughunt-7: the avatar editor counts its name and description caps', () => {
  const editorAt = main.indexOf('function AvatarPage')
  const editor = editorAt >= 0 ? main.slice(editorAt, editorAt + 40000) : main
  assert.match(editor, /\{form\.name\.length\} \/ 20/)
  assert.match(editor, /\{form\.description\.length\} \/ 300/)
})

test('bughunt-8: unfollowing says so in words, not only by flipping the button', () => {
  assert.match(main, /已取消关注/)
})

test('bughunt-9: re-picking a library ability keeps its bounds', () => {
  assert.match(main, /\.\.\.\(item\.bounds \? \{ bounds: item\.bounds \} : \{\}\)/)
})

test('bughunt-10: a second shelf tap inside the pull delay cancels the first timer', () => {
  const shelfAt = main.indexOf('function LibrarySwitcher')
  const shelf = main.slice(shelfAt, main.indexOf('function Home', shelfAt))
  assert.match(shelf, /if \(pullTimer\.current\) window\.clearTimeout\(pullTimer\.current\)/)
})
