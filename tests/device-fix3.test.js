// DEVICE-FIX3 (REQ-35/36/37): guards for the avatar-stage verdict,
// the aurora adaptation audit and the §54 card text spec. Evidence:
// device-fix3-shots/ (real-portrait three-theme stage shots, the
// slice reproduction, the aurora surface walk, the worst-case card
// walk); write-up in DEVICE-FIX3.md.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { textUnitsFor, clipToUnits, countTextFor, cardIntroExcerptFor } from '../src/plaza.js'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const social = readFileSync(new URL('../server/social.js', import.meta.url), 'utf8')
const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8')

const ruleBody = (selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `${selector} exists`)
  return css.slice(at, css.indexOf('}', at))
}

/* ——— G1 (REQ-35): the stage itself was never the cropper ———————— */

test('REQ-35: the stage still shows the whole figure (contain), in every theme', () => {
  /* REQ-64 supersedes the container: .profile-stage is deleted and
   * the figure now lives in .profile-showcase-img — the REQ-35
   * verdict (contain, never theme-narrowed back to cover) carries
   * over to the new box verbatim. */
  assert.match(ruleBody('.profile-showcase-img{'), /object-fit:contain/)
  // No theme-scoped rule may narrow the showcase back to cover.
  assert.ok(!css.includes("[data-shell-theme='aurora'] .profile-showcase"), 'no aurora showcase override')
  assert.ok(!css.includes("[data-shell-theme='black'] .profile-showcase img"), 'no black showcase img override')
})

test('REQ-35: scroll landings park the profile sections below the sticky topbar', () => {
  assert.match(ruleBody('.profile-sec{'), /scroll-margin-top:calc\(84px \+ env\(safe-area-inset-top\)\)/)
  assert.match(ruleBody('.profile-showcase{'), /scroll-margin-top:calc\(84px \+ env\(safe-area-inset-top\)\)/)
})

test('REQ-35: the service worker version moved, so installed clients retire v1 caches', () => {
  /* LOCAL-CACHE (REQ-50) moved the shell to v3; the REQ-35 guard's
   * intent stands — the version must keep advancing off v1/v2 so the
   * activate handler retires the caches those shells wrote. */
  assert.match(sw, /const VERSION = 'storyweave-v3'/)
  assert.ok(!sw.includes("const VERSION = 'storyweave-v1'"), 'v1 is gone')
  assert.ok(!sw.includes("const VERSION = 'storyweave-v2'"), 'v2 is gone')
})

/* ——— G2 (REQ-36 → REQ-41): aurora and the detail ambience ——————— */

test('REQ-36/41: the detail ambience renders in all three themes; aurora carries its own ambience tokens', () => {
  // DEVICE-FIX3 (REQ-36) disposition was 冻结保留: the §53 ambience
  // layer was display:none outside the salt themes, the undefined
  // --detail-amb-* tokens in aurora inert, aurora's detail page its
  // pre-freeze design — pinned then so no batch would un-hide a salt
  // treatment inside the frozen theme.
  // SUPERSEDED by AURORA-ALIGN (REQ-41, user order 2026-10-30 16:21
  // 「极光也向黑白看齐」): the ambience now renders under aurora too,
  // with aurora's own token values (deep-navy identity untouched —
  // the identity pins below still stand verbatim).
  const ambienceDisplay = ruleBody("html[data-shell-theme='black'] .detail-ambience,html[data-shell-theme='white'] .detail-ambience,html[data-shell-theme='aurora'] .detail-ambience{")
  assert.match(ambienceDisplay, /display:block/)
  const aurora = css.slice(css.indexOf(":root[data-shell-theme='aurora']"), css.indexOf(":root[data-shell-theme='black']"))
  assert.ok(aurora.includes('--detail-amb-opacity:.38'), 'aurora adopts the ambience tokens at its own values')
  assert.ok(aurora.includes('--detail-amb-filter:blur(48px) saturate(1.3) brightness(.88)'), 'aurora ambience filter is its own value')
  // The identity itself is untouched: aurora's own values stand.
  assert.match(aurora, /--bg:#060d1f/)
  assert.match(aurora, /--nav-bg:rgba\(6,13,31,\.94\)/)
})

/* ——— G3 (REQ-37 / §54): spec-first card text ——————————————————— */

test('§54 units: CJK counts 2, latin counts 1', () => {
  assert.equal(textUnitsFor('织界官方'), 8)
  assert.equal(textUnitsFor('regression_1029b'), 16)
  assert.equal(textUnitsFor('疯狂的王兴润'), 12)
  assert.equal(textUnitsFor('a汉b'), 4)
  assert.equal(clipToUnits('疯狂的王兴润的奇妙大冒险世界', 12), '疯狂的王兴润')
  assert.equal(clipToUnits('short', 20), 'short')
})

test('§54 counts: plain under 10k, 万 shorthand at and above it', () => {
  assert.equal(countTextFor(0), '0')
  assert.equal(countTextFor(9999), '9999')
  assert.equal(countTextFor(10000), '1万')
  assert.equal(countTextFor(12345), '1.2万')
  assert.equal(countTextFor(123456), '12.3万')
  assert.equal(countTextFor(200000), '20万')
})

test('§54 intro excerpt: whole when it fits, clause-bounded when it does not, never an ellipsis', () => {
  const short = { synopsis: '短简介一句话。' }
  assert.equal(cardIntroExcerptFor(short), '短简介一句话。')
  const long = {
    synopsis: '雾港的钟在午夜自己响起来，没有人敲它，听见的人都会忘记一件小事。第二天醒来，城里多了一扇昨天不存在的门，门后是海。守钟人说那是潮汐在数数，数错了，世界就要重来一遍，谁也不敢睡。',
  }
  const out = cardIntroExcerptFor(long)
  assert.ok(textUnitsFor(out) <= 40, `excerpt fits the slot (${textUnitsFor(out)} units)`)
  assert.ok(/[，。；！？、：]$/.test(out), 'excerpt ends at a clause boundary')
  assert.ok(!out.includes('…') && !out.includes('...'), 'no ellipsis, ever')
  assert.ok(long.synopsis.startsWith(out), 'excerpt is a true prefix')
})

test('§54 slots (STORE-DESIGN v3 form): the store card body is fixed slots, and no slot ellipsizes', () => {
  const card = main.slice(main.indexOf('function StoreBookCard'), main.indexOf('function Store('))
  for (const slot of ['store-slot-title', 'store-slot-name', 'store-slot-handle']) {
    assert.ok(card.includes(slot), `${slot} present`)
  }
  assert.equal(card.split('store-slot-meta').length - 1, 2, 'status+length / rating own one meta slot each')
  // STORE-DESIGN v3 (user rules 2026-10-30 15:54 + 16:10): the intro
  // and the chips no longer ride the card (detail page only), and the
  // share count moved to the detail page with them.
  assert.ok(!card.includes('store-chips-block'), 'chip rows are gone')
  assert.ok(!card.includes('cardIntroExcerptFor(book)'), 'no intro excerpt on the card')
  assert.ok(!card.includes('shareCount'), 'no share count on the card')
  assert.ok(card.includes('countTextFor(book.ratingCount)'), 'rating count uses the §54 format')
  assert.ok(card.includes('暂无评价'), 'an unrated book says so instead of leaving a void')
  assert.ok(!card.includes('store-book-byline'), 'the squeezed byline is gone')
  // The store body rules must not resurrect ellipsis anywhere. The
  // slice is bounded by the ratings section that follows the card
  // block (the old '.store-card-status{' end anchor moved far away
  // in the STORE-DESIGN merge and would swallow plaza rules).
  const bodyCss = css.slice(css.indexOf('.store-book-body{'), css.indexOf('/* Book ratings (RATINGS)'))
  assert.ok(!/text-overflow:\s*ellipsis/.test(bodyCss), 'no text-overflow:ellipsis in the store card body')
  // REQ-63 (DESIGN §56) narrows the no-clamp rule by one named
  // exception: the title itself may wrap to two lines and carries a
  // clamp purely as the guard for pre-limit legacy titles — new
  // titles are bounded at the source (BOOK_TITLE_MAX), so the clamp
  // is not the mechanism that keeps titles whole. Every other slot
  // still forbids clamp outright.
  const titleRule = bodyCss.match(/\.store-book-title\{[^}]*\}/)?.[0] || ''
  assert.ok(/-webkit-line-clamp:2/.test(titleRule), 'the title clamp is the two-line guard')
  assert.ok(!/-webkit-line-clamp/.test(bodyCss.replace(titleRule, '')), 'no line-clamp rescue anywhere else in the store card body')
})

test('§54 source caps: display name is rejected over 18 units at the write path', () => {
  assert.match(social, /textUnitsOf\(name\) > 18/)
  assert.match(main, /setDisplayName\(clipToUnits\(event\.target\.value, 18\)\)/)
  assert.match(main, /customWorldName: clipToUnits\(event\.target\.value, 12\)/)
})

test('§54: the spec lives in DESIGN.md', () => {
  assert.match(design, /## §54 卡面文字规格/)
  assert.match(design, /countTextFor/)
  assert.match(design, /cardIntroExcerptFor/)
})
