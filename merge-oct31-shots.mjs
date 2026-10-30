// MERGE-OCT31 integration shots — the five key surfaces of the merged
// build at 390×844 (Chromium; sandbox WebKit is unreliable here):
//   01 genre step (free-creation hero)      02 world step (preset draft)
//   03 merge picker (multi-select + length) 04 my profile (stage +
//   settings row without subtitle)          05 book detail (REQ-55
//   order + REQ-53 sources + REQ-54 readonly note exactly once)
// Seeds through the fixture server + the local engine, like
// detail-layout-shots.mjs. Not part of the test suite.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = path.join(repoRoot, 'merge-oct31-shots')
fs.mkdirSync(shotsDir, { recursive: true })
const PORT = 8951
const base = `http://127.0.0.1:${PORT}`
const API_ORIGIN = 'http://localhost:5173'

const engine = await import('./src/story-engine.js')
const { emptyLibrary } = await import('./src/persistence.js')
const { createStory, buildChapter, acceptChapter, chapterKey, chooseBranch, createMergedStory } = engine

const results = { checks: [] }
const check = (name, ok, detail = '') => {
  results.checks.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
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

  // ——— Seed ———
  const reg = await api('/api/auth/username/register', {
    method: 'POST',
    body: { username: 'merge31c_author', password: 'merge31-pass-1' },
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

  const lineA = walkLocal(createStory({
    genreId: 'cultivation', genreTemplateId: 'xianxia', name: '沈砚', avatarId: avatar.id,
    avatarDescription: '背着旧剑的青年，眉眼冷，眼角一颗小痣。',
    avatarAppearance: { outfit: '洗旧的青衫', accessory: '一柄缺口铁剑' },
    ability: '借火一瞬',
  }), 6)
  lineA.title = '从灵田杂役开始登天'
  const lineB = walkLocal(createStory({
    genreId: 'city', name: '陆鸣', avatarId: 'avatar-second-m31',
    avatarDescription: '总在凌晨醒来的年轻人，眼睛下面挂着黑眼圈。',
    avatarAppearance: { outfit: '皱巴巴的衬衫', accessory: '一部旧手机' },
    ability: '城市嗅觉',
  }), 6)
  lineB.title = '凌晨四点的长宁街'
  const mergedLine = walkLocal(createMergedStory(lineA, lineB), 6)
  const mergedPub = await api('/api/store/publish', {
    method: 'POST', credential: reg.token,
    body: { story: { ...mergedLine, engine: 'gemini' } },
  })
  results.mergedBook = { id: mergedPub.book.id, title: mergedPub.book.title }
  console.log('seeded merged book:', JSON.stringify(results.mergedBook))

  const library = {
    ...emptyLibrary(),
    stories: [lineA, lineB],
    activeStoryId: lineA.id,
  }

  // ——— Browser ———
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
  const waitText = async (text, timeout = 20000) => {
    await page.waitForFunction(
      (needle) => document.body.innerText.includes(needle),
      text,
      { timeout },
    )
  }
  const shot = async (name) => {
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(shotsDir, name) })
    console.log('shot:', name)
  }

  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  // ——— 04 profile first (landing state settles there via nav) ———
  await clickText('主页', { exact: true }).catch(() => clickText('主页'))
  await waitText('设置')
  const profileFacts = await page.evaluate(() => ({
    settingsSmall: document.querySelectorAll('.settings-entry-row small, [class*="settings"] small').length,
    settingsText: [...document.querySelectorAll('button, a')].find((el) => el.textContent.includes('设置'))?.textContent.trim() || '',
    hasAvatarName: document.body.innerText.includes('沈砚'),
    stagePresent: Boolean(document.querySelector('[class*="stage"]')),
  }))
  check('profile: settings row carries no subtitle small', profileFacts.settingsSmall === 0, JSON.stringify(profileFacts))
  check('profile: avatar listed on my profile (REQ-58 chain)', profileFacts.hasAvatarName)
  await shot('04-profile.png')
  await page.evaluate(() => {
    const stage = document.querySelector('[class*="stage"]')
    stage?.scrollIntoView({ block: 'start' })
  })
  await shot('04b-profile-stage.png')
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('button, a')].find((el) => el.textContent.trim().startsWith('设置'))
    row?.scrollIntoView({ block: 'center' })
  })
  await shot('04c-profile-settings.png')

  // ——— 01/02 forge: genre step → world step ———
  await clickText('造世', { exact: true }).catch(() => clickText('造世'))
  await waitText('没灵感？试试从分类里找')
  check('genre step: free-creation entry present', true)
  await shot('01-genre-step.png')
  await clickText('没灵感？试试从分类里找')
  await page.waitForTimeout(800)
  // Pick a family card, then a template if a wall appears, then continue.
  await clickText('玄幻修真').catch(() => clickText('仙侠'))
  await page.waitForTimeout(600)
  await clickText('继续')
  await waitText('青岚宗')
  await clickText('青岚宗')
  await page.waitForTimeout(500)
  await clickText('改一改这个世界')
  await page.waitForTimeout(500)
  const worldFacts = await page.evaluate(() => ({
    textareas: document.querySelectorAll('textarea').length,
    bodyHasDraft: document.body.innerText.includes('恢复这个世界的预设原文') || document.body.innerText.includes('青岚宗'),
  }))
  check('world step: preset draft editor expanded', worldFacts.textareas >= 1, JSON.stringify(worldFacts))
  await shot('02-world-step.png')

  // ——— 03 merge picker ———
  await page.evaluate(() => { window.location.hash = '' })
  await clickText('主页', { exact: true }).catch(() => clickText('主页'))
  await page.waitForTimeout(1200)
  // My-books "全部 ›" opens the shelf (home); its hero offers the fuse entry.
  await clickText('全部').catch(() => {})
  await page.waitForTimeout(1200)
  await clickText('与另一条线合流')
  await waitText('世界合流')
  await waitText('篇幅')
  const mergeFacts = await page.evaluate(() => ({
    labels: ['短篇 · 6 章', '一季 · 24 章', '长线 · 100 章', '无限连载']
      .filter((label) => document.body.innerText.includes(label)),
    count: document.querySelector('.merge-count')?.textContent.trim() || '',
    activeLength: [...document.querySelectorAll('[aria-labelledby="merge-length-label"] button')]
      .filter((el) => el.getAttribute('aria-pressed') === 'true')
      .map((el) => el.textContent.trim()),
  }))
  check('merge picker: all four length choices render', mergeFacts.labels.length === 4, JSON.stringify(mergeFacts))
  check('merge picker: fallback preselect is short for finished sources', mergeFacts.activeLength.join() === '短篇 · 6 章', JSON.stringify(mergeFacts.activeLength))
  await shot('03-merge-picker.png')
  await page.evaluate(() => {
    document.getElementById('merge-length-label')?.scrollIntoView({ block: 'center' })
  })
  await shot('03b-merge-length.png')

  // ——— 05 merged book detail ———
  await page.goto(`${base}/#/plaza/${results.mergedBook.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.plaza-detail-cover', { timeout: 20000 })
  await page.waitForTimeout(900)
  const detailFacts = await page.evaluate(() => {
    const absTop = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : null)
    const panelByHeading = (text) => [...document.querySelectorAll('.plaza-panel')]
      .find((panel) => panel.querySelector('h2')?.textContent?.includes(text))
    return {
      readonlyCount: [...document.querySelectorAll('.plaza-detail-readonly')].length,
      entryTop: absTop(document.querySelector('.plaza-entry-panel')),
      worldTop: absTop(document.querySelector('.plaza-world-intro')),
      sourcesTop: absTop(document.querySelector('.plaza-sources-panel')),
      beatsTop: absTop(document.querySelector('#plaza-detail-beats')),
      ratingsTop: absTop(document.querySelector('.book-ratings')),
      sourcesRows: document.querySelectorAll('.plaza-source-row').length,
      synopsisTop: absTop(panelByHeading('本书简介')),
    }
  })
  check('detail: readonly note exactly once', detailFacts.readonlyCount === 1, JSON.stringify(detailFacts))
  check('detail: order entry < world < sources < beats < ratings',
    detailFacts.entryTop < detailFacts.worldTop
    && detailFacts.worldTop < detailFacts.sourcesTop
    && detailFacts.sourcesTop < detailFacts.beatsTop
    && detailFacts.beatsTop < detailFacts.ratingsTop,
    JSON.stringify(detailFacts))
  check('detail: sources list both source books', detailFacts.sourcesRows === 2, `rows=${detailFacts.sourcesRows}`)
  await shot('05-detail-top.png')
  await page.evaluate(() => {
    document.querySelector('.plaza-sources-panel')?.scrollIntoView({ block: 'start' })
  })
  await shot('05-detail-sources.png')

  await browser.close()
} finally {
  server.kill()
  if (process.env.VERBOSE) console.log(serverLog)
}
fs.writeFileSync(path.join(shotsDir, 'results.json'), JSON.stringify(results, null, 2))
console.log(`checks: ${results.checks.filter((c) => c.ok).length}/${results.checks.length} passed`)
