// REQ-63 measurement probe (not part of the test suite): renders the
// real store page from the fixture server at 360/390/430 and measures
// the store card's title slot — its true content width, the app font
// stack's CJK glyph advance at candidate sizes, and, by direct
// wrapping tests, how many full-width glyphs (incl. the 《》 pair) fit
// on one line and on two lines of the slot. The TITLE_MAX number is
// derived from this output, not guessed.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const PORT = 8957
const base = `http://127.0.0.1:${PORT}`
const API_ORIGIN = 'http://localhost:5173'

const engine = await import('./src/story-engine.js')
const { emptyLibrary } = await import('./src/persistence.js')
const { createStory, buildChapter, acceptChapter, chapterKey, chooseBranch } = engine

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
  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return data
}

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    current = acceptChapter(current, chapter, chapterKey(current, index))
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, chapter.choice.options[0].id)
    }
  }
  return current
}

const server = spawn('node', ['ratings-shots/dev-server.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'pipe',
})
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog += chunk })
server.stderr.on('data', (chunk) => { serverLog += chunk })

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
  }

  const reg = await api('/api/auth/username/register', {
    method: 'POST',
    body: { username: 'titleprobe_author', password: 'titleprobe-pass-1' },
  })
  const session = {
    uid: reg.uid, email: null, provider: 'username',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, token: reg.token,
  }
  const avatarResponse = await api('/api/avatar', {
    method: 'PUT',
    credential: reg.token,
    body: {
      profile: {
        name: '沈砚',
        description: '笑起来很亮的街头少年，好奇心比胆子大，口袋里总有糖。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    },
  })
  const avatar = avatarResponse.avatar
  const line = walkLocal(createStory({
    genreId: 'cultivation', genreTemplateId: 'xianxia', name: '沈砚', avatarId: avatar.id,
    avatarDescription: '背着旧剑的青年，眉眼冷，眼角一颗小痣。',
    avatarAppearance: { outfit: '洗旧的青衫', accessory: '一柄缺口铁剑' },
    ability: '借火一瞬', storyLengthMode: 'endless',
  }), 3)
  line.title = '从灵田杂役开始登天'
  const pub = await api('/api/store/publish', {
    method: 'POST', credential: reg.token,
    body: { story: { ...line, engine: 'gemini' } },
  })
  console.log('published probe book:', pub.book?.id, pub.book?.title)

  const library = { ...emptyLibrary(), stories: [line], activeStoryId: line.id }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

  for (const width of [360, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    await context.addInitScript(({ sessionValue, libraryValue }) => {
      try {
        localStorage.setItem('storyweave.site-session', JSON.stringify(sessionValue))
        localStorage.setItem('storyweave:v2', JSON.stringify(libraryValue))
        localStorage.setItem('storyweave:shell-theme', 'white')
        localStorage.setItem('storyweave:shell-theme-explicit', '1')
      } catch { /* storage unavailable */ }
    }, { sessionValue: session, libraryValue: library })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.log('PAGEERROR:', error.message.split('\n')[0]))
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    // Navigate to the bookstore tab.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button, a')].find((n) => n.textContent.trim() === '书城')
      el?.click()
    })
    await page.waitForSelector('.store-book-card', { timeout: 20000 })
    await page.waitForTimeout(600)

    const facts = await page.evaluate(() => {
      const card = document.querySelector('.store-book-card')
      const body = document.querySelector('.store-book-body')
      const slot = document.querySelector('.store-slot-title')
      const title = document.querySelector('.store-book-title')
      const grid = document.querySelector('.store-grid')
      const cs = getComputedStyle(title)
      const bodyCs = getComputedStyle(body)
      const slotWidth = slot.clientWidth
      const out = {
        viewport: window.innerWidth,
        cardWidth: card.getBoundingClientRect().width,
        gridWidth: grid.getBoundingClientRect().width,
        bodyClientWidth: body.clientWidth,
        bodyContentWidth: body.clientWidth - parseFloat(bodyCs.paddingLeft) - parseFloat(bodyCs.paddingRight),
        slotWidth,
        titleFontFamily: cs.fontFamily,
        titleFontWeight: cs.fontWeight,
        currentTitleFontSize: cs.fontSize,
        currentTitleText: title.textContent,
        sizes: {},
      }
      // Direct wrapping probe: a div with the slot's width, the title's
      // font stack/weight, candidate sizes, line-height 1.375. Find the
      // largest N of CJK glyphs (the string is 《 + N title chars + 》,
      // i.e. N+2 glyphs) that still fits on one line, and on two lines.
      const probe = document.createElement('div')
      probe.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;font-family:${cs.fontFamily};font-weight:${cs.fontWeight};line-height:1.375;word-break:break-all;overflow-wrap:anywhere;`
      probe.style.width = `${slotWidth}px`
      document.body.appendChild(probe)
      for (const size of [16, 15, 14, 13, 12.5, 12]) {
        probe.style.fontSize = `${size}px`
        const linePx = size * 1.375
        const fits = (totalGlyphs, lines) => {
          probe.textContent = `《${'书'.repeat(Math.max(0, totalGlyphs - 2))}》`
          return probe.getBoundingClientRect().height <= linePx * lines + 0.6
        }
        let oneLine = 0
        for (let g = 4; g <= 40; g += 1) { if (fits(g, 1)) oneLine = g; else break }
        let twoLines = 0
        for (let g = oneLine; g <= 60; g += 1) { if (fits(g, 2)) twoLines = g; else break }
        // Glyph advance check: width of 10 CJK chars on one line.
        probe.style.whiteSpace = 'nowrap'
        probe.textContent = '书'.repeat(10)
        const tenWidth = probe.getBoundingClientRect().width
        probe.style.whiteSpace = ''
        out.sizes[size] = { oneLineGlyphs: oneLine, twoLineGlyphs: twoLines, titleCharsTwoLines: twoLines - 2, advancePerGlyph: tenWidth / 10 }
      }
      probe.remove()
      return out
    })
    console.log(JSON.stringify(facts, null, 2))
    await context.close()
  }
  await browser.close()
} finally {
  server.kill('SIGTERM')
  if (process.exitCode) console.log(serverLog.slice(-2000))
}
