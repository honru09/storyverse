import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../src/components/ReadingTools.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const readerCss = readFileSync(new URL('../src/reader-experience.css', import.meta.url), 'utf8')
const flowCss = readFileSync(new URL('../src/reader-flow.css', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-06: guard assertions for this round's fixes.
// Base: origin/main c0753c7 (bughunt-20261105 already merged).
// Lanes: browser live check (1–3), lane A reader/forge (6–8),
// lane B shelf/profile/settings/login/friends/messages (4–5, 9–10).
// None duplicates the 20261030–20261105 lists.

test('bughunt-1: the topbar mixes toward solid enough that scrolled text cannot ghost through', () => {
  const at = styles.indexOf('the topbar must not let scrolled content ghost')
  assert.ok(at > 0)
  const block = styles.slice(at, at + 2600)
  // Tokens stay pinned; only the mix ratio moves (40% -> 15% token).
  assert.match(block, /color-mix\(in srgb,var\(--topbar-bg\) 15%,var\(--surface-solid\)\)/)
  assert.doesNotMatch(block, /var\(--topbar-bg\) 40%,var\(--surface-solid\)/)
  assert.match(block, /BUGHUNT-20261106/)
})

test('bughunt-2: the reading-settings dialog sits on solid reader paper, not translucent shell glass', () => {
  const at = readerCss.indexOf('BUGHUNT-20261106: the settings sheet')
  assert.ok(at > 0)
  const block = readerCss.slice(at, at + 900)
  // Specificity (0,4,0) beats the shell glass rule (0,3,1).
  assert.match(block, /\.page-reader\[data-reader-theme\] \.reading-dialog:has\(\.reading-preferences\)\{background:var\(--reader-surface\);color:var\(--reader-text\);backdrop-filter:none/)
  // The glass tokens themselves are untouched.
  assert.match(styles, /--glass-modal-bg:rgba\(255,255,255,\.68\)/)
})

test('bughunt-3: the reading-dialog heading sticks to the top of its scrollport', () => {
  const at = flowCss.indexOf('.reading-dialog-heading')
  assert.ok(at > 0)
  const block = flowCss.slice(at, at + 800)
  assert.match(block, /position: sticky/)
  assert.match(block, /top: calc\(-1 \* 1\.5rem\)/)
  assert.match(block, /background: inherit/)
  assert.match(block, /BUGHUNT-20261106/)
})

test('bughunt-4: a failed notifications reload keeps the loaded list and shows a banner, not a full error page', () => {
  const at = main.indexOf('BUGHUNT-20261106: a failed reload used to swap the whole')
  assert.ok(at > 0)
  const block = main.slice(at, at + 1200)
  assert.match(block, /\{error && data && <p className="plaza-thread-error"/)
  assert.match(block, /\{error && !data \? \(/)
  assert.doesNotMatch(block, /\{error \? \(\s*<div className="notify-empty"/)
})

test('bughunt-5: overlay tap and X close the crop step first, like Esc already did', () => {
  const at = main.indexOf('BUGHUNT-20261106: the crop step is its own layer')
  assert.ok(at > 0)
  const block = main.slice(at, at + 1700)
  assert.match(block, /const closeTopLayer = \(\) => \{/)
  assert.match(block, /if \(cropRef\.current\) closeCrop\(\);/)
  assert.match(block, /else if \(bannerCropRef\.current\) closeBannerCrop\(\);/)
  assert.match(block, /else onClose\(\);/)
  assert.match(main, /onClick=\{closeTopLayer\} aria-label="关闭"/)
  assert.match(main, /if \(event\.target === event\.currentTarget\) closeTopLayer\(\); \}\}/)
  // Esc still routes through the same helper.
  assert.match(block, /closeTopLayer\(\);/)
})

test('bughunt-6: reader turn motion follows the live input modality, not the sticky settings-sheet copy', () => {
  assert.match(main, /import \{ isKeyboardInput, subscribeInputModality \} from "\.\/motion\/input-modality\.js";/)
  const at = main.indexOf('BUGHUNT-20261106: turn motion used to follow')
  assert.ok(at > 0)
  const block = main.slice(at, at + 1500)
  assert.match(block, /const \[readerKeyboard, setReaderKeyboard\] = useState\(\(\) => isKeyboardInput\(\)\);/)
  assert.match(block, /useEffect\(\(\) => subscribeInputModality\(setReaderKeyboard\), \[\]\);/)
  assert.match(block, /const turnMotion = readerMotionAnimate && !readerKeyboard;/)
  assert.match(main, /getReaderAppearance\(preferences\.settings, \{ inputMethod: readerKeyboard \? "keyboard" : "pointer" \}\)/)
  assert.doesNotMatch(main, /const turnMotion = readerMotionAnimate && preferences\.inputMethod !== "keyboard";/)
  assert.doesNotMatch(main, /getReaderAppearance\(preferences\.settings, \{ inputMethod: preferences\.inputMethod \}\)/)
})

test('bughunt-7: the bookmark delete-confirm state no longer squeezes two buttons into the 48px action column', () => {
  assert.match(tools, /reading-bookmark-row\$\{confirmingBookmarkKey === bookmarkRowKey\(item\) \? " is-confirming" : ""\}/)
  assert.match(tools, /<div className="reading-bookmark-confirm">/)
  const at = readerCss.indexOf('BUGHUNT-20261106: the 20261102 two-step delete')
  assert.ok(at > 0)
  const block = readerCss.slice(at, at + 600)
  assert.match(block, /\.reading-bookmark-row\.is-confirming\{grid-template-columns:minmax\(0,1fr\)\}/)
  assert.match(block, /\.reading-bookmark-confirm\{display:flex;gap:8px\}/)
  assert.match(block, /\.reading-bookmark-confirm \.reading-bookmark-remove\{flex:1;min-width:0\}/)
})

test('bughunt-8: directory rename caps at 30 with a counter, and an over-long title names its chapter instead of discarding earlier renames', () => {
  const inputAt = main.indexOf('aria-label={`第 ${position + 1} 章标题`}')
  assert.ok(inputAt > 0)
  const input = main.slice(inputAt, inputAt + 700)
  assert.match(input, /maxLength=\{CHAPTER_TITLE_MAX\}/)
  assert.match(input, /\{\(drafts\[position\] \?\? ""\)\.trim\(\)\.length\} \/ \{CHAPTER_TITLE_MAX\}/)
  const fnAt = main.indexOf('BUGHUNT-20261106: the old forEach renamed in place')
  assert.ok(fnAt > 0)
  const fn = main.slice(fnAt, fnAt + 1400)
  assert.match(fn, /if \(!title\.trim\(\)\) return `第 \$\{chapterIndex \+ 1\} 章标题不能为空。`;/)
  assert.match(fn, /if \(title\.trim\(\)\.length > CHAPTER_TITLE_MAX\) return `第 \$\{chapterIndex \+ 1\} 章标题最多 \$\{CHAPTER_TITLE_MAX\} 字。`;/)
  assert.match(fn, /let next = story;\s*list\.forEach/)
})

test('bughunt-9: accepting a friend request patches the friends list and count too, so a failed reload cannot hide the new friend', () => {
  const at = main.indexOf('BUGHUNT-20261106: the friends tab and its count read')
  assert.ok(at > 0)
  const block = main.slice(at, at + 1300)
  assert.match(block, /friends: \(current\.friends \|\| \[\]\)\.some\(\(entry\) => entry\.uid === person\.uid\)/)
  assert.match(block, /\.\.\.\(current\.friends \|\| \[\]\), \{ \.\.\.person, friendState: "friends" \}\]/)
  assert.match(block, /friends: \(current\.counts\.friends \|\| 0\) \+ \(\(current\.friends \|\| \[\]\)\.some\(\(entry\) => entry\.uid === person\.uid\) \? 0 : 1\)/)
})

test('bughunt-10: a successful code resend clears the box, so the voided old code cannot be submitted', () => {
  // BUGHUNT-20261108: the single cooldown split into per-channel
  // login/recovery cooldowns — the resend still clears the box, and
  // each channel now times its own 60s. Same intent, new names.
  const resendAt = panel.indexOf('BUGHUNT-20261106: the server issues a fresh code')
  assert.ok(resendAt > 0)
  const resend = panel.slice(resendAt, resendAt + 400)
  assert.match(resend, /await client\.usernameRecoveryStart\(identifier\); setRecoveryCode\(""\); setRecoveryCooldown\(60\);/)
  const sendAt = panel.indexOf('BUGHUNT-20261106: same staleness as resendRecoveryCode')
  assert.ok(sendAt > 0)
  const send = panel.slice(sendAt, sendAt + 400)
  assert.match(send, /await client\.requestEmailCode\(identifier\); setCode\(""\); setLoginCooldown\(60\);/)
})
