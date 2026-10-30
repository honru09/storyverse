import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from '../server/index.js'

/* LOCAL-CACHE (REQ-50): the layered cache contract.
 * - HTML shell + the worker script itself: no-cache (new deploys land).
 * - Content-hashed build assets: immutable for a year.
 * - Other statics (world art, fonts, icons): a week + content ETag.
 * - API images: versioned public covers immutable; other public images
 *   a day + ETag; private account images `private` + ETag. Everywhere,
 *   a matching If-None-Match answers 304 with no body. */

const identity = { uid: 'user-cache-1', email: null, displayName: '缓存测试', emailVerified: true, provider: 'username' }
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8])
const image = { buffer: pngBytes, contentType: 'image/png' }

async function startServer(t) {
  const distDir = await mkdtemp(path.join(tmpdir(), 'sw-dist-'))
  await mkdir(path.join(distDir, 'assets'))
  await mkdir(path.join(distDir, 'art'))
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html><script type="module" src="/assets/index-TESTHASH.js"></script>')
  await writeFile(path.join(distDir, 'assets', 'index-TESTHASH.js'), 'console.log("shell")')
  await writeFile(path.join(distDir, 'art', 'world-test.webp'), Buffer.from([1, 2, 3, 4, 5]))
  await writeFile(path.join(distDir, 'sw.js'), '/* worker fixture */')
  await writeFile(path.join(distDir, 'theme-init.js'), '/* theme fixture */')

  const server = createServer({
    env: { DATA_STORE: 'memory' },
    distDir,
    fetchImpl: async () => { throw new Error('Unexpected external request in HTTP fixture') },
    generator: { status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }), generate: async () => { throw new Error('unused') } },
    auth: { identity: async () => identity, config: () => ({ enabled: false }) },
    cover: { fetch: async () => image },
    avatar: { fetchImage: async () => image },
    plaza: { cover: async () => image, portrait: async () => image },
    social: { portrait: async () => image, picture: async () => image, banner: async () => image },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })
  return `http://127.0.0.1:${server.address().port}`
}

test('static tiers: shell and worker revalidate, hashed assets immutable, art gets a week plus ETag', async (t) => {
  const base = await startServer(t)

  const html = await fetch(`${base}/`)
  assert.equal(html.headers.get('cache-control'), 'no-cache')
  assert.ok(html.headers.get('etag'), 'shell carries an ETag so revalidation can 304')
  await html.text()

  const worker = await fetch(`${base}/sw.js`)
  assert.equal(worker.headers.get('cache-control'), 'no-cache')
  await worker.text()

  const bundle = await fetch(`${base}/assets/index-TESTHASH.js`)
  assert.equal(bundle.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  await bundle.text()

  const art = await fetch(`${base}/art/world-test.webp`)
  assert.equal(art.headers.get('cache-control'), 'public, max-age=604800')
  const artEtag = art.headers.get('etag')
  assert.ok(artEtag)
  assert.equal((await art.arrayBuffer()).byteLength, 5)

  const renewed = await fetch(`${base}/art/world-test.webp`, { headers: { 'If-None-Match': artEtag } })
  assert.equal(renewed.status, 304)
  assert.equal((await renewed.arrayBuffer()).byteLength, 0)
})

test('API images: versioned covers immutable, public images a day, private images private — all with ETag/304', async (t) => {
  const base = await startServer(t)

  const versioned = await fetch(`${base}/api/plaza/pub-1/cover?v=3`)
  assert.equal(versioned.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const versionedEtag = versioned.headers.get('etag')
  assert.ok(versionedEtag)
  await versioned.arrayBuffer()

  const plainCover = await fetch(`${base}/api/plaza/pub-1/cover`)
  assert.equal(plainCover.headers.get('cache-control'), 'public, max-age=86400')
  await plainCover.arrayBuffer()

  const portrait = await fetch(`${base}/api/users/user-2/portrait`)
  assert.equal(portrait.headers.get('cache-control'), 'public, max-age=86400')
  const portraitEtag = portrait.headers.get('etag')
  assert.ok(portraitEtag)
  await portrait.arrayBuffer()

  const renewed = await fetch(`${base}/api/users/user-2/portrait`, { headers: { 'If-None-Match': portraitEtag } })
  assert.equal(renewed.status, 304)
  assert.equal((await renewed.arrayBuffer()).byteLength, 0)

  const ownCover = await fetch(`${base}/api/cover?storyId=story-1`)
  assert.equal(ownCover.headers.get('cache-control'), 'private, max-age=86400')
  const ownEtag = ownCover.headers.get('etag')
  assert.ok(ownEtag)
  await ownCover.arrayBuffer()

  const ownRenewed = await fetch(`${base}/api/cover?storyId=story-1`, { headers: { 'If-None-Match': ownEtag } })
  assert.equal(ownRenewed.status, 304)

  const ownPortrait = await fetch(`${base}/api/avatar/image?which=current`)
  assert.equal(ownPortrait.headers.get('cache-control'), 'private, max-age=86400')
  await ownPortrait.arrayBuffer()
})

test('service worker v3: precached shell, capped media cache, private images excluded', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /const VERSION = 'storyweave-v3'/)
  assert.match(sw, /const MEDIA_CACHE = 'media-v1'/)
  assert.match(sw, /const MEDIA_MAX_BYTES = 40 \* 1024 \* 1024/)
  assert.match(sw, /const MEDIA_MAX_ENTRIES = 300/)
  assert.match(sw, /trimMediaCache/)
  assert.match(sw, /cache\.addAll/, 'install precaches the shell')
  assert.match(sw, /\[SHELL_CACHE, DATA_CACHE, MEDIA_CACHE\]/, 'activate keeps the media cache across shell versions')
  const mediaBlock = sw.slice(sw.indexOf('const MEDIA_PATHS'), sw.indexOf('const isMediaRequest'))
  assert.ok(!mediaBlock.includes('api/cover'), 'own-cover route is never media-cached')
  assert.ok(!mediaBlock.includes('avatar'), 'own-portrait route is never media-cached')
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /navigator\.storage\?\.persist/, 'the client asks for persistent storage')
})
