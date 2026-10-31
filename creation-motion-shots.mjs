// REQ-71 creation-motion shots — runs against whichever tree hosts this
// file (creation-motion worktree for "after", baseline 0a02800 for
// "before"). Captures: genre step hero + shelf wall at 360/390/430,
// the world step, a step-transition mid-frame, and the motion-off /
// reduced-motion states at 390. Writes PNGs + facts.json into
// creation-motion-shots/<SHOTS_TAG>/ (SHOTS_OUT overrides the root).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const tag = process.env.SHOTS_TAG || 'after'
const outRoot = process.env.SHOTS_OUT || path.join(repoRoot, 'creation-motion-shots')
const shotsDir = path.join(outRoot, tag)
fs.mkdirSync(shotsDir, { recursive: true })
const PORT = 8957
const base = `http://127.0.0.1:${PORT}`
const API_ORIGIN = 'http://localhost:5173'
const facts = { tag, checks: [] }
const check = (name, ok, detail = '') => {
  facts.checks.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(pathname, { method = 'GET', body, credential } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: API_ORIGIN,
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status}`)
  return data
}

const server = spawn('node', ['ratings-shots/dev-server.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'pipe',
})
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  const username = `req71_${tag}_${Math.floor(Math.random() * 1e6)}`
  const reg = await api('/api/auth/username/register', {
    method: 'POST',
    body: { username, password: 'req71-pass-1' },
  })
  const session = {
    uid: reg.uid, email: null, provider: 'username',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, token: reg.token,
  }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

  const openForge = async ({ width, height, motionOff = false, reduced = false }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      ...(reduced ? { reducedMotion: 'reduce' } : {}),
    })
    await context.addInitScript(({ sessionValue, motionOff }) => {
      try {
        localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue))
        if (motionOff) localStorage.setItem('storyweave:motion', 'off')
      } catch { /* storage unavailable */ }
    }, { sessionValue: session, motionOff })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.log('PAGEERROR:', error.message.split('\n')[0]))
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    const clickText = async (text, { exact = false } = {}) => {
      const handle = await page.evaluateHandle(({ text, exact }) => {
        const candidates = [...document.querySelectorAll('button, a, summary, [role="button"]')]
          .filter((el) => (exact ? el.textContent.trim() === text : el.textContent.includes(text)) && el.offsetParent !== null)
        return candidates[0] || null
      }, { text, exact })
      const element = handle.asElement()
      if (!element) throw new Error(`no visible control with text: ${text}`)
      await element.click()
    }
    // The shell settles asynchronously; retry the nav tap until the
    // forge's door line is actually on screen.
    let opened = false
    for (let attempt = 0; attempt < 8 && !opened; attempt += 1) {
      await page.waitForTimeout(900)
      const navClicked = await page.evaluate(() => {
        const nav = document.querySelector('.mobile-bottom-nav, nav')
        const inNav = nav ? [...nav.querySelectorAll('button')].find((el) => el.textContent.trim() === '造世') : null
        const anywhere = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '造世' && el.offsetParent !== null)
        const target = inNav || anywhere
        if (target) { target.click(); return true }
        return false
      })
      if (navClicked) {
        opened = await page.waitForFunction(
          () => document.body.innerText.includes('没灵感？试试从分类里找'),
          null,
          { timeout: 4000 },
        ).then(() => true).catch(() => false)
      }
    }
    if (!opened) throw new Error('forge did not open')
    return { context, page, clickText }
  }

  const shot = async (page, name, settle = 500) => {
    await page.waitForTimeout(settle)
    await page.screenshot({ path: path.join(shotsDir, name) })
    console.log('shot:', name)
  }
  const openShelves = async (page, clickText) => {
    await clickText('没灵感？试试从分类里找')
    await page.waitForTimeout(900)
    await page.evaluate(() => {
      document.querySelector('.shelf-grid')?.scrollIntoView({ block: 'start' })
    })
    await page.waitForTimeout(500)
  }

  // ——— Main pass, 390×844, motion on ———
  {
    const { context, page, clickText } = await openForge({ width: 390, height: 844 })
    await page.waitForTimeout(1400) // hero entrance settles into ambient loops
    const heroFacts = await page.evaluate(() => ({
      ringImg: Boolean(document.querySelector('.genre-hero-ring-img')),
      nebula: Boolean(document.querySelector('.genre-hero-nebula')),
      dust: Boolean(document.querySelector('.genre-hero-dust')),
      orbits: document.querySelectorAll('.genre-hero-orbit').length,
      oldDisc: Boolean(document.querySelector('.genre-hero-disc')),
      heroText: document.querySelector('.genre-hero-head strong')?.textContent || '',
    }))
    facts.hero = heroFacts
    await shot(page, 'genre-hero-390.png', 300)
    await openShelves(page, clickText)
    const shelfFacts = await page.evaluate(() => ({
      bricks: document.querySelectorAll('.shelf-brick').length,
      artSrcs: [...document.querySelectorAll('.shelf-brick-art')].map((img) => img.getAttribute('src')),
    }))
    facts.shelves = shelfFacts
    check('shelf wall renders 19 bricks (18 families + random)', shelfFacts.bricks === 19, `bricks=${shelfFacts.bricks}`)
    await shot(page, 'genre-shelves-390.png', 300)
    // The same-name label: 历史 is a single-template shelf, tapping it
    // selects the template directly and the note line restates the pick.
    await clickText('历史')
    await page.waitForTimeout(700)
    const note = await page.evaluate(() => document.querySelector('.world-selection-note')?.textContent.trim() || '')
    facts.pickedNote = note
    check('picked note has no duplicated name', !note.includes('历史 · 历史'), note.slice(0, 60))
    await shot(page, 'genre-picked-lishi-390.png', 300)
    // Step transition mid-frame: catch the panel ~130ms into its move.
    await clickText('继续')
    await page.waitForTimeout(130)
    await page.screenshot({ path: path.join(shotsDir, 'step-transition-midframe-390.png') })
    console.log('shot: step-transition-midframe-390.png')
    await page.waitForFunction(() => document.body.innerText.includes('故事发生在哪个世界'), null, { timeout: 20000 })
    await shot(page, 'world-step-390.png', 700)
    await context.close()
  }

  // ——— Width passes, 360×740 and 430×932 ———
  for (const [width, height] of [[360, 740], [430, 932]]) {
    const { context, page, clickText } = await openForge({ width, height })
    await page.waitForTimeout(1400)
    await shot(page, `genre-hero-${width}.png`, 300)
    await openShelves(page, clickText)
    await shot(page, `genre-shelves-${width}.png`, 300)
    await context.close()
  }

  // ——— Motion off ———
  {
    const { context, page, clickText } = await openForge({ width: 390, height: 844, motionOff: true })
    await page.waitForTimeout(1000)
    const offFacts = await page.evaluate(() => ({
      shellMotion: document.querySelector('.app-shell')?.getAttribute('data-motion') || document.documentElement.getAttribute('data-motion') || '',
      heroInline: document.querySelector('.genre-hero-vortex')?.getAttribute('style') || '',
      ringInline: document.querySelector('.genre-hero-ring-img')?.getAttribute('style') || '',
      inputVisible: Boolean(document.querySelector('.custom-genre-input')),
    }))
    facts.motionOff = offFacts
    check('motion off: hero layers carry no inline animation residue', offFacts.heroInline === '' && offFacts.ringInline === '', JSON.stringify(offFacts))
    await shot(page, 'genre-hero-motionoff-390.png', 300)
    await openShelves(page, clickText)
    await shot(page, 'genre-shelves-motionoff-390.png', 300)
    await context.close()
  }

  // ——— Reduced motion ———
  {
    const { context, page } = await openForge({ width: 390, height: 844, reduced: true })
    await page.waitForTimeout(1000)
    const reducedFacts = await page.evaluate(() => ({
      inputVisible: Boolean(document.querySelector('.custom-genre-input')),
      heroVisible: Boolean(document.querySelector('.genre-hero')),
      ringInline: document.querySelector('.genre-hero-ring-img')?.getAttribute('style') || '',
    }))
    facts.reduced = reducedFacts
    check('reduced motion: hero complete and still', reducedFacts.heroVisible && reducedFacts.inputVisible && reducedFacts.ringInline === '', JSON.stringify(reducedFacts))
    await shot(page, 'genre-hero-reduced-390.png', 300)
    await context.close()
  }

  await browser.close()
  fs.writeFileSync(path.join(shotsDir, 'facts.json'), JSON.stringify(facts, null, 2))
  console.log('facts written:', path.join(shotsDir, 'facts.json'))
} finally {
  server.kill()
}
