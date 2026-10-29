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
    // BUGHUNT-FIX (BH-10) is the one sanctioned exception to the
    // untouched aurora palette: the topbar alpha rose in all three
    // themes so scrolled text can no longer be read through the bar.
    '--topbar-bg:rgba(6,13,31,.93)',
  ]) assert.ok(aurora.includes(pin), `aurora keeps ${pin}`)
  // SALT §51 supersedes the BH-10-era pins for black/white: the bars
  // are frosted glass now, but the alpha stays high (.88/.90) so the
  // BH-10 read-through defect cannot return; the lite-GPU fallback
  // (--float-solid, .94/.95) covers the no-blur case.
  assert.ok(themeBlock('black').includes('--topbar-bg:rgba(17,18,20,.88)'), 'black topbar stays unread-through (BH-10 under SALT §51)')
  assert.ok(themeBlock('white').includes('--topbar-bg:rgba(246,245,242,.90)'), 'white topbar stays unread-through (BH-10 under SALT §51)')
  const black = themeBlock('black')
  assert.ok(black.includes('--bg:#111214'))
  assert.ok(black.includes('color-scheme:dark'))
  const white = themeBlock('white')
  assert.ok(white.includes('--bg:#f6f5f2'))
  assert.ok(white.includes('--ink:#1f2124'))
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

test('profile tokens are aliases of the shell tokens in every theme (PROFILE-FIX §33 C1)', () => {
  // §27 parked the §15 refero values inside the theme blocks; §33
  // retires the parallel family: each --profile-* token is now an
  // alias of the shell token that plays the same role, so the profile
  // can never drift from the shell palette again — and the black
  // theme's paper is the shell's own --bg, not #000 beside #050507.
  for (const id of ['black', 'white', 'aurora']) {
    const block = themeBlock(id)
    for (const pin of [
      '--profile-bg:var(--bg)', '--profile-ink:var(--ink)', '--profile-dim:var(--dim)',
      '--profile-panel:var(--surface-solid)', '--profile-chip:var(--glass-2)',
      '--medal-bg:var(--glass-2)', '--profile-edge:var(--line)',
      '--profile-shadow:var(--shadow-flat)', '--profile-action-bg:var(--ink)',
      '--pill-ink:var(--bg)', '--sheet-bg:var(--surface-solid)', '--sheet-ink:var(--ink)',
    ]) assert.ok(block.includes(pin), `${id} profile alias ${pin}`)
    assert.doesNotMatch(block, /--profile-bg:#/, `${id} profile paper is an alias, not a hex`)
  }
  // Profile rules consume the tokens, not hardcoded hexes.
  assert.match(css, /\.page-profile\{[^}]*background:var\(--profile-bg\)/)
  assert.doesNotMatch(css, /\.ryan-menu\{[^}]*background:#1b1b20/)
  // The edit sheet wears the theme too: no hardcoded white paper left.
  assert.match(css, /\.profile-edit-sheet\{[^}]*background:var\(--sheet-bg\)/)
  assert.doesNotMatch(css, /\.profile-edit-sheet\{[^}]*background:#fff/)
})

test('shell theme never leaks into the reader (red line)', () => {
  assert.doesNotMatch(readerCss, /data-shell-theme/)
  assert.doesNotMatch(readerCss, /shell-theme/)
})

test('profile forms: mine is a tab page, another user\'s is a window closable back to place (§33)', () => {
  // My profile renders as a page branch of the shell (A1)…
  assert.match(main, /const ownProfilePage = /)
  assert.match(main, /else if \(view === "profile"\)/)
  assert.match(main, /is-page-form/)
  // …and someone else's renders as the window over the base page.
  assert.match(main, /has-profile-window/)
  assert.match(main, /className=\{`profile-window \$\{profileClosing \? "is-closing" : ""\}`\}/)
  assert.match(main, /profile-window-sheet/)
  assert.match(main, /const closeProfile = useCallback/)
  assert.match(main, /const requestCloseProfile = useCallback/)
  assert.match(main, /onClose=\{requestCloseProfile\}/)
  // The base route is remembered underneath the window.
  assert.match(main, /const \[baseRoute, setBaseRoute\]/)
  // The exit plays in reverse: closing keyframes exist for both layers.
  assert.match(css, /@keyframes profile-window-down/)
  assert.match(css, /\.profile-window\.is-closing \.profile-window-sheet\{animation:profile-window-down 320ms/)
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
  // The 32px author frame zooms harder (§33 D): a whole tiny figure in
  // the circle is the failure this line exists to prevent.
  assert.match(css, /\.plaza-avatar-frame:not\(\.is-large\)\.is-portrait \.plaza-avatar-img\{transform:scale\(3\.4\);transform-origin:50% 11%\}/)
  assert.match(css, /\.nav-face-frame\.is-portrait \.nav-face-img\{transform:scale\(2\.05\)/)
  assert.match(css, /\.home-avatar-face-frame \.avatar-portrait-img\{[^}]*transform:scale\(2\.05\)/)
  const thumbBlock = main.slice(main.indexOf('function PlazaAvatarThumb'), main.indexOf('function PublicationArtwork'))
  assert.match(thumbBlock, /pictureKind === "avatar"/)
  assert.match(thumbBlock, /plaza-avatar-frame/)
  // The full figure has exactly one home: the profile's avatar stage
  // (PROFILE-ENRICH §35 supersedes the §33 stand: same class name, new
  // stage geometry — spotlight, atmosphere, name plate).
  assert.match(profileBlock, /profile-avatar-stand/)
  // BH-13 (2026-10-29) supersedes the fixed 384px band: the stage takes
  // the poster's own 3:4 frame (capped), so the face and upper body stay
  // in frame instead of losing 20–30% of the painting to cover-cropping.
  assert.match(css, /\.profile-stage\{[^}]*aspect-ratio:3\/4/)
  assert.match(css, /\.profile-stage\{[^}]*max-height:560px/)
  // BH-13: the avatar tiles join the face-anchor family (50% 12% + the
  // large-frame 2.05 zoom) instead of squeezing the whole figure into
  // the square, and selected+main collapses to a single ring.
  assert.match(css, /\.profile-avatar-tile-img img\{[^}]*object-position:50% 12%/)
  assert.match(css, /\.profile-avatar-tile-img img\{[^}]*transform:scale\(2\.05\);transform-origin:50% 14%/)
  assert.match(css, /\.profile-avatar-tile\.is-selected\.is-main \.profile-avatar-tile-img\{box-shadow:none\}/)
})

test('poster stage (POSTER-AVATAR): the fake light rig is retired, the painting fills the stage', () => {
  assert.doesNotMatch(main, /profile-stage-spot|profile-stage-floor|profile-stage-glow|profile-stage-bg/)
  assert.doesNotMatch(css, /\.profile-stage-spot|\.profile-stage-floor|\.profile-stage-glow|\.profile-stage-bg/)
  assert.match(css, /\.profile-stage-img\{[^}]*object-fit:cover/)
  assert.match(css, /\.profile-stage-img\{[^}]*object-position:50% 8%/)
})

test('boards retired (PROFILE-ENRICH §35): the fan collage gives way to shelf / store / stage sections', () => {
  // §27's 合集 fan geometry belonged to the boards the enriched
  // profile replaces; the sections that replace it are pinned here so
  // the retirement is a decision, not an accident.
  assert.doesNotMatch(main, /STACK_STEP_PX/)
  assert.match(profileBlock, /profile-shelf-row/)
  assert.match(profileBlock, /profile-store-card|ProfileStoreCard/)
  assert.match(profileBlock, /profile-stage/)
})

test('identity zero-wait: skeleton holds the header geometry, identity skips the stagger', () => {
  assert.match(profileBlock, /profile-skeleton/)
  // §35: the skeleton now holds the ambience hero's geometry (348px),
  // superseding the §33 centred-face shapes.
  assert.match(css, /\.profile-skeleton-hero\{height:348px/)
  const headerBlock = profileBlock.slice(profileBlock.indexOf('ryan-topbar'), profileBlock.indexOf('profile-shelf'))
  assert.doesNotMatch(headerBlock, /data-enter/)
})

test('plaza first screen: continue first, followed posts, folded composer, publish card (BOOKSTORE-PLAZA)', () => {
  // The stream replaced the book-grid lead surface: continue-reading
  // still opens the page, the followed strip now carries followed
  // authors' POSTS, and posting starts from one folded line.
  assert.match(feedBlock, /plaza-continue-card/)
  assert.ok(feedBlock.indexOf('plaza-continue-card') < feedBlock.indexOf('plaza-feed-heading'), 'continue precedes the stream')
  assert.match(feedBlock, /followedPosts/)
  assert.match(feedBlock, /关注动态/)
  assert.match(feedBlock, /plazaGateFor\(story\)\.publishable/)
  assert.match(feedBlock, /plaza-composer-bar/)
  assert.match(feedBlock, /说点什么，或分享一本书/)
  assert.doesNotMatch(main, /PlazaLeadPortrait/)
  assert.doesNotMatch(main, /plaza-card-lead/)
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

test('resume hero is art-first (BH-12): no panel over the cover, copy rides the scrim', () => {
  // The translucent navy panel that used to cover 43–46% of the hero
  // must not come back; the copy is bare text on the ::after scrim and
  // the actions share one wrapping row (primary pill + ghost links).
  assert.doesNotMatch(css, /\.hero-copy\{[^}]*rgba\(10,20,48/)
  assert.doesNotMatch(css, /\.hero-copy\{[^}]*backdrop-filter/)
  assert.match(css, /\.hero-copy\{[^}]*color:var\(--on-art\)/)
  assert.match(css, /\.hero-actions\{display:flex;flex-wrap:wrap/)
  assert.match(css, /\.hero-actions \.button-primary\{flex:1 1 140px\}/)
  assert.match(css, /\.home-hero \.gen-state\.is-waiting\{color:var\(--on-art-dim\)\}/)
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
