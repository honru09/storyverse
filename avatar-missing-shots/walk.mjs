// REQ-58 walk (Chromium, 390x844): the exact user path.
//   seed state: account with ONE painted main avatar (阿灿).
//   1. open the app, go to the 主页 tab — the profile payload loads
//      (this is the frame the pre-fix session kept forever).
//   2. open the avatar page from the profile tab, create avatar #2
//      (沈砚) through the real form, paint it.
//   3. return to the 主页 tab WITHOUT reloading (keep-alive view).
//   4. read the avatar row: pre-fix it still lists only 阿灿 (the
//      bug); post-fix it lists 阿灿 + 沈砚.
// Usage: node walk.mjs <baseUrl> <seedPath> <outPrefix>
import { chromium } from 'playwright'
import fs from 'node:fs'

const [base, seedPath, outPrefix] = process.argv.slice(2)
if (!base || !seedPath || !outPrefix) throw new Error('usage: node walk.mjs <baseUrl> <seedPath> <outPrefix>')
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await context.addInitScript(({ session }) => {
  localStorage.setItem('storyweave.site-session', JSON.stringify(session))
  localStorage.setItem('storyweave:shell-theme', 'black')
  localStorage.setItem('storyweave:shell-theme-explicit', '1')
}, { session: seed.owner.session })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

const avatarRowNames = () => page.evaluate(() => {
  const section = document.querySelector('.page-form-profile section[aria-label="化身"], .page-profile section[aria-label="化身"]')
    || [...document.querySelectorAll('section[aria-label="化身"]')].find((el) => el.offsetParent !== null)
  if (!section) return null
  return [...section.querySelectorAll('.profile-avatar-tile-name')].map((el) => el.textContent.trim())
})

await page.goto(base, { waitUntil: 'load' })
await page.waitForSelector('nav.mobile-bottom-nav', { timeout: 20000 })
await sleep(800)
// 1. 主页 tab (page-form profile page mounts; payload loads once)
await page.locator('nav.mobile-bottom-nav button', { hasText: '主页' }).click()
await page.waitForSelector('section[aria-label="化身"]', { timeout: 15000 })
await sleep(600)
const before = await avatarRowNames()
console.log('avatar row after first profile load:', JSON.stringify(before))
await page.screenshot({ path: `${outPrefix}-step1-profile-one.png` })

// 2. avatar page via the section's 全部 › button; create #2 in the UI
await page.locator('section[aria-label="化身"] .profile-sec-more').click()
await page.waitForSelector('.avatar-card-new', { timeout: 15000 })
await page.locator('.avatar-card-new').click()
await page.waitForSelector('input[placeholder="给化身取个名字"]', { timeout: 10000 })
await page.fill('input[placeholder="给化身取个名字"]', '沈砚')
await page.fill('textarea[placeholder^="写一两句"]', '性子沉静的年轻人，出手却比谁都快，袖口总别着一枚旧铜钱。')
await page.locator('button', { hasText: '创建并生成立绘' }).click()
// paint is instant on the fixture; wait until the avatar list shows 沈砚
await page.waitForFunction(
  () => [...document.querySelectorAll('.avatar-card b')].some((el) => el.textContent.includes('沈砚')),
  { timeout: 30000 },
)
console.log('avatar page now lists 沈砚')

// 3. back to the 主页 tab — no reload, the keep-alive view resumes
await page.locator('nav.mobile-bottom-nav button', { hasText: '主页' }).click()
await sleep(900)
const after = await avatarRowNames()
console.log('avatar row after in-app creation:', JSON.stringify(after))

const section = page.locator('section[aria-label="化身"]').last()
await section.scrollIntoViewIfNeeded()
await sleep(300)
await page.screenshot({ path: `${outPrefix}-step2-profile-after-create.png` })
// Tight shot of the avatar tile row itself, centred in the viewport so
// the floating bottom nav cannot cover the names.
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.profile-avatar-row')]
    .find((el) => el.offsetParent !== null)
  if (row) row.scrollIntoView({ block: 'center' })
})
await sleep(400)
const rowBox = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.profile-avatar-row')]
    .find((el) => el.offsetParent !== null)
  if (!row) return null
  const rect = row.getBoundingClientRect()
  return { y: rect.y, height: rect.height }
})
if (rowBox) {
  await page.screenshot({
    path: `${outPrefix}-avatar-zone.png`,
    clip: { x: 0, y: Math.max(0, rowBox.y - 14), width: 390, height: rowBox.height + 28 },
  })
}
await browser.close()

const ok = Array.isArray(after) && after.includes('阿灿') && after.includes('沈砚')
console.log(JSON.stringify({ before, after, pageErrors, verdict: ok ? 'BOTH-AVATARS-SHOWN' : 'SECOND-AVATAR-MISSING' }))
process.exitCode = ok ? 0 : 2
