// DEVICE-FIX2 guards (REQ-27..33): the static half of the batch — the
// behavioural half lives in the fixture walk
// (device-fix2-shots/shoot2.mjs: draft e2e, stage band probes, store
// containment assertions, forge bbox measurements, WebKit scale).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const accountCss = readFileSync(new URL('../src/account.css', import.meta.url), 'utf8')

function ruleBody(source, selector) {
  const at = source.indexOf(selector)
  assert.notEqual(at, -1, `${selector} rule exists`)
  const open = source.indexOf('{', at)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

// The cascade layers overrides in later same-selector blocks; a
// property counts as pinned when ANY block for the selector sets it.
function anyRuleBody(source, selector, pattern) {
  let at = source.indexOf(selector)
  assert.notEqual(at, -1, `${selector} rule exists`)
  while (at !== -1) {
    const open = source.indexOf('{', at)
    const close = source.indexOf('}', open)
    if (pattern.test(source.slice(open + 1, close))) return true
    at = source.indexOf(selector, close)
  }
  return false
}

test('REQ-27: the edit-profile sheet writes only from its save path', () => {
  const start = main.indexOf('function EditProfileSheet')
  const end = main.indexOf('\nfunction ', start + 10)
  const sheet = main.slice(start, end)
  // Draft staging exists for every control that used to write at once.
  for (const staged of ['stagedPictureKind', 'stagedPictureUpload', 'stagedBannerUpload', 'stagedBannerReset']) {
    assert.ok(sheet.includes(staged), `${staged} staged state present`)
  }
  // Each write API is called exactly once inside the sheet — in save().
  for (const write of ['updateMyProfile(', 'uploadMyPicture(', 'uploadMyBanner(', 'deleteMyBanner(']) {
    assert.equal(sheet.split(write).length - 1, 1, `${write} has a single call site (save)`)
  }
})

test('REQ-30: store cards hard-clip and the byline handle yields first', () => {
  assert.ok(anyRuleBody(css, '.store-book-card{', /overflow:hidden/))
  assert.ok(anyRuleBody(css, '.plaza-byline-handle{', /flex:1 1 0%/))
  assert.ok(anyRuleBody(css, '.plaza-byline-handle{', /min-width:0/))
  assert.ok(anyRuleBody(css, '.plaza-byline-name{', /min-width:4em/))
})

test('REQ-31: the profile window grab handle overlays the hero, never a blank band', () => {
  assert.ok(anyRuleBody(css, '.profile-window-sheet .profile-window-grab{', /position:absolute/))
  assert.ok(anyRuleBody(css, '.profile-window-sheet .page-profile{', /padding-top:0/))
})

test('REQ-32: forge actions are a fixed capsule on the mobile shell', () => {
  assert.match(css, /\.forge-actions\{position:fixed/)
  assert.doesNotMatch(css, /\.forge-actions\{position:sticky/)
})

test('REQ-33: shell backstop clips horizontal overflow without a scroll container', () => {
  assert.match(css, /html,body,#root\{overflow-x:clip\}/)
})

test('REQ-33: every text entry computes at 16px or more (iOS focus-zoom floor)', () => {
  // The global floor rule closes the set; component rules carry their
  // own 16px so no cascade accident can dip a field below it.
  assert.match(css, /input\[type="text"\],input\[type="search"\][^{]*\{font-size:16px\}/)
  const fixed = [
    '.friend-compose input{',
    '.friends-search-bar input{',
    '.profile-edit-field input{',
    '.profile-edit-field textarea{',
    '.store-search input{',
    '.plaza-composer-input{',
    '.plaza-thread-composer input{',
    '.billing-redeem-row input{',
  ]
  for (const selector of fixed) {
    assert.match(ruleBody(css, selector), /font-size:16px/, `${selector} at 16px`)
  }
  // The login scene override was the reported case: 15px there zoomed
  // the whole app after sign-in. (Two scene rules exist; the sizing
  // one is the block that carries min-height.)
  assert.match(ruleBody(accountCss, '.account-scene .account-form input { min-height: 45px'), /font-size: 16px/)
  assert.doesNotMatch(accountCss, /\.account-scene \.account-form input \{[^}]*font-size: 15px/)
})
