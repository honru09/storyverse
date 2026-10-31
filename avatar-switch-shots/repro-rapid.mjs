// Rapid-tap repro on the COLD lazy account: taps every 700ms like
// an impatient human (no waiting for image loads), logging every
// portrait response (url/status/size/ms) and the stage state at
// +0.3s after each tap and after a 6s settle.
// Usage: node repro-rapid.mjs <seedJson> <outDir>
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await context.addInitScript(({ session }) => {
  localStorage.setItem('storyweave.site-session', JSON.stringify(session))
  localStorage.setItem('storyweave:shell-theme', 'white')
  localStorage.setItem('storyweave:shell-theme-explicit', '1')
}, { session: seed.viewer.session })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
const t0 = Date.now()
page.on('response', (res) => {
  const url = res.url()
  if (url.includes('/portrait')) {
    const u = new URL(url)
    console.log(`[+${Date.now() - t0}ms] RESP ${res.status()} avatar=${u.searchParams.get('avatar')} variant=${u.searchParams.get('variant')}`)
  }
})
page.on('requestfailed', (req) => {
  if (req.url().includes('/portrait')) console.log(`[+${Date.now() - t0}ms] REQFAIL ${req.url()} ${req.failure()?.errorText}`)
})

const navBtn = (page, name) => page.locator('.mobile-bottom-nav').getByRole('button', { name })
const stageState = () => page.evaluate(() => {
  const root = document.querySelector('.profile-window-sheet')
  const img = root?.querySelector('.profile-showcase-img')
  return {
    name: root?.querySelector('.profile-showcase-name strong')?.textContent || '',
    src: img?.getAttribute('src') || null,
    complete: img ? img.complete : null,
    natural: img ? [img.naturalWidth, img.naturalHeight] : null,
  }
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await sleep(1200)
await navBtn(page, /主页/).click()
await page.waitForSelector('.profile-stat.is-button', { timeout: 20000 })
await page.locator('.profile-stat.is-button[aria-label^="查看关注的"]').click()
await page.waitForSelector('.profile-connections .profile-connection-row', { timeout: 20000 })
await sleep(800)
await page.locator('.profile-connections .profile-connection-main').first().click()
await page.waitForSelector('.profile-window-sheet .profile-showcase', { timeout: 20000 })
await sleep(400)
console.log('initial:', JSON.stringify(await stageState()))

const tiles = await page.locator('.profile-window-sheet .profile-avatar-tile').count()
console.log('tiles:', tiles)
for (let i = 0; i < tiles; i += 1) {
  await page.locator('.profile-window-sheet .profile-avatar-tile').nth(i).click()
  await sleep(300)
  console.log(`tap ${i + 1} +0.3s:`, JSON.stringify(await stageState()))
  await sleep(400)
}
console.log('--- settle 6s ---')
await sleep(6000)
const finalState = await stageState()
console.log('final:', JSON.stringify(finalState))
const fig = await page.locator('.profile-window-sheet .profile-showcase-figure').screenshot()
console.log('final figure pixels:', hash(fig))
fs.writeFileSync(path.join(outDir, 'rapid-final.json'), JSON.stringify(finalState, null, 2))
await page.screenshot({ path: path.join(outDir, 'rapid-final.png') })
await browser.close()
console.log('done')
