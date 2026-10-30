import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/* SALT guard tests (§51, updated to the §53 final values). Three jobs:
   1. The aurora palette (preservation order) keeps every pre-SALT
      value — the batch may only ADD name aliases that resolve to
      aurora's own tokens, never change a value.
   2. Black/white carry the frozen salt material tokens (§53: SALT-2
      ground/card lift + the SALT-3 frosted-glass group), and every
      information-bearing text grey clears the 4.5:1 contrast floor
      (ruling 2 / BH-02) on its ground AND on the card face.
   3. The blur discipline as amended by §53 (the user's frosted-glass
      order supersedes §51's "list cards never blur" rule for the
      black/white themes ONLY): literal backdrop blurs cap at the
      card radius 22px, the named glass tiers stay pinned (cards 22 /
      bars+dialogs 20 / chips 14 / nav 12), the legacy --blur-* tokens
      stay ≤12, aurora stays frozen (its own values, separately pinned
      above), and the spring easings carry no overshoot (ruling 3:
      ζ ≥ 1 expressed in CSS). */

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const themeBlock = (id) => {
  const start = css.indexOf(`:root[data-shell-theme='${id}']{`)
  assert.ok(start !== -1, `theme block ${id} exists`)
  return css.slice(start, css.indexOf('}', start))
}

const tokenValue = (block, name) => {
  const match = block.match(new RegExp(`${name}:([^;]+);`))
  assert.ok(match, `${name} is defined`)
  return match[1].trim()
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

test('SALT: aurora palette values are frozen; new names are aliases of its own tokens', () => {
  const aurora = themeBlock('aurora')
  for (const pin of [
    '--bg:#060d1f', '--bg-2:#0a1430', '--ink:#eaf1ff', '--dim:#a9b9da', '--dim-2:#8498bd',
    '--cyan:#6ee7ff', '--violet:#a78bfa', '--pink:#f0a6ff', '--amber:#ffd166',
    '--glass:rgba(148,178,255,.08)', '--line:rgba(168,196,255,.20)',
    '--surface:rgba(13,24,52,.82)', '--surface-solid:#0d1834',
    '--shadow-flat:0 8px 28px rgba(2,6,20,.35)', '--shadow-raised:0 18px 48px rgba(2,6,20,.5)',
    '--topbar-bg:rgba(6,13,31,.93)', '--nav-bg:rgba(6,13,31,.94)',
  ]) assert.ok(aurora.includes(pin), `aurora keeps ${pin}`)
  // The §51 material names exist under aurora too (shared components
  // speak them), but ONLY as aliases onto aurora's own pre-SALT tokens.
  for (const pin of [
    '--surface-card:var(--glass)', '--card-solid:var(--glass)', '--card-backdrop:blur(12px)',
    '--surface-modal:var(--surface-solid)', '--shadow-card:var(--shadow-flat)',
    '--shadow-floating:var(--shadow-raised)', '--text-disabled:var(--dim-2)',
    '--blur-bar:blur(16px) saturate(1.35)',
  ]) assert.ok(aurora.includes(pin), `aurora alias ${pin}`)
})

test('SALT: black and white carry the frozen salt material tokens (§53 final values)', () => {
  // §53 (SALT-2/3 + FIX, user-reviewed 2026-10-30) supersedes the §51
  // ground/card values and adds the frosted-glass token group; the
  // pins below are the final values copied from DESIGN §53.
  const black = themeBlock('black')
  for (const pin of [
    '--bg:#101012', '--bg-2:#151619', '--ink:#eae9e4',
    '--surface-card:rgba(32,34,39,.78)', '--surface-modal:rgba(24,26,31,.88)',
    '--card-solid:#202227', '--card-backdrop:none', '--float-solid:rgba(18,19,22,.94)',
    '--line:rgba(255,255,255,.10)', '--card-top-hi:rgba(255,255,255,.07)',
    '--blur-bar:blur(12px) saturate(1.2)', '--blur-card:blur(10px) saturate(1.2)',
    '--text-disabled:#454850',
    // §53 frosted-glass group (black): tint floor .48 is the contrast
    // red line; the nav tint lives here too (near-solid, ruling ②).
    '--glass-card-bg:rgba(24,27,33,.48)', '--glass-card-blur:blur(22px) saturate(1.45)',
    '--glass-card-line:rgba(255,255,255,.14)', '--glass-card-edge:rgba(255,255,255,.10)',
    '--glass-card-shadow:0 18px 44px -12px rgba(0,0,0,.55)', '--glass-card-radius:26px',
    '--glass-chip-bg:rgba(255,255,255,.10)', '--glass-chip-blur:blur(14px) saturate(1.35)',
    '--glass-nav-bg:rgba(19,20,23,.98)', '--glass-modal-bg:rgba(24,27,33,.66)',
    '--glass-panel-pad:rgba(10,12,16,.25)',
    '--detail-amb-opacity:.35', 'blur(48px) saturate(1.3) brightness(.82)',
    // Brand identity is NOT part of this batch (ruling 4): the accent
    // family keeps its pre-SALT values in both themes.
    '--action:#6ee7ff', '--cyan:#6ee7ff',
  ]) assert.ok(black.includes(pin), `black ${pin}`)
  const white = themeBlock('white')
  for (const pin of [
    '--bg:#edeae3', '--bg-2:#e6e2d9', '--ink:#1f2124',
    '--surface-card:rgba(255,255,255,.82)', '--surface-modal:rgba(250,249,246,.92)',
    '--card-solid:#ffffff', '--card-backdrop:none', '--float-solid:rgba(248,249,251,.95)',
    '--line:rgba(24,25,27,.09)', '--card-top-hi:rgba(255,255,255,.9)',
    '--blur-bar:blur(12px) saturate(1.2)', '--blur-card:blur(10px) saturate(1.2)',
    '--text-disabled:#b4b8bf',
    // §53 frosted-glass group (white): the glass edge is a BRIGHT edge
    // (line .70 white) with a faint dark outer ring; tint floor .50.
    '--glass-card-bg:rgba(255,255,255,.50)', '--glass-card-blur:blur(22px) saturate(1.45)',
    '--glass-card-line:rgba(255,255,255,.70)', '--glass-card-edge:rgba(24,25,27,.07)',
    '--glass-card-shadow:0 18px 44px -16px rgba(30,27,20,.18)', '--glass-card-radius:26px',
    '--glass-chip-bg:rgba(255,255,255,.55)', '--glass-chip-blur:blur(14px) saturate(1.35)',
    '--glass-nav-bg:rgba(252,252,249,.99)', '--glass-modal-bg:rgba(255,255,255,.68)',
    '--glass-panel-pad:rgba(255,255,255,.25)',
    '--detail-amb-opacity:.20', 'blur(48px) saturate(1.12) brightness(1.08)',
    '--action:#0891b2',
  ]) assert.ok(white.includes(pin), `white ${pin}`)
  // §53 detail-scope overrides (ruling ③): on the detail root the
  // glass tokens go denser + one step brighter-edged.
  assert.ok(css.includes("html[data-shell-theme='black'] .page-plaza:has(> .detail-ambience){--glass-card-bg:rgba(26,29,35,.60);--glass-card-line:rgba(255,255,255,.20)}"), 'detail scope black denser glass')
  assert.ok(css.includes("html[data-shell-theme='white'] .page-plaza:has(> .detail-ambience){--glass-card-bg:rgba(255,255,255,.72);--glass-card-edge:rgba(24,25,27,.12)}"), 'detail scope white denser glass')
})

test('SALT: information greys clear 4.5:1 on ground and card face in black and white', () => {
  for (const id of ['black', 'white']) {
    const block = themeBlock(id)
    const bg = tokenValue(block, '--bg')
    const card = tokenValue(block, '--card-solid')
    for (const name of ['--dim', '--dim-2']) {
      const value = tokenValue(block, name)
      assert.ok(contrast(value, bg) >= 4.5, `${id} ${name} ${value} on bg ${bg} = ${contrast(value, bg).toFixed(2)}`)
      assert.ok(contrast(value, card) >= 4.5, `${id} ${name} ${value} on card ${card} = ${contrast(value, card).toFixed(2)}`)
    }
  }
})

test('SALT: blur discipline per §53 — caps at the card tier, named tiers pinned, aurora frozen', () => {
  // Aurora's chrome blur (16px bar) predates the batch and is frozen;
  // it reaches components only through aurora's own --blur-bar alias,
  // so the aurora block is excluded from the cap scan (its values are
  // pinned verbatim by the aurora test above — never weakened).
  const shellCss = css.replace(themeBlock('aurora'), '')
  for (const match of shellCss.matchAll(/backdrop-filter:blur\((\d+)px\)/g)) {
    assert.ok(Number(match[1]) <= 22, `literal backdrop blur ${match[1]}px within the §53 card-tier cap`)
  }
  for (const id of ['black', 'white']) {
    const block = themeBlock(id)
    // The legacy §51 blur tokens keep their restrained radii.
    for (const name of ['--blur-bar', '--blur-card', '--blur-modal', '--blur-panel']) {
      const value = tokenValue(block, name)
      const radius = Number(value.match(/blur\((\d+)px\)/)[1])
      assert.ok(radius <= 12, `${id} ${name} radius ${radius}px within the legacy cap`)
    }
    // The §53 glass tiers are pinned, not capped: cards 22, chips 14.
    assert.ok(tokenValue(block, '--glass-card-blur').startsWith('blur(22px)'), `${id} card glass tier is 22px`)
    assert.ok(tokenValue(block, '--glass-chip-blur').startsWith('blur(14px)'), `${id} chip glass tier is 14px`)
  }
  // Bars and dialogs ride the 20px tier (topbar background alpha stays
  // on the BH-10 line; only the blur rose).
  assert.ok(css.includes('backdrop-filter:blur(20px) saturate(1.45)'), 'topbar/dialog glass tier is 20px')
})

test('SALT §53 rulings: profile exempt from glass, bottom nav near-solid', () => {
  // Ruling ① (user, 2026-10-30): the profile page keeps the pre-glass
  // (00042) presentation — the .page-profile scope neutralises the
  // hero-id/stats glass plates and the store-card glass, and drops
  // the SALT-3 banner mask.
  assert.ok(css.includes(".page-profile :is(.profile-hero-id,.profile-stats){background:none;backdrop-filter:none"), 'profile glass plates are neutralised in scope')
  assert.ok(css.includes('.page-profile .profile-store-card{background:var(--profile-card,var(--profile-panel))'), 'profile store card back on the 00042 surface')
  assert.ok(css.includes('.page-profile .profile-hero-bg'), 'profile banner mask override exists')
  // Ruling ②: nothing behind the floating capsule may stay legible —
  // the nav tint alpha is pinned at .98 (black) / .99 (white). The
  // spec's nominal .95/.97 still leaked heading strokes in the check
  // shots, so the floor is the measured value, not the nominal one.
  const alphaOf = (id) => Number(tokenValue(themeBlock(id), '--glass-nav-bg').match(/,([\d.]+)\)$/)[1])
  assert.ok(alphaOf('black') >= 0.98, `black nav alpha ${alphaOf('black')} >= .98`)
  assert.ok(alphaOf('white') >= 0.99, `white nav alpha ${alphaOf('white')} >= .99`)
  // The ambient layer the glass refracts exists for black/white only.
  assert.ok(css.includes("html[data-shell-theme='black'] .salt-ambient"), 'ambient layer renders for black')
  assert.ok(css.includes("html[data-shell-theme='white'] .salt-ambient"), 'ambient layer renders for white')
})

test('CONTRAST-FIX: page-level titles are pinned to the L1 ink, clearing 7:1 in black and white', () => {
  // The 2026-10-29 production point-check caught 「我的化身」 washing
  // out in the white theme. Root fragility: every page-level title
  // carried NO colour of its own and silently inherited — any tinted
  // or art-backed ancestor flips it (the BH-02 disease class). The
  // titles now pin color:var(--ink) in their own rules; this test
  // keeps the pin AND recomputes the ink pairings for real.
  for (const rule of [
    '.store-heading h1,.merge-heading h1{', '.plaza-heading h1{', '.write-heading h1{',
    '.sw-empty-page h1{', '.forge-section-heading h2{', '.section-heading h2{', '.reading-end h2{',
  ]) {
    const start = css.indexOf(rule)
    assert.ok(start !== -1, `${rule} exists`)
    const body = css.slice(start, css.indexOf('}', start))
    assert.ok(body.includes('color:var(--ink)'), `${rule} pins the L1 ink`)
  }
  // On-art exceptions stay on-art: the banner store title and the
  // resume-hero title are NOT swept into the ink pin.
  assert.ok(css.includes('.store-banner .store-heading h1{color:var(--on-art)'), 'banner title keeps --on-art')
  for (const id of ['black', 'white']) {
    const block = themeBlock(id)
    const ink = tokenValue(block, '--ink')
    const bg = tokenValue(block, '--bg')
    const card = tokenValue(block, '--card-solid')
    assert.ok(contrast(ink, bg) >= 7, `${id} ink ${ink} on bg ${bg} = ${contrast(ink, bg).toFixed(2)}`)
    assert.ok(contrast(ink, card) >= 7, `${id} ink ${ink} on card ${card} = ${contrast(ink, card).toFixed(2)}`)
  }
})

test('CONTRAST-FIX: the store banner CTA chip keeps on-art text at 4.5:1 over worst-case art', () => {
  const root = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')))
  const onArt = tokenValue(root, '--on-art')
  const chip = tokenValue(root, '--on-art-chip')
  const match = chip.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/)
  assert.ok(match, '--on-art-chip is an rgba scrim')
  const [, r, g, b, a] = match
  // Worst case: the chip composited over PURE WHITE art (the shade
  // gradient underneath only darkens further, so this is the floor).
  const overWhite = [r, g, b].map((c) => Math.round(Number(c) * Number(a) + 255 * (1 - Number(a))))
  const hex = `#${overWhite.map((c) => c.toString(16).padStart(2, '0')).join('')}`
  assert.ok(contrast(onArt, hex) >= 4.5, `${onArt} on chip-over-white ${hex} = ${contrast(onArt, hex).toFixed(2)}`)
  // And the banner CTA actually wears the chip — no layout move, the
  // rule only gains a backing.
  const ruleStart = css.indexOf('.store-banner .store-heading .small-link{')
  assert.ok(ruleStart !== -1, 'banner CTA rule exists')
  const ruleBody = css.slice(ruleStart, css.indexOf('}', ruleStart))
  assert.ok(ruleBody.includes('background:var(--on-art-chip)'), 'banner CTA wears the chip')
  assert.ok(ruleBody.includes('color:var(--on-art)'), 'banner CTA keeps --on-art text')
})

test('SALT: motion tokens carry no overshoot and the tab grammar is fade + indicator', () => {
  const root = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')))
  assert.ok(root.includes('--ease-pop:cubic-bezier(.25,1,.35,1)'), 'pop easing has no >1 control point')
  assert.ok(root.includes('--ease-press:cubic-bezier(.2,.9,.3,1)'), 'press easing has no overshoot')
  assert.ok(root.includes('--dur-tab:240ms'), 'tab indicator duration frozen')
  assert.ok(css.includes('.nav-indicator{'), 'bottom bar carries the sliding indicator')
  for (const view of ['home', 'plaza', 'forge', 'store', 'profile']) {
    assert.ok(css.includes(`.app-shell[data-view='${view}'] .page-enter`), `${view} switches by fade`)
  }
  assert.match(css, /@keyframes view-fade\{from\{opacity:0\}to\{opacity:1\}\}/)
  // The one sanctioned overshoot is keyframed (like), never a spring.
  assert.match(css, /@keyframes like-pop\{0%\{transform:scale\(\.82\)\}45%\{transform:scale\(1\.18\)\}/)
})
