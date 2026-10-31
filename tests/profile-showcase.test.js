// REQ-64: the rebuilt avatar showcase container. This file replaces
// tests/profile-stage-guard.test.js (deleted with the guard module):
// where that file pinned parking math and guard arming, this one
// pins the ABSENCE of the whole guard line and the new container's
// structural rules. The owner's order (2026-10-31): the old stage
// and its guards go, a new container with new rules replaces them —
// after the REQ-62 settle guard stole 178px of scroll at the page
// bottom (measured repro in STAGE-REBUILD.md).
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

const ruleBody = (selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `${selector} exists`)
  return css.slice(at, css.indexOf('}', at))
}
const profileFn = main.slice(main.indexOf('function ProfilePage('), main.indexOf('function OfficialDemoEntry'))

test('REQ-64: the guard module and every arming point are gone', () => {
  assert.equal(existsSync(new URL('../src/profile-stage-guard.js', import.meta.url)), false)
  assert.doesNotMatch(main, /profile-stage-guard/)
  assert.doesNotMatch(main, /armRestoredStageGuard|armStageSettleGuard|stageParkTarget|stageParkScrollTop/)
})

test('REQ-64: the old stage container is gone from markup and styles', () => {
  assert.doesNotMatch(main, /profile-stage/)
  assert.doesNotMatch(css, /\.profile-stage/)
})

test('REQ-64: ProfilePage carries no scroll bookkeeping at all', () => {
  // No programmatic scrolling, no scroll-position restore, no
  // scroll recording: the surface never moves or remembers the
  // scroll position. (Other components keep their own logic; this
  // pin is scoped to the profile surface.)
  assert.doesNotMatch(profileFn, /scrollTo\(/)
  assert.doesNotMatch(profileFn, /\.scrollTop\s*=/)
  assert.doesNotMatch(profileFn, /rememberProfileViewState\(uid, \{ scroll/)
  // The staged-avatar memory is view state, not scroll state: kept.
  assert.match(profileFn, /rememberProfileViewState\(uid, \{ avatarId: stageAvatarId \}\)/)
})

test('REQ-64: the shell route effect arms nothing for the profile view', () => {
  assert.doesNotMatch(main, /page-profile\.is-page-form/)
})

test('REQ-73: figure box rule — 3:4 box, cover figure (REQ-64 box superseded; full pins in showcase-visual.test.js)', () => {
  assert.match(ruleBody('.profile-showcase-figure{'), /aspect-ratio:3\/4/)
  assert.match(ruleBody('.profile-showcase-img{'), /object-fit:cover/)
  // REQ-73: the card is a vertical character card, width
  // min(82%, 320px), flex pinned; no max-height may flatten the
  // figure box. (The card rule is the flex:none one — a separate
  // .profile-showcase rule carries the scroll-margin for anchor
  // landings.)
  assert.match(ruleBody('.profile-showcase{flex:none'), /width:min\(82%,320px\)/)
  assert.doesNotMatch(ruleBody('.profile-showcase{flex:none'), /max-height/)
})

test('REQ-64: the name plate is in flow below the figure, never an overlay', () => {
  assert.doesNotMatch(ruleBody('.profile-showcase-plate{'), /position:absolute/)
  const figureAt = main.indexOf('profile-showcase-figure')
  const plateAt = main.indexOf('profile-showcase-plate')
  assert.ok(figureAt >= 0 && plateAt > figureAt, 'plate follows the figure in the markup')
})

test('REQ-64: information parity — name, main badge, description, ability, world, tiles', () => {
  assert.match(profileFn, /profile-showcase-name/)
  assert.match(profileFn, /profile-main-badge/)
  assert.match(profileFn, /profile-showcase-desc/)
  assert.match(profileFn, /profile-showcase-ability/)
  assert.match(profileFn, /profile-showcase-world/)
  assert.match(profileFn, /profile-avatar-row/)
})

test('REQ-62 pin carried over: the settings entry row carries no explanatory subtitle', () => {
  assert.ok(!main.includes('都收在这里'), 'settings subtitle must stay gone')
  assert.match(main, /settings-entry-row/)
})
