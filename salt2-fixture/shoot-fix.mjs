// SALT-3-FIX verification shooter: same seeded fixture data as the
// SALT-2/3 rounds (shoot.mjs), but shoots the nine fix-check frames:
//   fix-nav-plaza-<theme>   post text scrolled behind the capsule nav
//   fix-nav-detail-<theme>  detail 世界设定 section behind the nav
//   fix-detail-<theme>      detail first screen (denser panels)
//   fix-store-white         store first screen (nav + card feet)
//   fix-profile-<theme>     own profile first screen (00042 look)
// Non-lite档位: navigator hardwareConcurrency/deviceMemory are pinned
// to 8/8 before any page script runs, because this host's headless
// Chromium reports 4 cores and MotionProvider would engage the
// is-lite-gpu solid fallback (the SALT-3 round-one false preview).
// Usage: node shoot-fix.mjs <baseUrl> <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const [base, outDir] = process.argv.slice(2)
if (!base || !outDir) throw new Error('usage: shoot-fix.mjs <base> <outDir>')
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

// ——— Seed (identical to shoot.mjs) ———
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

// Scroll until the picked target element's vertical centre aligns with
// the capsule nav's centre — the target sits squarely behind the
// capsule FACE (the acceptance geometry), not grazing its top edge
// where the corner curve + drop-shadow band would muddy the verdict.
// `pickSrc` is a JS function body string evaluated in the page.
async function alignBehindNav(page, pickSrc) {
  return page.evaluate(async (src) => {
    const pickTarget = new Function(`return (${src})`)()
    const nav = document.querySelector('.mobile-bottom-nav')
    if (!nav) return false
    const navRect = nav.getBoundingClientRect()
    const target = pickTarget()
    if (!target) return false
    const findScroller = (el) => {
      let node = el
      while (node && node !== document.body) {
        const style = getComputedStyle(node)
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
        node = node.parentElement
      }
      return document.scrollingElement
    }
    const scroller = findScroller(target)
    const navCentre = navRect.top + navRect.height / 2
    for (let step = 0; step < 160; step += 1) {
      const rect = target.getBoundingClientRect()
      const delta = (rect.top + rect.height / 2) - navCentre
      if (Math.abs(delta) < 3) return true
      scroller.scrollBy(0, delta)
      await new Promise((resolve) => setTimeout(resolve, 24))
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && delta > 0) break
    }
    const rect = target.getBoundingClientRect()
    return Math.abs((rect.top + rect.height / 2) - navCentre) < 8
  }, pickSrc)
}

for (const theme of ['black', 'white']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ session, themeValue }) => {
    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    } catch { /* fall through: assertions below will catch lite mode */ }
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
    localStorage.setItem('storyweave:shell-theme', themeValue)
  }, { session: author.session, themeValue: theme })

  const openPage = async () => {
    const page = await context.newPage()
    return page
  }
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

  // fix-nav-plaza: feed post text behind the capsule
  {
    const page = await openPage()
    await page.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-post').first().waitFor({ state: 'visible', timeout: 20000 })
    await settle(page)
    await checkLite(page, `plaza-${theme}`)
    const navBg = await page.evaluate(() => getComputedStyle(document.querySelector('.mobile-bottom-nav')).backgroundColor)
    console.log(`plaza-${theme} nav background:`, navBg)
    const hit = await alignBehindNav(page, `() => { const posts = [...document.querySelectorAll('.plaza-post')]; const post = posts.find((p) => p.textContent.includes('安利')) || posts[posts.length - 1]; return post ? (post.querySelector('p') || post) : null }`)
    console.log(`plaza-${theme} post-centred-behind-nav:`, hit)
    await page.waitForTimeout(350)
    await shot(page, `fix-nav-plaza-${theme}`)
    await page.close()
  }

  // fix-detail + fix-nav-detail: detail first screen, then 世界设定 behind nav
  {
    const page = await openPage()
    await page.goto(`${base}/#/plaza/${book1.id}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-detail-cover').waitFor({ state: 'visible', timeout: 20000 })
    await settle(page)
    await checkLite(page, `detail-${theme}`)
    const probe = await page.evaluate(() => {
      const panel = document.querySelector('.page-plaza:has(> .detail-ambience) .plaza-panel')
      const amb = document.querySelector('.detail-ambience .world-art')
      return {
        panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
        ambOpacity: amb ? getComputedStyle(amb).opacity : null,
      }
    })
    console.log(`detail-${theme} probe:`, JSON.stringify(probe))
    await shot(page, `fix-detail-${theme}`)
    const hit = await alignBehindNav(page, `() => { const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('世界设定')); if (!sec) return document.querySelector('section h2, section h3'); return sec.querySelector('h2, h3, h4') || sec }`)
    console.log(`detail-${theme} world-section-centred-behind-nav:`, hit)
    await page.waitForTimeout(350)
    await shot(page, `fix-nav-detail-${theme}`)
    await page.close()
  }

  // fix-store-white: store first screen (white only per spec)
  if (theme === 'white') {
    const page = await openPage()
    await page.goto(`${base}/#/store`, { waitUntil: 'domcontentloaded' })
    await page.locator('.store-book-card').nth(1).waitFor({ state: 'visible', timeout: 20000 })
    await settle(page)
    await shot(page, 'fix-store-white')
    await page.close()
  }

  // fix-profile: own profile first screen
  {
    const page = await openPage()
    await page.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-post').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.locator('.mobile-bottom-nav button', { hasText: '主页' }).click()
    await page.locator('.profile-hero').waitFor({ state: 'visible', timeout: 20000 })
    await settle(page)
    const probe = await page.evaluate(() => {
      const heroId = document.querySelector('.page-profile .profile-hero-id')
      const stats = document.querySelector('.page-profile .profile-stats')
      return {
        heroIdBg: heroId ? getComputedStyle(heroId).backgroundColor : null,
        heroIdShadow: heroId ? getComputedStyle(heroId).boxShadow : null,
        statsBg: stats ? getComputedStyle(stats).backgroundColor : null,
        statsMarginTop: stats ? getComputedStyle(stats).marginTop : null,
      }
    })
    console.log(`profile-${theme} probe:`, JSON.stringify(probe))
    await shot(page, `fix-profile-${theme}`)
    await page.close()
  }

  await context.close()
}
await browser.close()
console.log('done')
