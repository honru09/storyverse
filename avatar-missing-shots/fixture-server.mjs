// REQ-58 fixture: real server + memory stores + a painter that returns
// a marker PNG (colour keyed by the avatar's name in the prompt), so the
// walk can create avatars through the real UI without any AI backend.
import { PNG } from 'pngjs'
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

function markerPng(r, g, b) {
  const png = new PNG({ width: 576, height: 768 })
  for (let y = 0; y < 768; y += 1) {
    for (let x = 0; x < 576; x += 1) {
      const idx = (576 * y + x) << 2
      let cr = 226; let cg = 230; let cb = 238
      if (y > 120 && y < 700 && x > 168 && x < 408) { cr = r; cg = g; cb = b }
      if (y > 60 && y < 190 && x > 218 && x < 358) { cr = 46; cg = 42; cb = 40 }
      png.data[idx] = cr; png.data[idx + 1] = cg; png.data[idx + 2] = cb; png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

function paint(prompt) {
  const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt || '')
  const buffer = text.includes('沈砚') ? markerPng(44, 92, 168) : markerPng(198, 96, 44)
  return { buffer, mimeType: 'image/png', usage: null }
}

const env = { AUTH_ENABLED: 'true', DATA_STORE: 'memory' }
const generator = {
  status: () => ({ configured: false, provider: 'gemini', model: 'fixture' }),
  generate: async () => { throw new Error('fixture: story generation is out of scope for this walk') },
}

const avatarStore = createMemoryAvatarStore()
const plazaStore = createMemoryPlazaStore()
const coverStore = createMemoryCoverStore()
const feedStore = createMemoryPlazaFeedStore()
const socialStore = createMemorySocialStore()
const plaza = createPlazaService({ env: {}, store: plazaStore, avatarStore, coverStore, socialStore })
const social = createSocialService({ env: {}, store: socialStore, plazaStore, avatarStore, feedStore })
const plazaFeed = createPlazaFeedService({ env: {}, store: feedStore, books: plaza, socialStore: social })

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const server = createServer({
  env,
  generator,
  distDir,
  library: createLibraryService({ env: {}, store: createMemoryLibraryStore() }),
  avatar: createAvatarService({
    env: { ...env, GENAI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'project-fixture-123', AVATAR_DAILY_LIMIT: '50' },
    store: avatarStore,
    imageGenerate: async (prompt) => paint(prompt),
  }),
  plaza,
  plazaStore,
  coverStore,
  social,
  plazaFeed,
})
const port = Number(process.env.PORT || 8971)
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`req58 fixture listening on http://127.0.0.1:${port}\n`)
})
