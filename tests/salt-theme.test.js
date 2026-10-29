import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/* SALT §51 guard tests. Three jobs:
   1. The aurora palette (preservation order) keeps every pre-SALT
      value — the batch may only ADD name aliases that resolve to
      aurora's own tokens, never change a value.
   2. Black/white carry the frozen salt material tokens, and every
      information-bearing text grey clears the 4.5:1 contrast floor
      (ruling 2 / BH-02) on its ground AND on the card face.
   3. The blur discipline (ruling 1): no backdrop blur anywhere in the
      shell stylesheet exceeds 12px, and the spring easings carry no
      overshoot (ruling 3: ζ ≥ 1 expressed in CSS). */

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

test('SALT: black and white carry the frozen salt material tokens', () => {
  const black = themeBlock('black')
  for (const pin of [
    '--bg:#111214', '--bg-2:#17181b', '--ink:#eae9e4',
    '--surface-card:rgba(28,30,35,.72)', '--surface-modal:rgba(24,26,31,.88)',
    '--card-solid:#1c1e22', '--card-backdrop:none', '--float-solid:rgba(18,19,22,.94)',
    '--blur-bar:blur(12px) saturate(1.2)', '--blur-card:blur(10px) saturate(1.2)',
    '--text-disabled:#454850',
    // Brand identity is NOT part of this batch (ruling 4): the accent
    // family keeps its pre-SALT values in both themes.
    '--action:#6ee7ff', '--cyan:#6ee7ff',
  ]) assert.ok(black.includes(pin), `black ${pin}`)
  const white = themeBlock('white')
  for (const pin of [
    '--bg:#f6f5f2', '--bg-2:#efece6', '--ink:#1f2124',
    '--surface-card:rgba(255,255,255,.76)', '--surface-modal:rgba(250,249,246,.92)',
    '--card-solid:#faf9f6', '--card-backdrop:none', '--float-solid:rgba(248,249,251,.95)',
    '--blur-bar:blur(12px) saturate(1.2)', '--blur-card:blur(10px) saturate(1.2)',
    '--text-disabled:#b4b8bf',
    '--action:#0891b2',
  ]) assert.ok(white.includes(pin), `white ${pin}`)
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

test('SALT: no shell backdrop blur exceeds 12px; aurora bar keeps its own 16px', () => {
  // Aurora's chrome blur (16px) predates the batch and is frozen; it
  // reaches components only through aurora's own --blur-bar alias.
  const shellCss = css.replace(themeBlock('aurora'), '')
  for (const match of shellCss.matchAll(/backdrop-filter:blur\((\d+)px\)/g)) {
    assert.ok(Number(match[1]) <= 12, `literal backdrop blur ${match[1]}px within cap`)
  }
  for (const id of ['black', 'white']) {
    const block = themeBlock(id)
    for (const name of ['--blur-bar', '--blur-card', '--blur-modal', '--blur-panel']) {
      const value = tokenValue(block, name)
      const radius = Number(value.match(/blur\((\d+)px\)/)[1])
      assert.ok(radius <= 12, `${id} ${name} radius ${radius}px within cap`)
    }
  }
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
