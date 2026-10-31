// REQ-70 acceptance: the showcase ground + the unified face spec,
// driven on the owner's REAL portraits (juzi + acan production
// bytes) at 360/390/430 in WebKit. All waits are state-driven.
//   S  showcase: no backdrop element; halo = same src, same contain
//      geometry as the figure; fill painted with a sampled gradient
//      whose tones are the matte's own near-white
//   F  face spec: every rendered small portrait slot computes to
//      scale 1.7 at object-position 50% 0% — tiles (both avatars),
//      hero face, plaza post author, comment, book-detail author,
//      friend row
//   P  pictures: showcase card, tile row, plaza feed, book detail,
//      friend row — per width
import { webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:8974'
const OUT = '/home/hatch/workspace/storyverse-showcase-visual/showcase-visual-shots'
const seed = JSON.parse(fs.readFileSync(path.join(OUT, 'seed.json'), 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL', m) }
const ok = (m) => console.log('ok', m)

const browser = await webkit.launch({
  env: {
    __EGL_VENDOR_LIBRARY_DIRS: '/tmp/wklibs/usr/share/glvnd/egl_vendor.d',
    LIBGL_DRIVERS_PATH: '/tmp/wklibs/usr/lib/x86_64-linux-gnu/dri',
    EGL_PLATFORM: 'surfaceless',
    LIBGL_ALWAYS_SOFTWARE: '1',
  },
})

async function openApp(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
  await context.addInitScript(({ session }) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
    localStorage.setItem('storyweave:shell-theme', 'white')
    localStorage.setItem('storyweave:shell-theme-explicit', '1')
  }, { session: seed.owner.session })
  const page = await context.newPage()
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))
  return { context, page }
}

// Park an element toward mid-viewport and WAIT for the scroll to
// come to rest (headless WebKit applies programmatic scrolls
// seconds late — REQ-62 lesson; page-bottom sections also cannot
// always reach the target, so rest, not position, is the signal).
// Only then is a screenshot trustworthy: Playwright's own
// scroll-into-view would otherwise park the element at the bottom
// edge, under the floating nav.
async function parkMid(page, selector, targetTop = 220) {
  await page.evaluate(({ selector, targetTop }) => {
    const el = document.querySelector(selector)
    window.scrollBy(0, el.getBoundingClientRect().top - targetTop)
  }, { selector, targetTop })
  await page.waitForFunction((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect()
    if (!r) return false
    const y = Math.round(r.top * 10) / 10
    if (window.__parkY !== y) { window.__parkY = y; window.__parkAt = Date.now(); return false }
    return Date.now() - window.__parkAt > 900
  }, selector, { timeout: 25000 })
  await sleep(300)
}

const FACE_PROBE = (selector) => {
  const img = document.querySelector(selector)
  if (!img) return null
  const cs = getComputedStyle(img)
  const m = /matrix\(([^)]+)\)/.exec(cs.transform || '')
  const scale = m ? Number(m[1].split(',')[0]) : (cs.transform === 'none' ? 1 : NaN)
  return { scale, objectPosition: cs.objectPosition, objectFit: cs.objectFit, src: img.getAttribute('src') }
}

function assertFace(probe, label) {
  if (!probe) { fail(`${label}: element not found`); return }
  if (Math.abs(probe.scale - 1.7) < 0.02 && probe.objectPosition === '50% 0%') {
    ok(`${label}: face spec live (scale ${probe.scale}, position ${probe.objectPosition})`)
  } else {
    fail(`${label}: scale=${probe.scale} position=${probe.objectPosition} — spec is 1.7 @ 50% 0%`)
  }
}

for (const width of [360, 390, 430]) {
  const { context, page } = await openApp(width)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  // The bottom nav is the only safe door: feed bylines carry their
  // own 主页-labelled profile buttons that open a profile WINDOW.
  const navBtn = (name) => page.locator('.mobile-bottom-nav').getByRole('button', { name })
  await navBtn(/主页/).click()
  await page.waitForSelector('.profile-showcase', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  // The fill gradient lands after the sampler decodes the portrait.
  await page.waitForFunction(() => {
    const fill = document.querySelector('.profile-showcase-fill')
    return fill && getComputedStyle(fill).backgroundImage.includes('linear-gradient')
  }, null, { timeout: 20000 }).catch(() => fail(`${width}: showcase fill never received the sampled gradient`))
  await sleep(600)

  // ---- S: showcase structure ----
  const s = await page.evaluate(() => {
    const fig = document.querySelector('.profile-showcase-figure')
    const fg = document.querySelector('.profile-showcase-img')
    const halo = document.querySelector('.profile-showcase-halo')
    const fill = document.querySelector('.profile-showcase-fill')
    const fr = fig?.getBoundingClientRect()
    const hr = halo?.getBoundingClientRect()
    return {
      backdropCount: document.querySelectorAll('.profile-showcase-backdrop').length,
      fgSrc: fg?.getAttribute('src'), haloSrc: halo?.getAttribute('src'),
      fgFit: fg ? getComputedStyle(fg).objectFit : null,
      haloFit: halo ? getComputedStyle(halo).objectFit : null,
      haloBoxMatchesFigure: !!fig && !!halo && halo.offsetWidth === fig.clientWidth && halo.offsetHeight === fig.clientHeight,
      fillBg: fill ? getComputedStyle(fill).backgroundImage : null,
    }
  })
  console.log(`S ${width}`, JSON.stringify(s))
  if (s.backdropCount === 0) ok(`${width}: cover backdrop element is gone`)
  else fail(`${width}: backdrop element still rendered`)
  if (s.fgSrc && s.fgSrc === s.haloSrc) ok(`${width}: halo and figure share one src`)
  else fail(`${width}: halo src ${s.haloSrc} != figure src ${s.fgSrc}`)
  if (s.fgFit === 'contain' && s.haloFit === 'contain' && s.haloBoxMatchesFigure) ok(`${width}: halo geometry == figure geometry (contain, same box)`)
  else fail(`${width}: geometry mismatch fg=${s.fgFit} halo=${s.haloFit} boxMatch=${s.haloBoxMatchesFigure}`)
  const firstRgb = /rgb\((\d+), (\d+), (\d+)\)/.exec(s.fillBg || '')
  if (firstRgb && Number(firstRgb[1]) >= 225 && Number(firstRgb[2]) >= 225 && Number(firstRgb[3]) >= 225) {
    ok(`${width}: fill gradient opens on the matte's own near-white (${firstRgb[0]})`)
  } else fail(`${width}: fill gradient first stop is not the matte tone: ${s.fillBg?.slice(0, 90)}`)

  // ---- F: tiles + hero face ----
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.profile-avatar-tile-img img')].map((img) => {
    const cs = getComputedStyle(img)
    const m = /matrix\(([^)]+)\)/.exec(cs.transform || '')
    return { scale: m ? Number(m[1].split(',')[0]) : NaN, objectPosition: cs.objectPosition, src: img.getAttribute('src') }
  }))
  console.log(`F tiles ${width}`, JSON.stringify(tiles))
  if (tiles.length === 2) ok(`${width}: switcher row renders both avatars`)
  else fail(`${width}: expected 2 tiles, got ${tiles.length}`)
  tiles.forEach((t, i) => assertFace(t, `${width} tile[${i}]`))
  if (tiles.length === 2 && tiles[0].src !== tiles[1].src) ok(`${width}: the two tiles are the two different real portraits`)
  assertFace(await page.evaluate(FACE_PROBE, '.profile-hero-face img'), `${width} hero face`)

  // ---- P: profile pictures ----
  await page.locator('.profile-showcase').screenshot({ path: path.join(OUT, `showcase-${width}.png`) })
  await page.locator('.profile-avatar-row').screenshot({ path: path.join(OUT, `tiles-${width}.png`) })
  await page.screenshot({ path: path.join(OUT, `profile-${width}.png`) })

  // ---- F+P: friend row (nav-face 40px) ----
  // Element screenshots park the section at the viewport's bottom
  // edge, under the floating nav — position it mid-viewport and
  // clip instead, so the evidence shows the row itself.
  const friendRow = page.locator('.friends-sec .nav-face-frame.is-person img').first()
  if (await friendRow.count()) {
    assertFace(await page.evaluate(FACE_PROBE, '.friends-sec .nav-face-frame.is-person img'), `${width} friend row`)
    await parkMid(page, '.friends-sec')
    await page.screenshot({ path: path.join(OUT, `friends-${width}.png`) })
  } else fail(`${width}: friend row face not rendered`)

  // ---- Plaza: post author (40px) + comment (32px) ----
  await page.evaluate(() => window.scrollTo(0, 0))
  await navBtn(/广场/).click()
  await page.waitForSelector('.plaza-avatar-frame .plaza-avatar-img', { timeout: 20000 })
  await sleep(800)
  assertFace(await page.evaluate(FACE_PROBE, '.plaza-avatar-frame .plaza-avatar-img'), `${width} plaza post author`)
  await page.screenshot({ path: path.join(OUT, `plaza-${width}.png`) })
  // Open the post's inline comment thread (the chat action in the
  // post footer) to reach the 32px comment faces.
  await page.locator('.plaza-post').first().locator('.plaza-post-action').nth(1).click()
  await page.waitForSelector('.plaza-thread-row .plaza-avatar-img', { timeout: 20000 })
  await sleep(600)
  assertFace(await page.evaluate(FACE_PROBE, '.plaza-thread-row .plaza-avatar-img'), `${width} plaza comment`)
  await page.locator('.plaza-post').first().screenshot({ path: path.join(OUT, `plaza-post-${width}.png`) })

  // ---- Bookstore detail: author thumb (76px large frame) ----
  await navBtn(/书城/).click()
  await page.waitForSelector('.store-book-card', { timeout: 20000 })
  await sleep(600)
  await page.locator('.store-book-card .plaza-card-cover').first().click()
  await page.waitForSelector('.plaza-avatar-frame.is-large .plaza-avatar-img', { timeout: 20000 })
  await sleep(600)
  assertFace(await page.evaluate(FACE_PROBE, '.plaza-avatar-frame.is-large .plaza-avatar-img'), `${width} book detail author`)
  await page.screenshot({ path: path.join(OUT, `book-detail-${width}.png`) })
  await parkMid(page, '.plaza-avatar-panel')
  await page.screenshot({ path: path.join(OUT, `book-author-${width}.png`) })

  await context.close()
}

await browser.close()
console.log(failures === 0 ? 'ACCEPT: ALL GREEN' : `ACCEPT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
