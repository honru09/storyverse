// REQ-72 acceptance: the plaza share post's book card carries no
// intro on the MERGED 00053 tree (dist built from integrate-00053).
// WebKit at 390, white theme, seeded with the REQ-70 fixture (author
// publishes a book WITH a synopsis and shares it to the plaza).
// Assertions:
//   A  the seeded book really has a synopsis (API-level), and a
//      distinctive probe substring of it is chosen
//   B  the rendered feed shows the post + book card; the card holds
//      ZERO .plaza-post-book-intro nodes and does NOT contain the
//      synopsis probe anywhere in its text
//   C  the card still shows cover, 《title》, the author line and the
//      读原作线 action; its height stays the minimal two-row card
//   D  the author's own post words render verbatim
import { webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:8976'
const OUT = '/home/hatch/workspace/storyverse-integrate-00053/req72-shots'
const seed = JSON.parse(fs.readFileSync(path.join(OUT, 'seed.json'), 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL', m) }
const ok = (m) => console.log('ok', m)

// ---- A: API-level truth about the seeded book ----
const feedRes = await fetch(`${BASE}/api/plaza`, {
  headers: { Authorization: `Bearer ${seed.owner.token}`, Origin: 'http://localhost:5173' },
})
const feed = await feedRes.json().catch(() => null)
const post = (feed?.posts || []).find((p) => p.id === seed.postId) || (feed?.posts || [])[0]
if (!post) { fail('seeded share post not found in the feed payload'); process.exit(1) }
const book = post.book || {}
const synopsis = typeof book.synopsis === 'string' ? book.synopsis : ''
console.log('book:', JSON.stringify({ id: book.id, title: book.title, authorName: book.authorName, synopsisLen: synopsis.length }))
if (synopsis.trim().length >= 20) ok(`A: seeded book carries a real synopsis (${synopsis.trim().length} chars)`)
else fail(`A: seeded book synopsis too short to prove anything (${synopsis.trim().length} chars)`)
const probe = synopsis.replace(/\s+/g, '').slice(6, 22)
console.log('probe substring:', probe)

// ---- Browser: plaza feed at 390 ----
const browser = await webkit.launch({
  env: {
    __EGL_VENDOR_LIBRARY_DIRS: '/tmp/wklibs/usr/share/glvnd/egl_vendor.d',
    LIBGL_DRIVERS_PATH: '/tmp/wklibs/usr/lib/x86_64-linux-gnu/dri',
    EGL_PLATFORM: 'surfaceless',
    LIBGL_ALWAYS_SOFTWARE: '1',
  },
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await context.addInitScript(({ session }) => {
  localStorage.setItem('storyweave.site-session', JSON.stringify(session))
  localStorage.setItem('storyweave:shell-theme', 'white')
  localStorage.setItem('storyweave:shell-theme-explicit', '1')
}, { session: seed.owner.session })
const page = await context.newPage()
page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await sleep(1500)
await page.locator('.mobile-bottom-nav').getByRole('button', { name: /广场/ }).click()
await page.waitForSelector('.plaza-post-book', { timeout: 20000 })
await sleep(800)

const dom = await page.evaluate(() => {
  const card = document.querySelector('.plaza-post-book')
  const postEl = document.querySelector('.plaza-post')
  const rect = card?.getBoundingClientRect()
  return {
    introNodes: document.querySelectorAll('.plaza-post-book-intro').length,
    cardText: (card?.textContent || '').replace(/\s+/g, ''),
    cardHeight: rect ? Math.round(rect.height) : null,
    cardWidth: rect ? Math.round(rect.width) : null,
    postText: (postEl?.querySelector('.plaza-post-content')?.textContent || '').trim(),
    hasReadAction: [...(card?.querySelectorAll('button') || [])].some((b) => b.textContent.includes('读原作线')),
    coverOk: Boolean(card?.querySelector('.plaza-post-book-cover')),
  }
})
console.log('DOM:', JSON.stringify(dom))
if (dom.introNodes === 0) ok('B: zero .plaza-post-book-intro nodes in the feed')
else fail(`B: ${dom.introNodes} intro nodes still rendered`)
if (probe && !dom.cardText.includes(probe)) ok('B: synopsis probe absent from the card text')
else fail('B: synopsis probe found inside the card text')
if (dom.cardText.includes(`《${book.title}》`)) ok('C: card shows the book title')
else fail(`C: title missing from card text: ${dom.cardText.slice(0, 80)}`)
if (book.authorName && dom.cardText.includes(book.authorName)) ok('C: card shows the author line')
else fail('C: author line missing')
if (dom.coverOk && dom.hasReadAction) ok('C: cover + 读原作线 action present')
else fail(`C: cover=${dom.coverOk} readAction=${dom.hasReadAction}`)
if (dom.cardHeight && dom.cardHeight > 80 && dom.cardHeight < 150) ok(`C: card height ${dom.cardHeight}px — minimal card, layout intact`)
else fail(`C: card height ${dom.cardHeight}px outside the minimal band`)
if (dom.postText === '新书上架，第一季写完了，欢迎来读。') ok('D: post words render verbatim')
else fail(`D: post text mismatch: ${dom.postText}`)

await page.locator('.plaza-post').first().screenshot({ path: path.join(OUT, 'plaza-post-390.png') })
await page.screenshot({ path: path.join(OUT, 'plaza-feed-390.png') })
await browser.close()
console.log(failures === 0 ? 'REQ-72 ACCEPT: ALL GREEN' : `REQ-72 ACCEPT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
