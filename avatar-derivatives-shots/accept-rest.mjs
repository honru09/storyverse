// REQ-73 acceptance, remainder: the sections the main run's
// process did not reach before the VM reaped it (aurora window,
// bookstore x3 themes, state matrix). Same probes as accept.mjs;
// the completed sections' evidence is in accept73.log.
import { webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:8975'
const OUT = '/home/hatch/workspace/storyverse-avatar-derivatives/avatar-derivatives-shots'
const seed = JSON.parse(fs.readFileSync(path.join(OUT, 'seed.json'), 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL', m) }
const ok = (m) => console.log('ok', m)

const browser = await webkit.launch({
  env: {
    __EGL_VENDOR_LIBRARY_DIRS: '/tmp/wkfix/egl_vendor.d',
    LIBGL_DRIVERS_PATH: '/usr/lib/x86_64-linux-gnu/dri',
    EGL_PLATFORM: 'surfaceless',
    LIBGL_ALWAYS_SOFTWARE: '1',
  },
})

async function openApp(width, theme) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
  await context.addInitScript(({ session, theme }) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
    localStorage.setItem('storyweave:shell-theme', theme)
    localStorage.setItem('storyweave:shell-theme-explicit', '1')
  }, { session: seed.owner.session, theme })
  const page = await context.newPage()
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))
  return { context, page }
}

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

const IMG_PROBE = (selector) => {
  const img = document.querySelector(selector)
  if (!img) return null
  const cs = getComputedStyle(img)
  return {
    src: img.getAttribute('src'),
    natural: [img.naturalWidth, img.naturalHeight],
    fit: cs.objectFit, pos: cs.objectPosition, transform: cs.transform,
  }
}

function assertDerivative(probe, label, variant, naturalCheck) {
  if (!probe) { fail(`${label}: element not found`); return }
  const problems = []
  if (!probe.src || !probe.src.includes(`variant=${variant}`)) problems.push(`src lacks variant=${variant}: ${probe.src}`)
  if (!naturalCheck(probe.natural)) problems.push(`natural ${probe.natural} fails the derivative shape`)
  if (probe.transform !== 'none') problems.push(`transform ${probe.transform}`)
  if (probe.pos !== '50% 50%') problems.push(`object-position ${probe.pos}`)
  if (problems.length) fail(`${label}: ${problems.join('; ')}`)
  else ok(`${label}: ${variant} derivative live (${probe.natural[0]}x${probe.natural[1]}, no transform)`)
}
const assertFace = (probe, label) => assertDerivative(probe, label, 'face', ([w, h]) => w === 288 && h === 288)
const assertPortrait = (probe, label) => assertDerivative(probe, label, 'portrait', ([w, h]) => Math.abs(w / h - 0.75) <= 0.01)

const navBtn = (page, name) => page.locator('.mobile-bottom-nav').getByRole('button', { name })

async function openProfile(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await navBtn(page, /主页/).click()
  await page.waitForSelector('.profile-showcase', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(500)
}

// ---------- other-profile window (aurora remainder) ----------
{
  const theme = 'aurora'
  const tag = `390-${theme}`
  const { context, page } = await openApp(390, theme)
  await openProfile(page)
  await page.locator('.profile-stat.is-button[aria-label^="查看关注的"]').click()
  await page.waitForSelector('.profile-connections .profile-connection-row', { timeout: 20000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.profile-connections .nav-face-img')].every((i) => i.naturalWidth > 0), null, { timeout: 20000 })
  await sleep(300)
  assertFace(await page.evaluate(IMG_PROBE, '.profile-connections .nav-face-img'), `${tag} following row face`)
  await page.locator('.profile-connections .profile-connection-main').first().click()
  await page.waitForSelector('.profile-window-sheet .profile-showcase', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-window-sheet .profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(600)
  assertPortrait(await page.evaluate(IMG_PROBE, '.profile-window-sheet .profile-showcase-img'), `${tag} window showcase （沈知遥）`)
  await page.screenshot({ path: path.join(OUT, `window-${tag}.png`) })
  await context.close()
}

// ---------- bookstore: list + detail author ----------
for (const theme of ['white', 'black', 'aurora']) {
  const tag = `390-${theme}`
  const { context, page } = await openApp(390, theme)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await navBtn(page, /书城/).click()
  await page.waitForSelector('.store-book-card', { timeout: 20000 })
  await sleep(600)
  await page.screenshot({ path: path.join(OUT, `store-${tag}.png`) })
  await page.locator('.store-book-card .plaza-card-cover').first().click()
  await page.waitForSelector('.plaza-avatar-frame.is-large .plaza-avatar-img', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.plaza-avatar-frame.is-large .plaza-avatar-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(400)
  assertFace(await page.evaluate(IMG_PROBE, '.plaza-avatar-frame.is-large .plaza-avatar-img'), `${tag} book detail author`)
  await parkMid(page, '.plaza-avatar-panel')
  await page.screenshot({ path: path.join(OUT, `book-detail-${tag}.png`) })
  await context.close()
}

// ---------- state matrix ----------
{
  const { context, page } = await openApp(390, 'white')
  await openProfile(page)
  const stageState = () => page.evaluate(() => {
    const img = document.querySelector('.profile-showcase-img')
    const fig = document.querySelector('.profile-showcase-figure')
    const r = fig?.getBoundingClientRect()
    return { src: img?.getAttribute('src'), natural: [img?.naturalWidth, img?.naturalHeight], rect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null }
  })
  const before = await stageState()
  await page.locator('.profile-avatar-tile').nth(0).click()
  await page.waitForFunction((prev) => document.querySelector('.profile-showcase-img')?.getAttribute('src') !== prev, before.src, { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(500)
  const switched = await stageState()
  if (switched.src !== before.src && Math.abs(switched.natural[0] / switched.natural[1] - 0.75) <= 0.01) {
    ok(`matrix switch-avatar: stage now serves the other portrait derivative (${switched.natural[0]}x${switched.natural[1]})`)
  } else fail(`matrix switch-avatar: ${JSON.stringify(switched)}`)
  if (JSON.stringify(switched.rect.slice(2)) === JSON.stringify(before.rect.slice(2))) ok('matrix switch-avatar: figure geometry unchanged')
  else fail(`matrix switch-avatar: geometry moved ${JSON.stringify(before.rect)} -> ${JSON.stringify(switched.rect)}`)
  await parkMid(page, '.profile-showcase', 110)
  await page.screenshot({ path: path.join(OUT, 'state-switch-avatar.png') })
  await page.locator('.profile-avatar-tile').nth(1).click()
  await page.waitForFunction((prev) => document.querySelector('.profile-showcase-img')?.getAttribute('src') !== prev, switched.src, { timeout: 20000 })
  await sleep(500)
  await navBtn(page, /书城/).click()
  await page.waitForSelector('.store-book-card', { timeout: 20000 })
  await navBtn(page, /主页/).click()
  await page.waitForSelector('.profile-showcase', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(500)
  const returned = await stageState()
  if (returned.src === before.src) ok('matrix leave-return: stage serves the identical derivative after the round trip')
  else fail(`matrix leave-return: src drifted ${before.src} -> ${returned.src}`)
  await parkMid(page, '.profile-showcase', 110)
  await page.screenshot({ path: path.join(OUT, 'state-return.png') })
  await context.close()
}

await browser.close()
console.log(failures === 0 ? 'ACCEPT-REST: ALL GREEN' : `ACCEPT-REST: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
