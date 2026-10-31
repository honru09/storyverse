// REQ-73 fixture server: REQ-70's wiring (memory stores, username
// sign-in) with a portrait painter keyed by a token in the avatar
// description, returning REAL production portraits:
//   REALJUZI      -> juzi-portrait.jpg      (white-matted poster, big head)
//   REALACAN      -> acan-portrait.jpg      (white ground, full body, small head)
//   REALZHIYAO    -> shenzhiyao-portrait.jpg (full-bleed scene, small face)
//   REALSHENYAN   -> shenyan-portrait.jpg   (beige-matted poster, long hair)
//   REALLUMING    -> luming-portrait.jpg    (white-matted poster, gold blocks)
//   REALQINJING   -> qinjing-portrait.jpg   (full-bleed poster)
// All six are the exact bytes served by production today. Because
// generation runs through the real avatar service, produce() bakes
// the REQ-73 derivatives at store time — the walk below therefore
// exercises the production code path end to end.
import fs from 'node:fs'
import { createServer } from '../server/index.js'
import { createAvatarService } from '../server/avatar.js'
import { createMemoryAvatarStore } from '../server/avatar-store.js'
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
const port = Number(process.env.PORT || 8975)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`avatar-derivatives fixture listening on http://127.0.0.1:${port}\n`)
})
