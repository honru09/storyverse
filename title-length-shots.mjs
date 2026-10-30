// REQ-63 acceptance shots (companion to title-length-probe.mjs): seeds
// the fixture bookstore with an ordinary short title, an ordinary
// 10-character title, and a REAL fused line whose name the new merge
// builder composes — then at 390px asserts the two-line title format
// (44px slot on every card, same-row cards equal height, the maxed
// title occupying exactly two lines, the short one exactly one) and
// captures the store grid + the fused book's detail page.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(repoRoot, 'title-length-shots')
fs.mkdirSync(outDir, { recursive: true })
const PORT = 8959
const base = `http://127.0.0.1:${PORT}`
const API_ORIGIN = 'http://localhost:5173'

const engine = await import('./src/story-engine.js')
const { emptyLibrary } = await import('./src/persistence.js')
const { createStory, createMergedStory, buildChapter, acceptChapter, chapterKey, chooseBranch } = engine

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

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
  }

  const reg = await api('/api/auth/username/register', {
    method: 'POST',
    body: { username: 'titlelength_author', password: 'titlelength-pass-1' },
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

  const mkLine = (genreId, genreTemplateId, name, title, ability) => {
    const line = walkLocal(createStory({
      genreId, genreTemplateId, name, avatarId: avatar.id,
      avatarDescription: '背着旧剑的青年，眉眼冷，眼角一颗小痣。',
      avatarAppearance: { outfit: '洗旧的青衫', accessory: '一柄缺口铁剑' },
      ability, storyLengthMode: 'endless',
    }), 3)
    line.title = title
    return line
  }

  const shortLine = mkLine('mist', undefined, '阿遥', '雾港来信', '听潮')
  const aLine = mkLine('cultivation', 'xianxia', '沈砚', '从灵田杂役开始登天', '借火一瞬')
  const bLine = mkLine('city', undefined, '陆鸣', '刚失业，神豪系统找上门', '城市嗅觉')

  const publish = async (line) => {
    const pub = await api('/api/store/publish', {
      method: 'POST', credential: reg.token,
      body: { story: { ...line, engine: 'gemini' } },
    })
    console.log('published:', pub.book?.id, pub.book?.title)
    return pub.book
  }
  await publish(shortLine)
  await publish(aLine)

  // A real fusion: the merged title is composed by the new builder.
  let merged = createMergedStory(aLine, bLine)
  console.log('fused title composed by the builder:', merged.title)
  check('fused title is the REQ-63 sample name', merged.title === '合流：从灵田杂役开始 × 神豪系统找上门', merged.title)
  merged = walkLocal(merged, 6)
  const mergedBook = await publish(merged)

  const library = { ...emptyLibrary(), stories: [shortLine, aLine, merged], activeStoryId: merged.id }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
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
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button, a')].find((n) => n.textContent.trim() === '书城')
    el?.click()
  })
  await page.waitForSelector('.store-book-card', { timeout: 20000 })
  await page.waitForTimeout(800)

  const readCards = () => page.evaluate(() => [...document.querySelectorAll('.store-book-card')].map((card) => {
    const title = card.querySelector('.store-book-title')
    const slot = card.querySelector('.store-slot-title')
    const rect = card.getBoundingClientRect()
    const fontSize = parseFloat(getComputedStyle(title).fontSize)
    const titleHeight = title.getBoundingClientRect().height
    return {
      title: title.textContent,
      slotHeight: slot.getBoundingClientRect().height,
      // Line count from geometry: rendered height / one line's height.
      titleLines: Math.round(titleHeight / (fontSize * 1.375)),
      fontSize: `${fontSize}px`,
      cardTop: Math.round(rect.top),
      cardHeight: Math.round(rect.height),
    }
  }))
  const facts = await readCards()
  console.log(JSON.stringify(facts, null, 2))
  check('every title slot is exactly 44px (two lines)', facts.every((c) => Math.abs(c.slotHeight - 44) < 0.6), facts.map((c) => c.slotHeight).join('/'))
  const rows = new Map()
  for (const card of facts) {
    if (!rows.has(card.cardTop)) rows.set(card.cardTop, new Set())
    rows.get(card.cardTop).add(card.cardHeight)
  }
  check('cards in the same row share one height', [...rows.values()].every((heights) => heights.size === 1), JSON.stringify([...rows.entries()]))
  const ordinary = facts.find((c) => c.title === '《从灵田杂役开始登天》')
  check('the ordinary 10-character title wraps to exactly two lines', ordinary?.titleLines === 2, `lines=${ordinary?.titleLines} size=${ordinary?.fontSize}`)
  const short = facts.find((c) => c.title === '《雾港来信》')
  check('the short title occupies exactly one line', short?.titleLines === 1, `lines=${short?.titleLines} size=${short?.fontSize}`)

  await page.screenshot({ path: path.join(outDir, 'store-390.png') })

  // Fused books shelve under the store's 合流 division — switch to it.
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.store-divisions button')].find((n) => n.textContent.trim() === '合流')
    chip?.click()
  })
  await page.waitForFunction(
    (titleText) => [...document.querySelectorAll('.store-book-title')].some((el) => el.textContent === titleText),
    `《${merged.title}》`,
    { timeout: 20000 },
  )
  await page.waitForTimeout(600)
  const fusedFacts = await readCards()
  console.log(JSON.stringify(fusedFacts, null, 2))
  const fused = fusedFacts.find((c) => c.title.includes('合流'))
  check('the maxed fused title occupies exactly two lines', fused?.titleLines === 2, `lines=${fused?.titleLines} size=${fused?.fontSize}`)
  check('the fused card slot is also 44px', Math.abs((fused?.slotHeight ?? 0) - 44) < 0.6)
  await page.screenshot({ path: path.join(outDir, 'store-fusion-390.png') })

  // Open the fused book's detail page via the card's cover button.
  const fusedCard = page.locator('.store-book-card', { hasText: merged.title }).first()
  await fusedCard.locator('button').first().click()
  await page.waitForSelector('.plaza-detail-cover-copy h1', { timeout: 20000 })
  await page.waitForTimeout(800)
  const detail = await page.evaluate(() => {
    const h1 = document.querySelector('.plaza-detail-cover-copy h1')
    const cs = getComputedStyle(h1)
    const fontSize = parseFloat(cs.fontSize)
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.4
    return {
      text: h1.textContent,
      lines: Math.round(h1.getBoundingClientRect().height / lineHeight),
      fontSize: cs.fontSize,
    }
  })
  console.log('detail:', JSON.stringify(detail))
  check('detail title shows the fused name within two lines', detail.text === `《合流：从灵田杂役开始 × 神豪系统找上门》` && detail.lines <= 2, `lines=${detail.lines}`)
  await page.screenshot({ path: path.join(outDir, 'merged-detail-390.png') })

  await browser.close()
  console.log(failures.length ? `\n${failures.length} CHECK(S) FAILED` : '\nALL SHOT CHECKS PASSED')
  if (failures.length) process.exitCode = 1
} finally {
  server.kill('SIGTERM')
  if (process.exitCode) console.log(serverLog.slice(-2000))
}
