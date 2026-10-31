// REQ-70 (SHOWCASE-VISUAL): the showcase's same-proportion ground and
// the ONE face-anchor spec for every small avatar slot.
//
// The owner's 00051 report, twice over: (1) the showcase read as a
// small picture pasted on a big blurred one — foreground contain and
// backdrop cover were two different scales of the same painting;
// (2) "the avatar is still not solved" = every small slot cropped by
// its own private constants (2.05 @ 50% 14% here, 3.4 @ 50% 11%
// there, 1.9 @ 50% 3% elsewhere), so the same two portraits landed at
// different facial scales from slot to slot — and the harder zooms
// cropped the leaf off one head and the chin off another.
//
// These pins keep both fixes structural: the spec lives in four
// :root variables and nowhere else, and the showcase's layers share
// one geometry by construction.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { sampleEdgeColors } from '../src/art-edges.js'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

const ruleBody = (selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `${selector} exists`)
  return css.slice(at, css.indexOf('}', at))
}

test('REQ-70: the face spec is defined once, in :root, with the measured constants', () => {
  const root = ruleBody(':root{')
  assert.match(root, /--face-pos:50% 0%/)
  assert.match(root, /--face-zoom:1\.7/)
  assert.match(root, /--face-origin:50% 0%/)
  assert.match(root, /--face-plain-pos:50% 12%/)
  // And only once: no second definition may creep into a theme block.
  assert.equal(css.split('--face-zoom:').length - 1, 1)
})

const PORTRAIT_RULES = [
  // The leading newline anchors the BASE rule — the editor stage's
  // opt-out override (.avatar-frame .avatar-portrait-img) contains
  // the same substring and is pinned separately below.
  '\n.avatar-portrait-img{',
  '.nav-face-frame.is-portrait .nav-face-img{',
  '.plaza-avatar-frame.is-portrait .plaza-avatar-img{',
  '.profile-avatar-tile-img img{',
  '.profile-hero-face.is-portrait img{',
  '.profile-edit-preview-frame.is-portrait .profile-edit-preview{',
  '.ryan-avatar-frame.is-portrait .ryan-avatar{',
]

test('REQ-70: every small portrait slot crops by the shared spec — same anchor, same zoom, same origin', () => {
  for (const selector of PORTRAIT_RULES) {
    const body = ruleBody(selector)
    assert.match(body, /object-position:var\(--face-pos\)/, selector)
    assert.match(body, /transform:scale\(var\(--face-zoom\)\)/, selector)
    assert.match(body, /transform-origin:var\(--face-origin\)/, selector)
    // No private literal may ride along: a numeric scale or a
    // percentage origin in any of these rules IS the old disease.
    assert.doesNotMatch(body, /scale\(\d/, selector)
    assert.doesNotMatch(body, /transform-origin:\d/, selector)
  }
})

const PLAIN_RULES = [
  '.nav-face-img{',
  '.plaza-avatar-frame .plaza-avatar-img{',
  '.ryan-avatar{',
  '.profile-edit-preview{',
  '.profile-hero-face img{',
]

test('REQ-70: uploaded/default pictures take the plain anchor and no zoom, everywhere', () => {
  for (const selector of PLAIN_RULES) {
    const body = ruleBody(selector)
    assert.match(body, /object-position:var\(--face-plain-pos\)/, selector)
    assert.doesNotMatch(body, /transform/, selector)
  }
})

test('REQ-70: the retired private zooms are gone from the stylesheet', () => {
  assert.ok(!css.includes('scale(2.05)'), 'the 2.05 headshot zoom is retired')
  assert.ok(!css.includes('scale(3.4)'), 'the 32px-frame 3.4 chin-cropper is retired')
  assert.ok(!css.includes('.is-portrait .plaza-avatar-img{transform:scale(3.4)'))
  assert.ok(!css.includes(':not(.is-large).is-portrait'), 'no per-size portrait override remains')
})

test('REQ-70: the avatar editor stage opts out of the face crop explicitly (whole figure surface)', () => {
  assert.match(ruleBody('.avatar-frame .avatar-portrait-img{'), /transform:none/)
  assert.match(ruleBody('.avatar-frame .avatar-portrait-img{'), /object-position:var\(--face-plain-pos\)/)
})

test('REQ-70: showcase — the cover backdrop is retired; fill + same-geometry halo replace it', () => {
  assert.ok(!css.includes('profile-showcase-backdrop'), 'no backdrop rule remains')
  assert.ok(!main.includes('profile-showcase-backdrop'), 'no backdrop markup remains')
  assert.doesNotMatch(css, /\.profile-showcase[^{]*\{[^}]*background-size:cover/)
  // The ground: a fill span (painted from sampled edge tones by
  // ShowcaseFill) and a halo that is the same image at the figure's
  // own contain geometry — same fit, same anchor point.
  assert.match(ruleBody('.profile-showcase-fill{'), /position:absolute/)
  const halo = ruleBody('.profile-showcase-halo{')
  assert.match(halo, /object-fit:contain/)
  assert.match(halo, /object-position:50% 50%/)
  assert.match(halo, /filter:blur\(26px\)/)
  assert.match(ruleBody('.profile-showcase-img{'), /object-fit:contain/)
  // Markup: fill and halo and figure all read the SAME portrait URL.
  assert.match(main, /<ShowcaseFill url=\{stageAvatar\.portraitUrl\} \/>/)
  assert.match(main, /className="profile-showcase-halo"\s+src=\{stageAvatar\.portraitUrl\}/)
  assert.match(main, /from "\.\/art-edges\.js"/)
})

test('REQ-70: edge sampler — a white-matted portrait samples white edges (the seam cannot exist)', () => {
  // Synthetic stand-in for the owner's real matte portrait: a white
  // canvas with a coloured panel inset, JPEG-encoded like the real
  // pipeline's output, then decoded and sampled.
  const width = 200; const height = 280
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const inPanel = x >= 30 && x < 170 && y >= 40 && y < 250
      data[i] = inPanel ? 110 : 255
      data[i + 1] = inPanel ? 165 : 255
      data[i + 2] = inPanel ? 225 : 255
      data[i + 3] = 255
    }
  }
  const encoded = jpeg.encode({ data, width, height }, 95)
  const decoded = jpeg.decode(Buffer.from(encoded.data), { useTArray: true, formatAsRGBA: true })
  const edges = sampleEdgeColors(decoded)
  const channels = (rgb) => rgb.match(/\d+/g).map(Number)
  for (const side of ['top', 'bottom', 'left', 'right', 'average']) {
    assert.ok(channels(edges[side]).every((v) => v >= 235), `${side} is matte-white: ${edges[side]}`)
  }
})

test('REQ-70: edge sampler — a full-bleed dark portrait samples its own dark ground', () => {
  const width = 120; const height = 160
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const centre = Math.abs(x - 60) < 20 && Math.abs(y - 60) < 30
      data[i] = centre ? 90 : 22
      data[i + 1] = centre ? 80 : 26
      data[i + 2] = centre ? 70 : 44
      data[i + 3] = 255
    }
  }
  const encoded = jpeg.encode({ data, width, height }, 95)
  const decoded = jpeg.decode(Buffer.from(encoded.data), { useTArray: true, formatAsRGBA: true })
  const edges = sampleEdgeColors(decoded)
  const channels = (rgb) => rgb.match(/\d+/g).map(Number)
  assert.ok(channels(edges.top).every((v) => v <= 80), `top stays dark: ${edges.top}`)
  assert.ok(channels(edges.bottom).every((v) => v <= 80), `bottom stays dark: ${edges.bottom}`)
})

test('REQ-70: edge sampler — guards and gradient direction', () => {
  assert.equal(sampleEdgeColors(null), null)
  assert.equal(sampleEdgeColors({ data: null, width: 0, height: 0 }), null)
  const width = 60; const height = 80
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const warm = y < height / 2
      data[i] = warm ? 238 : 30
      data[i + 1] = warm ? 218 : 40
      data[i + 2] = warm ? 188 : 92
      data[i + 3] = 255
    }
  }
  const edges = sampleEdgeColors({ data, width, height })
  const lum = (rgb) => rgb.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0)
  assert.ok(lum(edges.top) > lum(edges.bottom), 'the falloff follows the painting, not a fixed theme colour')
})
