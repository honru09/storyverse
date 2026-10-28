// BILLING (§48) acceptance: against the fixture server (memory
// stores, username channel), sign a fresh reader in, walk
// 我的主页 → 设置 → 会员与额度 and prove the member window shows the
// honest first screen: my (empty) entitlement state, the redemption
// box, the six price cards at the set prices, and — the purchase
// channel being closed — the plain 即将开通 note with NO buy button
// anywhere. One 390×844 screenshot.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 8943
const BASE = `http://127.0.0.1:${PORT}`
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const child = spawn(process.execPath, [path.join(repoRoot, 'billing-shots', 'dev-server.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
})
try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break } catch { /* not up yet */ }
    await new Promise((resolve) => { setTimeout(resolve, 500) })
  }
  const registered = await fetch(`${BASE}/api/auth/username/register`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'billing_shot', password: 'password-123' }),
  })
  const { token, uid } = await registered.json()
  check('fixture registration', registered.ok && Boolean(token))

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate((session) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
  }, { uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 86_400_000, token })
  await page.reload({ waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: '我的主页', exact: true }).click()
  const settingsEntry = page.locator('section[aria-label="设置"] button')
  await settingsEntry.waitFor({ state: 'visible', timeout: 15_000 })
  await settingsEntry.click()
  const settingsDialog = page.getByRole('dialog', { name: '设置', exact: true })
  await settingsDialog.waitFor()
  await settingsDialog.getByRole('button', { name: /会员与额度/ }).click()
  const dialog = page.getByRole('dialog', { name: '会员与额度', exact: true })
  await dialog.waitFor()
  await dialog.getByText('还不是会员', { exact: true }).waitFor({ timeout: 15_000 })

  const text = await dialog.innerText()
  check('state: not a member yet', text.includes('还不是会员'))
  check('state: zero chapter credits', text.includes('章额度') && text.includes('0 章'))
  check('state: zero image credits', text.includes('图片额度') && text.includes('0 张'))
  check('redeem input present', await dialog.getByLabel('有兑换码？').count() === 1)
  check('redeem button present', await dialog.getByRole('button', { name: '兑换', exact: true }).count() === 1)
  for (const price of ['¥25', '¥68', '¥198', '¥6', '¥30']) {
    check(`price ${price} shown`, text.includes(price))
  }
  check('featured badge on the year card', text.includes('主推'))
  check('channel note is honest', text.includes('购买通道即将开通，可先用兑换码开通会员和额度。'))
  check('no buy buttons while the channel is closed', await dialog.getByRole('button', { name: /购买/ }).count() === 0)
  check('rules stay behind progressive disclosure', await dialog.locator('details.billing-rules:not([open])').count() === 1)

  await page.screenshot({ path: new URL('./member-390.png', import.meta.url).pathname })
  await browser.close()
} finally {
  child.kill()
}
console.log(results.every((r) => r.ok) ? 'ALL PASS' : 'SOME FAILED')
