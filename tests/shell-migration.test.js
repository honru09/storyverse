import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { SHELL_THEMES, DEFAULT_SHELL_THEME, resolveShellTheme, readShellTheme, storeShellTheme } from '../src/theme.js'
import { snapshotSourceViolation } from '../src/plaza.js'
import { aggregateStates } from '../src/story-map.js'
import { buildChapter, createStory } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const readerCss = readFileSync(new URL('../src/reading-preferences.css', import.meta.url), 'utf8')
const coverComponent = readFileSync(new URL('../src/components/StoryCover.jsx', import.meta.url), 'utf8')

const themeBlock = (id) => {
  const start = css.indexOf(`:root[data-shell-theme='${id}']{`)
  assert.ok(start !== -1, `theme block ${id} exists`)
  return css.slice(start, css.indexOf('}', start))
}
const navBlock = main.slice(main.indexOf('function MobileBottomNav'), main.indexOf('function Home'))
const profileBlock = main.slice(main.indexOf('function ProfilePage'), main.indexOf('function PlazaPublish'))
const feedBlock = main.slice(main.indexOf('function PlazaFeed'), main.indexOf('function PlazaDetail'))

test('three shell themes: black default, white, and aurora preserved value-for-value', () => {
  assert.deepEqual(SHELL_THEMES, ['black', 'white', 'aurora'])
  assert.equal(DEFAULT_SHELL_THEME, 'black')
  assert.equal(resolveShellTheme('nonsense'), 'black')
  assert.equal(resolveShellTheme('aurora'), 'aurora')
  // The aurora palette is the pre-migration :root, carried across
  // untouched — these are its recorded values (DESIGN pre-§27).
  const aurora = themeBlock('aurora')
  for (const pin of [
    '--bg:#060d1f', '--bg-2:#0a1430', '--ink:#eaf1ff', '--dim:#a9b9da',
    '--cyan:#6ee7ff', '--violet:#a78bfa', '--glass:rgba(148,178,255,.08)',
    '--line:rgba(168,196,255,.20)', '--surface:rgba(13,24,52,.82)',
    '--surface-solid:#0d1834', '--shadow-raised:0 18px 48px rgba(2,6,20,.5)',
    '--topbar-bg:rgba(6,13,31,.72)',
  ]) assert.ok(aurora.includes(pin), `aurora keeps ${pin}`)
  const black = themeBlock('black')
  assert.ok(black.includes('--bg:#050507'))
  assert.ok(black.includes('color-scheme:dark'))
  const white = themeBlock('white')
  assert.ok(white.includes('--bg:#f7f7f4'))
  assert.ok(white.includes('--ink:#17181c'))
  assert.ok(white.includes('color-scheme:light'))
  // Every theme defines the same core token names (one layout system).
  for (const token of ['--bg:', '--ink:', '--dim:', '--glass:', '--line:', '--surface:', '--action:', '--profile-bg:', '--profile-panel:', '--nav-bg:']) {
    for (const block of [aurora, black, white]) assert.ok(block.includes(token), `${token} in every theme`)
  }
  // Pre-paint: index.html declares the default and loads the external
  // resolver before first paint (details in the CSP test below).
  assert.match(indexHtml, /data-shell-theme="black"/)
  assert.match(indexHtml, /theme-init\.js/)
})

test('profile wears the DESIGN §15 values under the black theme', () => {
  const black = themeBlock('black')
  for (const pin of [
    '--profile-bg:#000000', '--profile-panel:#1b1b20', '--profile-chip:#26262b',
    '--profile-dim:#a7a7ad', '--profile-ink:#f4f5f7', '--medal-bg:#1d1f24',
    '--profile-edge:rgba(255,255,255,.08)', '--profile-shadow:0 8px 24px rgba(0,0,0,.35)',
  ]) assert.ok(black.includes(pin), `black profile keeps ${pin}`)
  // Profile rules consume the tokens, not hardcoded hexes.
  assert.match(css, /\.page-profile\{[^}]*background:var\(--profile-bg\)/)
  assert.doesNotMatch(css, /\.ryan-menu\{[^}]*background:#1b1b20/)
})

test('shell theme never leaks into the reader (red line)', () => {
  assert.doesNotMatch(readerCss, /data-shell-theme/)
  assert.doesNotMatch(readerCss, /shell-theme/)
})

test('profile is a window over the base page, closable back to place', () => {
  assert.match(main, /has-profile-window/)
  assert.match(main, /className="profile-window"/)
  assert.match(main, /profile-window-sheet/)
  assert.match(main, /const closeProfile = useCallback/)
  assert.match(main, /onClose=\{closeProfile\}/)
  // The base route is remembered; profile is not a page branch any more.
  assert.match(main, /const \[baseRoute, setBaseRoute\]/)
  assert.doesNotMatch(main, /else if \(view === "profile"\)/)
  // The window CSS recedes the base page and sheets the profile in.
  assert.match(css, /\.app-shell\.has-profile-window \.main-shell\{transform:scale\(\.98\)/)
  assert.match(css, /\.profile-window-sheet\{[^}]*border-radius:26px 26px 0 0/)
})

test("another user's profile renders no create/plus entry (user order 2026-10-28)", () => {
  const plusAt = profileBlock.indexOf('aria-label="新建故事"')
  assert.ok(plusAt !== -1, 'the create entry still exists for the owner')
  const before = profileBlock.slice(Math.max(0, plusAt - 260), plusAt)
  assert.match(before, /isSelf && \(/, 'the plus is gated on isSelf')
  assert.equal(profileBlock.split('aria-label="新建故事"').length - 1, 1, 'exactly one create entry on the profile')
})

test('face-anchor cropping: small round slots zoom portraits to the face', () => {
  assert.match(css, /\.plaza-avatar-frame\.is-portrait \.plaza-avatar-img\{transform:scale\(2\.05\);transform-origin:50% 14%\}/)
  assert.match(css, /\.nav-face-frame\.is-portrait \.nav-face-img\{transform:scale\(2\.05\)/)
  assert.match(css, /\.home-avatar-face-frame \.avatar-portrait-img\{[^}]*transform:scale\(2\.05\)/)
  const thumbBlock = main.slice(main.indexOf('function PlazaAvatarThumb'), main.indexOf('function PlazaLeadPortrait'))
  assert.match(thumbBlock, /pictureKind === "avatar"/)
  assert.match(thumbBlock, /plaza-avatar-frame/)
  // The full figure has exactly one home: the profile's avatar stand.
  assert.match(profileBlock, /profile-avatar-stand/)
  assert.match(css, /\.profile-avatar-stand-img\{[^}]*aspect-ratio:3\/4/)
})

test('fan geometry: front cover left-anchored, fan fills the frame, edges peek', () => {
  assert.match(main, /const STACK_STEP_PX = 18;/)
  assert.doesNotMatch(main, /STACK_CARD_WIDTH_PCT/)
  assert.match(main, /left: `\$\{index \* STACK_STEP_PX\}px`/)
  assert.match(main, /width: cardWidth/)
})

test('identity zero-wait: skeleton holds the header geometry, identity skips the stagger', () => {
  assert.match(profileBlock, /profile-skeleton/)
  assert.match(css, /\.profile-skeleton-avatar\{width:136px;height:136px/)
  const headerBlock = profileBlock.slice(profileBlock.indexOf('ryan-topbar'), profileBlock.indexOf('profile-shelf'))
  assert.doesNotMatch(headerBlock, /data-enter/)
})

test('plaza first screen: continue first, followed updates, folded publish card, lead card', () => {
  assert.match(feedBlock, /plaza-continue-card/)
  assert.ok(feedBlock.indexOf('plaza-continue-card') < feedBlock.indexOf('plaza-feed-list'), 'continue precedes the feed')
  assert.match(feedBlock, /followedUpdates/)
  assert.match(feedBlock, /关注动态/)
  assert.match(feedBlock, /plazaGateFor\(story\)\.publishable/)
  assert.match(feedBlock, /lead=\{index === 0\}/)
  assert.match(main, /plaza-card-lead/)
  assert.match(main, /PlazaLeadPortrait/)
})

test('snapshot source guard: real prose without the engine mark is stopped, local lines pass', () => {
  const local = createStory({})
  local.chapters = [buildChapter(local, 0)]
  assert.equal(snapshotSourceViolation(local), '', 'a genuine local story publishes')
  const marked = { ...local, engine: 'gemini', chapters: [{ index: 0, paragraphs: ['任何正文都行。'] }] }
  assert.equal(snapshotSourceViolation(marked), '', 'the gemini mark is proof enough')
  const incident = createStory({})
  incident.worldBible = { ...incident.worldBible, premise: '由模型写下的世界核心设定，和本地模板完全不同。' }
  incident.chapters = [{ index: 0, title: '第一章', paragraphs: ['这是模型真正写出的正文，和本地脚手架完全不同。'] }]
  assert.match(snapshotSourceViolation(incident), /已拦下发布/)
  const empty = createStory({})
  assert.equal(snapshotSourceViolation(empty), '', 'no prose, nothing to fabricate')
  // Version drift alone (local bible, drifted prose) is not an incident.
  const drifted = createStory({})
  drifted.chapters = [{ index: 0, title: '旧章', paragraphs: ['旧版本地引擎写下、措辞已经漂移的一章。'] }]
  assert.equal(snapshotSourceViolation(drifted), '', 'a local story with drifted prose still passes')
})

test('story map aggregates past the readability floor', () => {
  const hundred = Array.from({ length: 100 }, (_, index) => (index < 30 ? 'done' : index === 30 ? 'current' : index < 40 ? 'ready' : 'locked'))
  const segments = aggregateStates(hundred)
  assert.ok(segments.length <= 12, `100 chapters aggregate to ${segments.length} segments`)
  assert.equal(segments.find((segment) => segment.state === 'current')?.index, 30)
  assert.equal(segments[0].state, 'done')
  const small = Array.from({ length: 10 }, (_, index) => (index === 3 ? 'current' : 'locked'))
  const identity = aggregateStates(small)
  assert.equal(identity.length, 10)
  assert.equal(identity[3].state, 'current')
})

test('offline shell: service worker registered, honest data scope', () => {
  assert.ok(existsSync(new URL('../public/sw.js', import.meta.url)))
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /\/api\\\/library/)
  assert.match(sw, /\/api\\\/plaza/)
  assert.match(sw, /request\.method !== 'GET'/)
  assert.match(main, /serviceWorker\.register\("\/sw\.js"\)/)
})

test('finished books read 重新阅读 on the home hero (F-26)', () => {
  const homeBlock = main.slice(main.indexOf('function Home'), main.indexOf('function useShelfCapacity'))
  assert.match(homeBlock, /isStoryComplete\(activeStory\)[\s\S]{0,120}重新阅读/)
})

test('shell theme reads survive a denied localStorage (recovery e2e contract)', () => {
  const throwing = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.equal(readShellTheme(throwing), 'black')
  assert.equal(storeShellTheme('white', throwing), 'white')
  // The no-argument path must not touch the accessor outside its guard:
  // a throwing localStorage getter is exactly the private-mode shape.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
  try {
    assert.equal(readShellTheme(), 'black')
    assert.equal(storeShellTheme('aurora'), 'aurora')
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})

test('pre-paint theme script is external (the server CSP blocks inline scripts)', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(indexHtml, /<script src="\/theme-init\.js"><\/script>/)
  assert.ok(!indexHtml.includes("localStorage.getItem('storyweave:shell-theme')"), 'no inline theme script remains')
  const init = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8')
  assert.match(init, /storyweave:shell-theme/)
  assert.match(init, /dataset\.shellTheme/)
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /theme-init\.js/)
})

test('windowed profile cannot flex-shrink its header rows to zero', () => {
  // Regression (found by the migration shots): inside the fixed-height
  // window the profile column scrolls, and overflow:hidden flex items —
  // the clamped display name — collapse to height 0 without the guard.
  assert.match(css, /\.profile-window-sheet \.page-profile>\*\{flex-shrink:0\}/)
  assert.match(css, /-webkit-line-clamp:1;line-clamp:1/)
})

test('cover contract: top-anchored crop and an honest generating placeholder', () => {
  assert.match(css, /\.story-cover>img\{object-position:50% 28%\}/)
  assert.match(coverComponent, /status === "pending"/)
  assert.match(coverComponent, /封面生成中/)
})

test('help surface exists with a real feedback channel (F-33)', () => {
  assert.match(main, /function HelpContent/)
  assert.match(main, /github\.com\/honru09\/storyverse\/issues/)
  assert.match(main, /帮助与常见问题/)
})

test('following updates ride the self-only followingUids field (F-22)', () => {
  const social = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')
  assert.match(social, /payload\.followingUids = following\.map/)
  assert.match(feedBlock, /profile\?\.followingUids/)
})
