// POSTER-AVATAR evidence run: sign in as the seeded account, open 我的
// 主页， and prove the avatar stage carries the poster painting itself —
// no spot / floor / glow / blurred-backdrop nodes in the DOM, the img
// computed object-fit is cover anchored high, and the stage reads as
// one full-bleed poster. Viewport-only 390×844 screenshot.
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')
const PORT = 8937
const base = `http://127.0.0.1:${PORT}`
const results = []
const check = (name, fn) => Promise.resolve()
  .then(fn)
  .then(() => { results.push(`PASS ${name}`); console.log(`PASS ${name}`) })
  .catch((error) => { results.push(`FAIL ${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`) })

const server = spawn(process.execPath, ['poster-avatar-shots/dev-server.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('fixture server did not start')), 30000)
  server.stdout.on('data', (chunk) => { if (String(chunk).includes('poster fixture listening')) { clearTimeout(timer); resolve() } })
  server.stderr.on('data', (chunk) => process.stderr.write(chunk))
})

try {
  const register = await fetch(`${base}/api/auth/username/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: 'posterwalk', password: 'poster-pass-123' }),
  })
  const json = await register.json().catch(() => null)
  assert.equal(register.status, 200, `register posterwalk: ${JSON.stringify(json)}`)
  const session = { token: json.token, uid: json.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
  await context.addInitScript((sessionValue) => {
    try { window.localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue)) } catch { /* fails loudly below */ }
  }, session)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)

  await check('profile stage: poster fills the frame, fake light rig absent', async () => {
    await page.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' })
    await page.locator('.mobile-bottom-nav').waitFor()
    await page.getByRole('button', { name: '我的主页' }).click()
    const stage = page.locator('.profile-stage')
    await stage.waitFor()
    const img = stage.locator('.profile-stage-img')
    await img.waitFor()
    await page.waitForFunction(() => {
      const el = document.querySelector('.profile-stage-img')
      return el && el.complete && el.naturalWidth > 0
    })
    const probe = await stage.evaluate((el) => {
      const image = el.querySelector('.profile-stage-img')
      const style = getComputedStyle(image)
      const stageBox = el.getBoundingClientRect()
      const imgBox = image.getBoundingClientRect()
      return {
        spot: Boolean(el.querySelector('.profile-stage-spot')),
        floor: Boolean(el.querySelector('.profile-stage-floor')),
        glow: Boolean(el.querySelector('.profile-stage-glow')),
        bg: Boolean(el.querySelector('.profile-stage-bg')),
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        fillsWidth: Math.abs(imgBox.width - stageBox.width) < 1.5,
        fillsHeight: Math.abs(imgBox.height - stageBox.height) < 1.5,
        natural: [image.naturalWidth, image.naturalHeight],
      }
    })
    assert.equal(probe.spot, false, 'no spot wash node')
    assert.equal(probe.floor, false, 'no floor ellipse node')
    assert.equal(probe.glow, false, 'no glow copy node')
    assert.equal(probe.bg, false, 'no blurred backdrop node')
    assert.equal(probe.objectFit, 'cover')
    assert.match(probe.objectPosition, /8%/, 'crop anchors high, where the poster contract keeps the face')
    assert.equal(probe.fillsWidth, true, 'the painting fills the stage width')
    assert.equal(probe.fillsHeight, true, 'the painting fills the stage height')
    assert.ok(probe.natural[0] > 1000, 'the real poster sample is on stage')
    await stage.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(here, 'stage-poster-390.png') })
  })

  await check('avatar page carries the new-style line beside the repaint controls', async () => {
    await page.goto(`${base}/#/avatar`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.getByText('新风格：海报式立绘').waitFor({ timeout: 15000 })
  })

  await browser.close()
} finally {
  server.kill()
}

const failed = results.filter((line) => line.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exit(1)
