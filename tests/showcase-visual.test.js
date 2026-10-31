// REQ-73 (SHOWCASE-VISUAL → DERIVATIVES): the showcase and every
// small avatar slot read server-baked derivative images; CSS holds
// no crop recipe at all.
//
// History, so the pins read honestly: REQ-70 pinned the opposite
// structure — ONE CSS face-anchor spec in four :root variables —
// and the owner's real device rejected it a third time (00053: a
// portrait pasted in a wide card, two tiles at two facial scales,
// a white bar on a tile). The root cause was structural: CSS does
// not know where the subject or the face is in an arbitrary
// painting, so every CSS recipe is a guess some real portrait
// breaks. REQ-73 moves the normalisation into the pixels
// (server/avatar-derivatives.js, DESIGN §59): a baked 3:4
// 'portrait' derivative for the showcase, a baked 288² 'face'
// derivative for every small slot. The pixel-level behaviour is
// pinned in tests/avatar-derivatives.test.js; this file pins the
// UI contract — the retired machinery stays retired, and every
// surface reads the derivative it is supposed to read.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const avatarClient = readFileSync(new URL('../src/avatar.js', import.meta.url), 'utf8')

const ruleBody = (selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `${selector} exists`)
  return css.slice(at, css.indexOf('}', at))
}

test('REQ-73: the §58 CSS crop machinery is fully retired', () => {
  assert.ok(!css.includes('--face-'), 'no --face-* variable survives in the stylesheet')
  assert.ok(!css.includes('is-portrait'), 'no is-portrait selector survives')
  assert.ok(!main.includes('is-portrait'), 'no is-portrait class is emitted')
  assert.ok(!existsSync(new URL('../src/art-edges.js', import.meta.url)), 'the client edge sampler module is deleted')
  assert.ok(!main.includes('art-edges'), 'no import of the retired sampler remains')
  assert.ok(!main.includes('ShowcaseFill'), 'the ground-fill component is gone')
  assert.ok(!css.includes('.profile-showcase-fill'), 'the ground-fill rule is gone')
  assert.ok(!css.includes('.profile-showcase-halo'), 'the halo rule is gone')
  assert.ok(!main.includes('profile-showcase-halo'), 'the halo markup is gone')
  // And the historical private zooms stay gone with them.
  assert.ok(!css.includes('scale(2.05)') && !css.includes('scale(3.4)') && !css.includes('scale(1.7)'), 'no avatar zoom constants remain')
})

test('REQ-73: every small slot rule is a plain centre cover — no transform, no anchor recipe', () => {
  const slots = [
    '\n.avatar-portrait-img{',
    '.nav-face-img{',
    '.plaza-avatar-frame .plaza-avatar-img{',
    '.profile-avatar-tile-img img{',
    '.profile-hero-face img{',
    '.profile-edit-preview{',
    '.ryan-avatar{',
  ]
  for (const selector of slots) {
    const body = ruleBody(selector)
    assert.match(body, /object-fit:cover/, selector)
    assert.doesNotMatch(body, /transform/, `${selector} carries no transform`)
    assert.doesNotMatch(body, /var\(--/, `${selector} carries no variable-driven recipe`)
  }
})

test('REQ-73: the showcase is a vertical character card fed by ONE baked image', () => {
  assert.match(ruleBody('.profile-showcase{flex:none'), /width:min\(82%,320px\)/)
  assert.match(ruleBody('.profile-showcase-figure{'), /aspect-ratio:3\/4/)
  assert.match(ruleBody('.profile-showcase-img{'), /object-fit:cover/)
  // Exactly one img on the stage, reading the portrait derivative.
  const showcaseBlock = main.slice(main.indexOf('className="profile-showcase"'), main.indexOf('profile-avatar-row'))
  assert.equal(showcaseBlock.split('<img').length - 1, 1, 'one image on the stage')
  assert.match(showcaseBlock, /derivativeUrl\(stageAvatar\.portraitUrl, "portrait"\)/)
  // The name plate still flows below the figure (REQ-64, kept).
  assert.doesNotMatch(ruleBody('.profile-showcase-plate{'), /position:absolute/)
})

test('REQ-73: every small surface reads the face derivative', () => {
  assert.match(main, /derivativeUrl\(item\.portraitUrl, "face"\)/, 'switcher tiles')
  assert.match(main, /derivativeUrl\(item\.picture\?\.url, "face"\)/, 'notification rows')
  assert.match(main, /derivativeUrl\(person\.picture\?\.url, "face"\)/, 'connection / friend rows')
  assert.match(main, /derivativeUrl\(pictureSrc, "face"\)/, 'profile hero face')
  assert.match(main, /derivativeUrl\(picturePreviewUrl, "face"\)/, 'profile edit preview')
  assert.match(main, /derivativeUrl\(publication\?\.avatar\?\.pictureUrl, "face"\)/, 'plaza avatar thumb')
  assert.match(main, /derivativeUrl\(picture\?\.url, "face"\)/, 'person picture (posts / comments / ratings)')
  // AvatarPortrait thumbnails go through the authenticated fetch
  // with the variant parameter; the editor stage opts out with
  // variant={null} and keeps the whole painting.
  assert.match(main, /variant = "face"/, 'AvatarPortrait defaults to the face derivative')
  assert.match(main, /variant=\{null\}/, 'the editor stage reads the original')
  assert.match(avatarClient, /params\.set\('variant', effectiveVariant\)/)
})

test('REQ-73: the derivative URL helper only rewrites derivative-carrying URLs', async () => {
  // Static assets and foreign URLs must pass through untouched —
  // worse, a blob: preview URL must never be mangled.
  const { derivativeUrl } = await import('../src/avatar.js')
  assert.equal(derivativeUrl('/default-avatar.svg', 'face'), '/default-avatar.svg')
  assert.equal(derivativeUrl('blob:http://x/y', 'face'), 'blob:http://x/y')
  assert.equal(derivativeUrl('/art/banner-profile-1600.webp', 'portrait'), '/art/banner-profile-1600.webp')
  assert.equal(
    derivativeUrl('/api/users/username%3Aa/portrait?avatar=x&v=2', 'portrait'),
    '/api/users/username%3Aa/portrait?avatar=x&v=2&variant=portrait',
  )
  assert.equal(
    derivativeUrl('/api/users/username%3Aa/picture?v=3', 'face'),
    '/api/users/username%3Aa/picture?v=3&variant=face',
  )
  assert.equal(derivativeUrl('', 'face'), '')
  assert.equal(derivativeUrl(null, 'face'), null)
})
