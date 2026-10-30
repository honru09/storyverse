// DETAIL-FIX2 verification shooter: same seeded fixture data as the
// SALT-2/3/FIX rounds (shoot.mjs / shoot-fix.mjs), detail page only:
//   fix2-detail-<theme>        detail first screen (author view, idle
//                              empty ratings — the user's circled page)
//   fix2-detail-<theme>-zoom   scrolled one screen: ratings panel +
//                              avatar panel in frame
//   fix2-detail-rated-<theme>  reader view after the reader rated the
//                              book — the populated list state must
//                              stand unchanged (regression check)
// Non-lite档位: navigator pins as in shoot-fix.mjs.
// Usage: node shoot-fix2.mjs <baseUrl> <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const [base, outDir] = process.argv.slice(2)
if (!base || !outDir) throw new Error('usage: shoot-fix2.mjs <base> <outDir>')
fs.mkdirSync(outDir, { recursive: true })

const engine = await import('/home/hatch/workspace/storyverse/src/story-engine.js')

async function api(route, { credential, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json().catch(() => null) }
}
function must(result, label) {
  if (result.status !== 200) throw new Error(`${label}: HTTP ${result.status} ${JSON.stringify(result.json)?.slice(0, 200)}`)
  return result.json
}
async function registerUser(username) {
  const json = must(await api('/api/auth/username/register', {
    method: 'POST', body: { username, password: 'salt2-preview-pass-1' },
  }), `register ${username}`)
  const session = { uid: json.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, token: json.token }
  return { credential: json.token, uid: json.uid, session }
}
function completedLine(avatarId, config) {
  let current = engine.createStory(config)
  for (let index = 0; index < 24; index += 1) {
    const chapter = engine.buildChapter(current, index)
    current = engine.acceptChapter(current, chapter, engine.chapterKey(current, index))
    if (chapter.choice && index < 23) current = engine.chooseBranch(current, index, chapter.choice.options[0].id)
  }
  return { ...current, engine: 'gemini' }
}

// ——— Seed (identical to shoot.mjs / shoot-fix.mjs) ———
const author = await registerUser('salt2_author')
const reader = await registerUser('salt2_reader')
const avatarJson = must(await api('/api/avatar', {
  credential: author.credential, method: 'PUT',
  body: { profile: { name: '沈砚', description: '清冷安静的剑客。', appearance: { hairColor: 'silver', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' } } },
}), 'avatar saved')
const avatarId = avatarJson.avatar.id
const line1 = completedLine(avatarId, {
  genreId: 'cultivation', genreTemplateId: 'xianxia', storyLengthMode: 'season',
  originIdentityId: 'mystery', startPointName: '山神破庙', name: '沈砚',
  avatarId, avatarAppearance: '银灰长发，左颊一颗泪痣', ability: '借火一瞬',
})
const line2 = completedLine(avatarId, {
  genreId: 'city', genreTemplateId: 'urban', storyLengthMode: 'season',
  originIdentityId: 'mystery', startPointName: '长宁街口', name: '陆则明',
  avatarId, avatarAppearance: '深色风衣，常戴一副圆框眼镜', ability: '过目不忘',
})
const book1 = must(await api('/api/store/publish', { credential: author.credential, method: 'POST', body: { story: line1 } }), 'publish book1').book
const book2 = must(await api('/api/store/publish', { credential: author.credential, method: 'POST', body: { story: line2 } }), 'publish book2').book
console.log('books:', book1.title, '/', book2.title)
must(await api('/api/plaza/posts', { credential: author.credential, method: 'POST', body: { type: 'free_text', content: '第一季刚刚走完，写到最后一段的时候手都是抖的。' } }), 'author free post')
must(await api('/api/plaza/posts', { credential: reader.credential, method: 'POST', body: { type: 'free_text', content: '在书城挖到一本刚完结的，熬夜看完了，值得。' } }), 'reader free post')
must(await api('/api/avatar', {
  credential: reader.credential, method: 'PUT',
  body: { profile: { name: '阿棠', description: '夜里读书的人。', appearance: { hairColor: 'black', hairStyle: 'long-straight', outfit: 'xianxia-robe', shoes: 'cloth-shoes', face: 'tear-mole', faceNote: '' } } },
}), 'reader avatar saved')
must(await api(`/api/users/${reader.uid}/follow`, { credential: author.credential, method: 'POST' }), 'author follows reader')
const share = await api('/api/plaza/posts', { credential: author.credential, method: 'POST', body: { type: 'book_share', bookId: book1.id, content: '安利一下刚上架的这本，青岚宗的火，烧了整整一季。' } })
console.log('share post:', share.status)

// ——— Shoot ———
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(900)
}
async function scrollPageBy(page, dy) {
  await page.evaluate((delta) => {
    const anchor = document.querySelector('.book-ratings') || document.body
    let node = anchor
    while (node && node !== document.body) {
      const style = getComputedStyle(node)
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) { node.scrollBy(0, delta); return }
      node = node.parentElement
    }
    ;(document.scrollingElement || document.documentElement).scrollBy(0, delta)
  }, dy)
  await page.waitForTimeout(450)
}

const themes = (process.argv[4] || 'black,white').split(',')
for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ session, themeValue }) => {
    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    } catch { /* assertions below catch lite mode */ }
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
    localStorage.setItem('storyweave:shell-theme', themeValue)
  }, { session: author.session, themeValue: theme })
  const checkLite = async (page, label) => {
    const lite = await page.evaluate(() => document.documentElement.classList.contains('is-lite-gpu'))
    console.log(label, 'is-lite-gpu =', lite)
    if (lite) throw new Error(`${label}: page engaged lite fallback — shots would be false`)
  }
  const shot = async (page, name) => {
    const file = path.join(outDir, `${name}.png`)
    await page.screenshot({ path: file })
    console.log('shot', file)
  }

  // Author view: first screen + scrolled screen (idle empty ratings).
  {
    const page = await context.newPage()
    await page.goto(`${base}/#/plaza/${book1.id}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-detail-cover').waitFor({ state: 'visible', timeout: 20000 })
    await page.locator('.book-ratings').waitFor({ state: 'visible', timeout: 20000 })
    await settle(page)
    await checkLite(page, `detail-${theme}`)
    const probe = await page.evaluate(() => {
      const meta = document.querySelector('.plaza-detail-cover-copy p')
      const link = document.querySelector('.plaza-avatar-profile-link')
      const frame = document.querySelector('.plaza-avatar-panel .plaza-avatar-frame')
      const ratings = document.querySelector('.book-ratings')
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }
      const linkCs = link ? getComputedStyle(link) : null
      return {
        authorChipPresent: Boolean(document.querySelector('.plaza-author')),
        metaText: meta ? meta.textContent : null,
        authorInMetaCount: meta ? (meta.textContent.match(/salt2_author/g) || []).length : 0,
        linkBox: box(link), frameBox: box(frame),
        linkBg: linkCs ? linkCs.backgroundColor : null,
        linkBorder: linkCs ? `${linkCs.borderTopWidth} ${linkCs.borderTopStyle}` : null,
        linkPadding: linkCs ? linkCs.padding : null,
        ratingsBox: box(ratings),
        ratingsClass: ratings ? ratings.className : null,
        emptyImgPresent: Boolean(document.querySelector('.book-ratings-empty img')),
      }
    })
    console.log(`detail-${theme} probe:`, JSON.stringify(probe))
    await shot(page, `fix2-detail-${theme}`)
    await scrollPageBy(page, 430)
    await shot(page, `fix2-detail-${theme}-zoom`)
    await page.close()
  }

  // Reader rates book1, then reader view: populated list state.
  if (process.env.SKIP_RATED !== '1') {
    const rate = await api(`/api/store/${book1.id}/ratings`, {
      credential: reader.credential, method: 'POST',
      body: { stars: 5, text: '一口气读完，青岚宗这条线收得漂亮，最后一章的火看得人发烫。' },
    })
    console.log(`rate book1 as reader (${theme} pass):`, rate.status, JSON.stringify(rate.json)?.slice(0, 120))
    const readerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await readerContext.addInitScript(({ session, themeValue }) => {
      try {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
      } catch { /* noop */ }
      localStorage.setItem('storyweave.site-session', JSON.stringify(session))
      localStorage.setItem('storyweave:shell-theme', themeValue)
    }, { session: reader.session, themeValue: theme })
    const page = await readerContext.newPage()
    await page.goto(`${base}/#/plaza/${book1.id}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.book-ratings-list').waitFor({ state: 'visible', timeout: 20000 })
    await settle(page)
    await shot(page, `fix2-detail-rated-${theme}`)
    await readerContext.close()
  }

  await context.close()
}
await browser.close()
console.log('done')
