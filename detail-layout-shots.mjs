// REQ-55 — book detail page layout shots + DOM order assertions.
// Seeds one finished normal book (with a reader review on it) and one
// finished fusion book through the local story engine against the
// in-memory fixture server (ratings-shots/dev-server.mjs), then shoots
// each book's detail page in all three shell themes at 390×844:
// first viewport + scrolled to the foot. Assertions: the ratings
// section sits below the world intro and the beats; the entry group
// sits above the synopsis; the primary read button is fully inside
// the first viewport; the header carries the one-line rating summary.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = path.join(repoRoot, 'detail-layout-shots')
fs.mkdirSync(shotsDir, { recursive: true })
const PORT = 8947
const base = `http://127.0.0.1:${PORT}`
const API_ORIGIN = 'http://localhost:5173'

const { createStory, buildChapter, acceptChapter, chapterKey, chooseBranch, createMergedStory } =
  await import('./src/story-engine.js')

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

async function registerUser(username) {
  const data = await api('/api/auth/username/register', {
    method: 'POST',
    body: { username, password: 'detail-layout-pass-1' },
  })
  const session = {
    uid: data.uid, email: null, provider: 'username',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, token: data.token,
  }
  return { credential: data.token, uid: data.uid, session }
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

const results = { engine: null, books: {}, assertions: [] }
const check = (name, ok, detail = '') => {
  results.assertions.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
  }

  // ——— Seed ———
  const author = await registerUser('dl55_author')
  const reader = await registerUser('dl55_reader')
  const avatarResponse = await api('/api/avatar', {
    method: 'PUT',
    credential: author.credential,
    body: {
      profile: {
        name: '沈砚',
        description: '清冷安静的剑客。',
        appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' },
      },
    },
  })
  const avatar = avatarResponse.avatar

  const normalLine = walkLocal(createStory({
    genreId: 'cultivation',
    genreTemplateId: 'xianxia',
    name: '沈砚',
    avatarId: avatar.id,
    avatarDescription: '背着旧剑的青年，眉眼冷，眼角一颗小痣。',
    avatarAppearance: { outfit: '洗旧的青衫', accessory: '一柄缺口铁剑' },
    ability: '借火一瞬',
    storyLengthMode: 'season',
  }), 24)
  const normalPub = await api('/api/store/publish', {
    method: 'POST', credential: author.credential,
    body: { story: { ...normalLine, engine: 'gemini' } },
  })
  results.books.normal = { id: normalPub.book.id, title: normalPub.book.title }

  const lineA = walkLocal(createStory({
    genreId: 'cultivation', genreTemplateId: 'xianxia',
    name: '沈砚', avatarId: avatar.id,
    avatarDescription: '背着旧剑的青年，眉眼冷，眼角一颗小痣。',
    avatarAppearance: { outfit: '洗旧的青衫', accessory: '一柄缺口铁剑' },
    ability: '借火一瞬',
  }), 6)
  const lineB = walkLocal(createStory({
    genreId: 'city',
    name: '陆鸣', avatarId: 'avatar-second-dl55',
    avatarDescription: '总在凌晨醒来的年轻人，眼睛下面挂着黑眼圈。',
    avatarAppearance: { outfit: '皱巴巴的衬衫', accessory: '一部旧手机' },
    ability: '城市嗅觉',
  }), 6)
  const mergedLine = walkLocal(createMergedStory(lineA, lineB), 6)
  const mergedPub = await api('/api/store/publish', {
    method: 'POST', credential: author.credential,
    body: { story: { ...mergedLine, engine: 'gemini' } },
  })
  results.books.merged = { id: mergedPub.book.id, title: mergedPub.book.title }
  console.log('seeded:', JSON.stringify(results.books))

  await api(`/api/store/${results.books.normal.id}/ratings`, {
    method: 'POST', credential: reader.credential,
    body: { stars: 5, text: '前几章钩子很稳，登天那段看得我一口气读完。' },
  })

  // ——— Browser ———
  let browser
  try {
    const { webkit } = await import('playwright')
    browser = await webkit.launch()
    const probe = await browser.newContext()
    await probe.newPage()
    await probe.close()
    results.engine = 'webkit'
  } catch (error) {
    console.log('webkit unusable, falling back to chromium:', error.message.split('\n')[0])
    try { await browser?.close() } catch { /* already gone */ }
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    results.engine = 'chromium (webkit unavailable in this sandbox)'
  }
  console.log('engine:', results.engine)

  for (const theme of ['black', 'white', 'aurora']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await context.addInitScript((themeValue) => {
      try {
        localStorage.setItem('storyweave:shell-theme', themeValue)
        localStorage.setItem('storyweave:shell-theme-explicit', '1')
      } catch { /* storage unavailable */ }
    }, theme)
    const page = await context.newPage()
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.evaluate(
      (session) => localStorage.setItem('storyweave.site-session', JSON.stringify(session)),
      reader.session,
    )

    for (const [kind, book] of Object.entries(results.books)) {
      await page.goto(`${base}/#/plaza/${book.id}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.plaza-detail-cover', { timeout: 20000 })
      await page.waitForSelector('.book-ratings', { timeout: 20000 })
      await page.waitForTimeout(900)

      const metrics = await page.evaluate(() => {
        const absTop = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : null)
        const panelByHeading = (text) => [...document.querySelectorAll('.plaza-panel')]
          .find((panel) => panel.querySelector('h2')?.textContent?.includes(text))
        const readRect = document.querySelector('.plaza-entry-read')?.getBoundingClientRect()
        return {
          entryTop: absTop(document.querySelector('.plaza-entry-panel')),
          synopsisTop: absTop(panelByHeading('本书简介')),
          worldTop: absTop(document.querySelector('.plaza-world-intro')),
          beatsTop: absTop(document.querySelector('#plaza-detail-beats')),
          ratingsTop: absTop(document.querySelector('.book-ratings')),
          ratingLine: Boolean(document.querySelector('.plaza-detail-cover-copy .plaza-detail-rating')),
          readRect: readRect ? { top: readRect.top, bottom: readRect.bottom } : null,
          readLabel: document.querySelector('.plaza-entry-read')?.textContent?.trim() ?? '',
          secondaryLabels: [...document.querySelectorAll('.plaza-entry-action')].map((el) => el.textContent.trim()),
        }
      })
      check(`${theme}/${kind}: ratings below world intro`, metrics.ratingsTop > metrics.worldTop, `ratings=${Math.round(metrics.ratingsTop)} world=${Math.round(metrics.worldTop)}`)
      check(`${theme}/${kind}: ratings below beats`, metrics.ratingsTop > metrics.beatsTop, `ratings=${Math.round(metrics.ratingsTop)} beats=${Math.round(metrics.beatsTop)}`)
      check(`${theme}/${kind}: entry group above synopsis`, metrics.entryTop < (metrics.synopsisTop ?? metrics.worldTop), `entry=${Math.round(metrics.entryTop)} synopsis=${metrics.synopsisTop === null ? 'absent (empty synopsis)' : Math.round(metrics.synopsisTop)}`)
      check(`${theme}/${kind}: read button inside first viewport`, Boolean(metrics.readRect) && metrics.readRect.top >= 0 && metrics.readRect.bottom <= 844, JSON.stringify(metrics.readRect))
      check(`${theme}/${kind}: header rating summary line present`, metrics.ratingLine)
      console.log(`  ${theme}/${kind} read label: ${metrics.readLabel}; secondary: ${metrics.secondaryLabels.join(' / ')}`)

      await page.screenshot({ path: path.join(shotsDir, `${theme}-${kind}-top.png`) })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(700)
      await page.screenshot({ path: path.join(shotsDir, `${theme}-${kind}-bottom.png`) })
    }
    await context.close()
  }
  await browser.close()
} finally {
  server.kill()
  if (process.env.VERBOSE) console.log(serverLog)
}
fs.writeFileSync(path.join(shotsDir, 'results.json'), JSON.stringify(results, null, 2))
console.log(`assertions: ${results.assertions.filter((a) => a.ok).length}/${results.assertions.length} passed`)
