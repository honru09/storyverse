// SALT-2 preview shooter: seeds an identical fixture dataset on the
// target server (register -> avatar -> two completed lines shelved ->
// posts -> follow -> share post), then screenshots plaza / store /
// detail / own-profile at 390x844 in the black and white shell themes.
// Usage: node shoot.mjs <baseUrl> <tag> <outDir>
// The story engine is imported from the MAIN tree for both runs so the
// seeded data is byte-identical; only the served build differs.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const [base, tag, outDir] = process.argv.slice(2)
if (!base || !tag || !outDir) throw new Error('usage: shoot.mjs <base> <tag> <outDir>')
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

// ——— Seed (identical on both servers) ———
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
// The follow target needs an account footprint (avatar / profile /
// publication) before social.exists() resolves it in this fixture
// wiring, so the reader saves an avatar first.
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
for (const theme of ['black', 'white']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ session, themeValue }) => {
    localStorage.setItem('storyweave.site-session', JSON.stringify(session))
    localStorage.setItem('storyweave:shell-theme', themeValue)
  }, { session: author.session, themeValue: theme })

  const shoot = async (surface, setup) => {
    const page = await context.newPage()
    await setup(page)
    await settle(page)
    const file = path.join(outDir, `${surface}-${theme}-${tag}.png`)
    await page.screenshot({ path: file })
    console.log('shot', file)
    await page.close()
  }

  await shoot('plaza', async (page) => {
    await page.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-post').first().waitFor({ state: 'visible', timeout: 20000 })
  })
  await shoot('store', async (page) => {
    await page.goto(`${base}/#/store`, { waitUntil: 'domcontentloaded' })
    await page.locator('.store-book-card').nth(1).waitFor({ state: 'visible', timeout: 20000 })
  })
  await shoot('detail', async (page) => {
    await page.goto(`${base}/#/plaza/${book1.id}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-detail-cover').waitFor({ state: 'visible', timeout: 20000 })
  })
  await shoot('profile', async (page) => {
    await page.goto(`${base}/#/plaza`, { waitUntil: 'domcontentloaded' })
    await page.locator('.plaza-post').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.locator('.mobile-bottom-nav button', { hasText: '主页' }).click()
    await page.locator('.profile-hero').waitFor({ state: 'visible', timeout: 20000 })
  })
  await context.close()
}
await browser.close()
console.log('done', tag)
