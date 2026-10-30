/* LOCAL-CACHE (REQ-50) acceptance probe — not part of the test suite.
 * Run after `npm run build`:  node CACHE-VERIFY.mjs
 *
 * Proves, against the real built server + a real Chromium:
 *  A. Server half — a stale copy renews as 304/0-bytes instead of a
 *     second full download (static art + hashed bundle tiers).
 *  B. Browser half — first open fills the caches; second open serves
 *     the shell and the world art from the service worker (0 network
 *     bytes delivered to the page for them); the media cache stays
 *     inside its 40MB / 300-entry budget.
 */
import { once } from 'node:events'
import { chromium } from 'playwright'
import { createServer } from './server/index.js'

const PORT = 8899
const BASE = `http://127.0.0.1:${PORT}`
const ART = ['/art/city-1122.webp', '/art/court-1122.webp', '/art/banner-store-1600.webp']

const server = createServer({ env: { DATA_STORE: 'memory' } })
server.listen(PORT, '127.0.0.1')
await once(server, 'listening')
console.log(`server up on ${BASE}`)

async function bytesOf(url, headers = {}) {
  const response = await fetch(`${BASE}${url}`, { headers })
  const body = await response.arrayBuffer()
  return { status: response.status, bytes: body.byteLength, etag: response.headers.get('etag'), cacheControl: response.headers.get('cache-control') }
}

console.log('\n— A. HTTP renewal (expired copy, If-None-Match) —')
for (const url of ['/art/city-1122.webp', '/assets/index-m4G7jmBO.js', '/']) {
  const first = await bytesOf(url)
  const second = await bytesOf(url, { 'If-None-Match': first.etag })
  console.log(`${url}\n  first : ${first.status} ${first.bytes}B  [${first.cacheControl}]`)
  console.log(`  renew : ${second.status} ${second.bytes}B`)
}

console.log('\n— B. Browser: first open vs second open —')
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext()
const page = await context.newPage()
const seen = []
page.on('response', async (response) => {
  const url = new URL(response.url())
  if (url.origin !== BASE) return
  let size = 0
  try { size = (await response.body()).length } catch { /* redirects/304s */ }
  seen.push({ path: url.pathname, size, fromSW: response.fromServiceWorker(), status: response.status() })
})

await page.goto(BASE, { waitUntil: 'load' })
await page.evaluate(() => navigator.serviceWorker.ready)
await page.waitForTimeout(800)
const firstOpen = seen.splice(0)
const firstShellBytes = firstOpen.filter((r) => r.path.startsWith('/assets/')).reduce((sum, r) => sum + r.size, 0)
console.log(`first open: ${firstOpen.length} responses, bundle bytes from network = ${firstShellBytes}`)

/* Exercise the media path exactly as the app does (page-context GETs
 * of same-origin images), then ask for the same pictures again. */
await page.evaluate(async (paths) => { for (const p of paths) await fetch(p) }, ART)
await page.waitForTimeout(500)
seen.splice(0)
await page.evaluate(async (paths) => { for (const p of paths) await fetch(p) }, ART)
await page.waitForTimeout(500)
const artSecond = seen.splice(0).filter((r) => r.path.startsWith('/art/'))
console.log(`art re-request: ${artSecond.map((r) => `${r.path.split('/').pop()}=${r.fromSW ? 'SW' : 'NET'}:${r.size}B`).join(' ')}`)

await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(800)
const secondOpen = seen.splice(0)
const swServed = secondOpen.filter((r) => r.fromSW)
const netShell = secondOpen.filter((r) => !r.fromSW && (r.path.startsWith('/assets/') || r.path === '/'))
console.log(`second open: ${secondOpen.length} responses, ${swServed.length} served by SW, shell requests still hitting network = ${netShell.length} (${netShell.map((r) => r.path).join(', ') || 'none'})`)

const cacheReport = await page.evaluate(async () => {
  const names = await caches.keys()
  const media = await caches.open('media-v1')
  const keys = await media.keys()
  let mediaBytes = 0
  for (const request of keys) {
    const response = await media.match(request)
    if (response) mediaBytes += Number(response.headers.get('content-length')) || 0
  }
  const estimate = await navigator.storage.estimate()
  return { names, mediaEntries: keys.length, mediaBytes, usage: estimate.usage, persisted: await navigator.storage.persisted() }
})
console.log(`caches: ${cacheReport.names.join(', ')}`)
console.log(`media cache: ${cacheReport.mediaEntries} entries, ${cacheReport.mediaBytes}B (budget 41943040B / 300 entries)`)
console.log(`storage.estimate usage ≈ ${cacheReport.usage}B, persisted = ${cacheReport.persisted}`)

await browser.close()
server.closeAllConnections()
await new Promise((resolve) => server.close(resolve))
console.log('\ndone')
