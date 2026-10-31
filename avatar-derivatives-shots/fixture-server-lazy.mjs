// Lazy-derivative fixture: REQ-73's fixture server PLUS an
// in-process planting port (loopback only, test scaffolding — not
// app code) that writes PRE-00055 account state into the very
// avatar store the server serves from: paintings stored directly
// (JPEG bytes, no derivative records, no bandChecked stamp) and
// collection items flipped to portrait.status='ready' by hand.
// Reads of those paintings must therefore run the full lazy path:
// band healing + derivative bake-on-read, exactly like a real
// legacy account on today's production.
import fs from 'node:fs'
import http from 'node:http'
import { createServer } from '../server/index.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore, imageSlotFor } from '../server/avatar-store.js'
import { createLibraryService } from '../server/library.js'
import { createMemoryLibraryStore } from '../server/library-store.js'
import { createPlazaService } from '../server/plaza.js'
import { createMemoryPlazaStore } from '../server/plaza-store.js'
import { createMemoryCoverStore } from '../server/cover-store.js'
import { createSocialService } from '../server/social.js'
import { createMemorySocialStore } from '../server/social-store.js'
import { createPlazaFeedService } from '../server/plaza-feed.js'
import { createMemoryPlazaFeedStore } from '../server/plaza-feed-store.js'
import { fileURLToPath } from 'node:url'

const paintings = {
  REALJUZI: fs.readFileSync(new URL('./juzi-portrait.jpg', import.meta.url)),
  REALACAN: fs.readFileSync(new URL('./acan-portrait.jpg', import.meta.url)),
  REALZHIYAO: fs.readFileSync(new URL('./shenzhiyao-portrait.jpg', import.meta.url)),
  REALSHENYAN: fs.readFileSync(new URL('./shenyan-portrait.jpg', import.meta.url)),
  REALLUMING: fs.readFileSync(new URL('./luming-portrait.jpg', import.meta.url)),
  REALQINJING: fs.readFileSync(new URL('./qinjing-portrait.jpg', import.meta.url)),
}

function paint(prompt) {
  const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt || '')
  for (const [token, buffer] of Object.entries(paintings)) {
    if (text.includes(token)) return { buffer, mimeType: 'image/jpeg', usage: null }
  }
  return { buffer: paintings.REALACAN, mimeType: 'image/jpeg', usage: null }
}

const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
const generator = {
  status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }),
  generate: async () => { throw new Error('fixture: generation must never be invoked by the walk') },
}

const avatarStore = createMemoryAvatarStore()
const plazaStore = createMemoryPlazaStore()
const coverStore = createMemoryCoverStore()
const feedStore = createMemoryPlazaFeedStore()
const socialStore = createMemorySocialStore()
const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore, socialStore })
const social = createSocialService({ env: {}, store: socialStore, plazaStore, avatarStore, feedStore })
const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore, avatarStore })

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const server = createServer({
  env,
  generator,
  distDir,
  library: createLibraryService({ env: {}, store: createMemoryLibraryStore() }),
  avatar: createAvatarService({
    env: { ...env, GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-fixture-123' },
    store: avatarStore,
    imageGenerate: async (prompt) => paint(prompt),
  }),
  plaza,
  plazaStore,
  coverStore,
  social,
  plazaFeed,
})
const port = Number(process.env.PORT || 8977)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`lazy fixture listening on http://127.0.0.1:${port}\n`)
})

// Planting port: POST /plant { uid, items: [{ avatarId, token }] }
// Writes each painting into the avatar's own image slot WITHOUT
// baking derivatives, and marks the collection items ready.
const plant = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/plant') { res.writeHead(404); res.end(); return }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', async () => {
    try {
      const { uid, items } = JSON.parse(body)
      const collection = await avatarStore.getCollection(uid)
      if (!collection) throw new Error(`no collection for ${uid}`)
      for (const { avatarId, token } of items) {
        const buffer = paintings[token]
        if (!buffer) throw new Error(`unknown token ${token}`)
        const slot = imageSlotFor(collection, avatarId, 'current')
        await avatarStore.putImage(uid, slot, {
          uid,
          slot,
          image: buffer.toString('base64'),
          contentType: 'image/jpeg',
          bytes: buffer.length,
          updatedAt: new Date().toISOString(),
        })
        const item = collection.avatars.find((a) => a.id === avatarId)
        if (item) item.portrait = { status: 'ready', version: 1 }
        process.stdout.write(`planted ${token} -> ${uid} slot ${slot}\n`)
      }
      await avatarStore.putCollection(uid, collection)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(error?.message || error) }))
    }
  })
})
plant.listen(port + 1, '127.0.0.1', () => {
  process.stdout.write(`plant port listening on http://127.0.0.1:${port + 1}\n`)
})
