// Avatar-switch repro: viewer A opens B's window-form profile and
// clicks through all FIVE avatar tiles, recording after each click
// the stage name, the stage img src, and a pixel hash of the stage
// figure (so "src changed but pixels didn't" and "src never
// changed" are distinguishable). Then the same walk on B's OWN
// profile page as the self control.
// Usage: node repro.mjs <seedJson> <outDir>
import { webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const [seedPath, outDir] = process.argv.slice(2)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const BASE = 'http://127.0.0.1:8977'
fs.mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

const browser = await webkit.launch({
  env: {
    __EGL_VENDOR_LIBRARY_DIRS: '/tmp/wkfix/egl_vendor.d',
    LIBGL_DRIVERS_PATH: '/usr/lib/x86_64-linux-gnu/dri',
    EGL_PLATFORM: 'surfaceless',
    LIBGL_ALWAYS_SOFTWARE: '1',
  },
})

async function openApp(session) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await context.addInitScript(({ session }) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
    localStorage.setItem('storyweave:shell-theme', 'white')
    localStorage.setItem('storyweave:shell-theme-explicit', '1')
  }, { session })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  return { context, page }
}

const navBtn = (page, name) => page.locator('.mobile-bottom-nav').getByRole('button', { name })

async function stageState(page, scope) {
  return page.evaluate((scopeSel) => {
    const root = scopeSel ? document.querySelector(scopeSel) : document
    const img = root?.querySelector('.profile-showcase-img')
    const name = root?.querySelector('.profile-showcase-name strong')?.textContent || ''
    const selected = root?.querySelector('.profile-avatar-tile.is-selected .profile-avatar-tile-name')?.textContent || ''
    return { name, selected, src: img?.getAttribute('src') || null, natural: img ? [img.naturalWidth, img.naturalHeight] : null }
  }, scope)
}

async function figureHash(page, scope) {
  const el = page.locator(`${scope ? scope + ' ' : ''}.profile-showcase-figure`).first()
  const buf = await el.screenshot()
  return hash(buf)
}

async function walkTiles(page, scope, label) {
  const results = []
  const tileCount = await page.locator(`${scope ? scope + ' ' : ''}.profile-avatar-tile`).count()
  console.log(`${label}: ${tileCount} tiles`)
  for (let i = 0; i < tileCount; i += 1) {
    await page.locator(`${scope ? scope + ' ' : ''}.profile-avatar-tile`).nth(i).click()
    await sleep(900)
    await page.waitForFunction((scopeSel) => {
      const img = (scopeSel ? document.querySelector(scopeSel) : document)?.querySelector('.profile-showcase-img')
      return !img || (img.complete && img.naturalWidth > 0)
    }, scope, { timeout: 15000 }).catch(() => {})
    const state = await stageState(page, scope)
    const pixels = await figureHash(page, scope)
    const expected = seed.avatars[i]
    results.push({ click: i + 1, expectedName: expected?.name, expectedAvatar: expected?.id, ...state, pixels })
    console.log(`${label} click ${i + 1}: name=${state.name} selected=${state.selected} pixels=${pixels}`)
    console.log(`   src=${state.src}`)
  }
  return results
}

// ---- A opens B's window profile via the following list ----
{
  const { context, page } = await openApp(seed.viewer.session)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await navBtn(page, /主页/).click()
  await page.waitForSelector('.profile-stat.is-button', { timeout: 20000 })
  await page.locator('.profile-stat.is-button[aria-label^="查看关注的"]').click()
  await page.waitForSelector('.profile-connections .profile-connection-row', { timeout: 20000 })
  await sleep(800)
  await page.locator('.profile-connections .profile-connection-main').first().click()
  await page.waitForSelector('.profile-window-sheet .profile-showcase', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-window-sheet .profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(500)
  const initial = await stageState(page, '.profile-window-sheet')
  console.log('window initial:', JSON.stringify(initial))
  const results = await walkTiles(page, '.profile-window-sheet', 'window(B)')
  fs.writeFileSync(path.join(outDir, 'window-results.json'), JSON.stringify(results, null, 2))
  await page.screenshot({ path: path.join(outDir, 'window-final.png') })
  await context.close()
}

// ---- B's own profile page (self control) ----
{
  const { context, page } = await openApp(seed.owner.session)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await navBtn(page, /主页/).click()
  await page.waitForSelector('.profile-showcase', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-showcase-img')?.naturalWidth > 0, null, { timeout: 20000 })
  await sleep(500)
  const results = await walkTiles(page, '', 'self(B)')
  fs.writeFileSync(path.join(outDir, 'self-results.json'), JSON.stringify(results, null, 2))
  await page.screenshot({ path: path.join(outDir, 'self-final.png') })
  await context.close()
}

await browser.close()
console.log('done')
